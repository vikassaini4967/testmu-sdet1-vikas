import type { FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import fs from 'node:fs';
import path from 'node:path';
import { aiConfig, disabledReason } from '../ai/config.js';
import { resetBudget } from '../ai/budget.js';
import { activeProvider, addUsage } from '../ai/llm/client.js';
import type { Usage } from '../ai/llm/types.js';
import { appendRun, readFailures, testIdOf } from '../ai/history-store.js';
import { classifyRun, type RunClassification, type RunFailure } from '../ai/flaky-classifier.js';
import { VERDICTS, VERDICT_LABEL, type FailureRecord, type Verdict } from '../ai/types.js';

/**
 * Run-level reporter.
 *
 * Per-failure explanations are already attached to the HTML report by the
 * fixtures. This adds what you can't get from failures one at a time: a
 * single triage summary for the run — bucketed, with shared-cause detection,
 * self-healing proposals and cost — written to ai-reports/ and posted into the
 * CI job summary. It also records every test's outcome into the cross-run
 * history, which is what lets the next run's classifier tell flaky from broken.
 */
class AIReporter implements Reporter {
  private rootSuite!: Suite;
  private runId = '';
  private runStartedAt = 0;

  printsToStdio(): boolean {
    return false;
  }

  onBegin(_config: unknown, suite: Suite): void {
    this.rootSuite = suite;
    this.runStartedAt = Date.now();
    this.runId = `run-${this.runStartedAt}`;
    // Workers are forked after onBegin and inherit this.
    process.env.AI_RUN_ID = this.runId;
    resetBudget();
    fs.rmSync(path.join(aiConfig.paths.reportDir, 'explanations'), { recursive: true, force: true });
  }

  onTestEnd(_test: TestCase, _result: TestResult): void {}

  async onEnd(result: FullResult): Promise<void> {
    const tests = this.rootSuite.allTests();
    const failureRecords = readFailures().filter((r) => r.runId === this.runId);

    const failures: RunFailure[] = [];
    const knownDefects: { title: string; issue: string }[] = [];

    for (const test of tests) {
      const outcome = test.outcome();
      const { testId, file, project } = this.identify(test);

      if (outcome === 'expected' && test.expectedStatus === 'failed') {
        const issue = test.annotations.find((a) => a.type === 'issue')?.description ?? '';
        knownDefects.push({ title: test.title, issue });
      }

      if (outcome !== 'unexpected' && outcome !== 'flaky') continue;

      const records = failureRecords.filter((r) => r.testId === testId).sort((a, b) => b.retry - a.retry);
      const lastFailed = [...test.results].reverse().find((r) => r.status !== 'passed' && r.status !== 'skipped');
      failures.push({
        testId,
        testTitle: test.title,
        testFile: file,
        project,
        outcome,
        attempts: test.results.length,
        errorMessage:
          lastFailed?.error?.message ??
          records[0]?.errorMessage ??
          (test.expectedStatus === 'failed' ? 'Expected to fail (known defect), but passed — the defect may be fixed.' : 'No error message.'),
        explanation: records.find((r) => r.explanation)?.explanation ?? null,
      });
    }

    const classification = await classifyRun(failures, this.runId);
    const verdictOf = new Map<string, Verdict>();
    for (const verdict of VERDICTS) {
      for (const item of classification?.buckets[verdict] ?? []) verdictOf.set(item.testId, verdict);
    }

    // Record this run for the next one to learn from.
    for (const test of tests) {
      const { testId } = this.identify(test);
      appendRun({
        ts: Date.now(),
        runId: this.runId,
        testId,
        testTitle: test.title,
        outcome: test.outcome(),
        verdict: verdictOf.get(testId) ?? null,
      });
    }

    const counts = {
      total: tests.length,
      passed: tests.filter((t) => t.outcome() === 'expected').length,
      failed: tests.filter((t) => t.outcome() === 'unexpected').length,
      flaky: tests.filter((t) => t.outcome() === 'flaky').length,
      skipped: tests.filter((t) => t.outcome() === 'skipped').length,
    };

    const usage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
    for (const record of failureRecords) if (record.explanation) addUsage(usage, record.explanation.usage);
    if (classification) addUsage(usage, classification.usage);

    this.write(result, counts, failures, failureRecords, classification, knownDefects, usage);
  }

  private identify(test: TestCase) {
    const project = test.parent.project()?.name ?? 'default';
    const file = path.relative(process.cwd(), test.location.file).replace(/\\/g, '/');
    return { project, file, testId: testIdOf(file, test.title, project) };
  }

  private write(
    result: FullResult,
    counts: Record<string, number>,
    failures: RunFailure[],
    records: FailureRecord[],
    classification: RunClassification | null,
    knownDefects: { title: string; issue: string }[],
    usage: Usage,
  ): void {
    const provider = activeProvider();
    const skip = disabledReason();
    const lines: string[] = [
      '# AI triage report',
      '',
      `**Run:** \`${this.runId}\` · **status:** ${result.status} · ${counts.passed} passed, ${counts.failed} failed, ${counts.flaky} flaky, ${counts.skipped} skipped (${counts.total} total)`,
      `**Generated:** ${new Date().toISOString()} · **Model:** ${provider ? `\`${provider.info.id}/${provider.model}\`` : 'none'}`,
      '',
    ];

    if (skip) lines.push(`> AI triage was disabled for this run. ${skip}`, '');

    if (failures.length === 0) {
      lines.push('No failures to triage. ✅', '');
    }

    if (classification) {
      if (classification.sharedCause) {
        lines.push('## ⚠️ Shared cause detected', '', classification.sharedCause, '', '_Fix this first — the individual failures below are likely downstream of it._', '');
      }
      lines.push('## Run summary', '', classification.runSummary || '_No summary returned._', '');

      lines.push('## Buckets', '');
      for (const verdict of VERDICTS) {
        const bucket = classification.buckets[verdict];
        lines.push(`### ${VERDICT_LABEL[verdict]} (${bucket.length})`, '');
        if (!bucket.length) {
          lines.push('_None._', '');
          continue;
        }
        lines.push('| Test | Confidence | History (P/F/~) | Why |', '|---|---|---|---|');
        for (const item of bucket) {
          lines.push(`| ${esc(item.testTitle)} | ${item.confidence} | ${item.recentOutcomes || '—'} | ${esc(item.reasoning)} |`);
        }
        lines.push('');
      }
    }

    const heals = records.filter((r) => r.explanation?.healedLocator);
    if (heals.length) {
      lines.push(
        '## 🩹 Self-healing proposals',
        '',
        'Proposed, never auto-applied: a suite that silently repairs itself stops telling you the app changed. "Verified" means our code saw the locator match exactly one visible element on the live page at failure time.',
        '',
        '| Test | Proposed locator | Verified |',
        '|---|---|---|',
      );
      for (const r of heals) {
        const h = r.explanation!.healedLocator!;
        lines.push(`| ${esc(r.testTitle)} | \`${esc(h.expression)}\` | ${h.verified ? '✅ 1 visible match' : `❌ (${h.matches} matches)`} |`);
      }
      lines.push('');
    }

    if (knownDefects.length) {
      lines.push('## Known defects still reproducing', '', 'Marked `test.fail()` with an issue annotation; they flip to a failure the day the app is fixed.', '');
      for (const d of knownDefects) lines.push(`- ${d.title}${d.issue ? ` — ${d.issue}` : ''}`);
      lines.push('');
    }

    const explained = failures.filter((f) => f.explanation);
    if (explained.length) {
      lines.push('## Per-failure explanations', '');
      for (const f of explained) {
        const e = f.explanation!;
        lines.push(`### ${f.testTitle}`, '', `\`${f.testFile}\` · project \`${f.project}\``, '');
        if (e.error) {
          lines.push(`_AI triage unavailable: ${e.error}_`, '');
          continue;
        }
        lines.push(
          `**${e.summary}**`,
          '',
          `- **Verdict:** ${VERDICT_LABEL[e.verdict]} (${e.confidence} confidence)`,
          `- **Agent path:** ${e.steps} step(s) · ${e.toolsUsed.join(' → ') || 'no tools needed'}`,
          '',
          `**Root cause** — ${e.rootCause}`,
          '',
          `**Suggested fix**`,
          '',
          e.suggestedFix,
          '',
          '---',
          '',
        );
      }
    }

    lines.push(
      '## Cost',
      '',
      `${usage.calls} LLM call(s) · ${usage.inputTokens.toLocaleString()} input / ${usage.outputTokens.toLocaleString()} output tokens${
        provider?.info.id === 'gemini' || provider?.info.id === 'groq' || provider?.info.id === 'cerebras' ? ' · free tier' : ''
      }`,
      '',
    );

    fs.mkdirSync(aiConfig.paths.reportDir, { recursive: true });
    fs.writeFileSync(path.join(aiConfig.paths.reportDir, 'ai-report.md'), lines.join('\n'), 'utf8');
    fs.writeFileSync(
      path.join(aiConfig.paths.reportDir, 'ai-report.json'),
      JSON.stringify(
        {
          runId: this.runId,
          status: result.status,
          counts,
          model: provider ? `${provider.info.id}/${provider.model}` : null,
          sharedCause: classification?.sharedCause ?? null,
          runSummary: classification?.runSummary ?? null,
          buckets: classification?.buckets ?? null,
          knownDefects,
          failures,
          usage,
        },
        null,
        2,
      ),
      'utf8',
    );
    // eslint-disable-next-line no-console
    console.log(`\n  AI triage report → ${aiConfig.paths.reportDir}/ai-report.md\n`);
  }
}

const esc = (value: string) => (value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export default AIReporter;
