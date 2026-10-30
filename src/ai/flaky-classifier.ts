import { aiEnabled } from './config.js';
import { claimBudget } from './budget.js';
import { chat } from './llm/client.js';
import type { Usage } from './llm/types.js';
import { summarise } from './history-store.js';
import { VERDICTS, type Explanation, type Verdict } from './types.js';

/**
 * Run-level pass — the Option B half, riding on top of Option A.
 *
 * The per-failure agent sees ONE failure. This sees the whole run plus
 * cross-run history, which surfaces what no single explanation can:
 *   - 9 failures, all ECONNREFUSED       → one environment incident, not 9 bugs
 *   - failed on attempt 1, passed on 2   → flaky, with hard evidence
 *   - same test, same error, 6 runs      → a real bug nobody has fixed
 *
 * "Learns over runs" lives in the input: .ai-history accumulates every run's
 * outcomes AND this classifier's own verdicts, so the same failure is judged
 * differently in run 1 (no evidence) than in run 7 (a track record).
 */

export interface RunFailure {
  testId: string;
  testTitle: string;
  testFile: string;
  project: string;
  /** Final outcome: 'unexpected' = failed for good; 'flaky' = failed, then passed on retry. */
  outcome: 'unexpected' | 'flaky';
  attempts: number;
  errorMessage: string;
  explanation: Explanation | null;
}

export interface ClassifiedFailure {
  testId: string;
  testTitle: string;
  testFile: string;
  verdict: Verdict;
  confidence: string;
  reasoning: string;
  recentOutcomes: string;
}

export type Buckets = Record<Verdict, ClassifiedFailure[]>;

export interface RunClassification {
  buckets: Buckets;
  runSummary: string;
  sharedCause: string | null;
  usage: Usage;
  error?: string;
}

const SYSTEM_PROMPT = `You triage a whole automated test run at once, looking for patterns that are invisible when failures are read one at a time.

Priorities, in order:
1. Shared cause. If several failures share an error shape (connection refused, 502, 401 everywhere, the same timeout), say so: that is ONE incident, not N bugs. This is the most valuable thing you can spot.
2. Flakiness needs evidence. outcome "flaky" (failed, then passed on retry) is direct evidence and ALWAYS means flaky_test — if test code causes the flakiness, say so in the reasoning, but keep the bucket. history.recentOutcomes mixing P and F, or several distinct errors, is also evidence. The identical error in every recent run is NOT flaky — it is a persistent defect.
3. test_defect = the app behaved sanely and the test is wrong or outdated (renamed locator, changed copy, wrong expected status, missing setup). A renamed test id is test_defect, not real_bug. Use the per-failure verdict and summary as strong input; if the summary describes selector drift or another test-side mistake, prefer test_defect over real_bug.
4. Otherwise it is a real_bug. Under-reporting bugs is the expensive mistake.

Verdicts: real_bug | environment_issue | flaky_test | test_defect

Return ONLY a JSON object, no prose, no markdown fence:
{
  "runSummary": "<2 sentences on what this run says about the build>",
  "sharedCause": "<the one shared cause, or null>",
  "failures": [
    {"testId": "<copy exactly>", "verdict": "<verdict>", "confidence": "high|medium|low", "reasoning": "<one sentence citing the evidence>"}
  ]
}`;

function buildInput(failures: RunFailure[], runId: string): string {
  const payload = failures.map((f) => {
    const history = summarise(f.testId, runId);
    return {
      testId: f.testId,
      testTitle: f.testTitle,
      outcome: f.outcome,
      attempts: f.attempts,
      error: f.errorMessage.replace(/\u001b\[[0-9;]*m/g, '').slice(0, 500),
      perFailureAgent: f.explanation && !f.explanation.error
        ? { verdict: f.explanation.verdict, confidence: f.explanation.confidence, summary: f.explanation.summary }
        : null,
      history: history ?? 'no previous runs recorded',
    };
  });
  return `Failures in this run (${failures.length}):\n\n${JSON.stringify(payload, null, 2)}`;
}

const emptyBuckets = (): Buckets => ({ real_bug: [], environment_issue: [], flaky_test: [], test_defect: [] });

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(`No JSON object in model reply: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * When the LLM is unavailable, fall back to rules over the same evidence so
 * the report still has buckets. Clearly labelled as rule-based in the output.
 */
export function classifyByRules(failures: RunFailure[], runId: string, reason: string): RunClassification {
  const buckets = emptyBuckets();
  for (const f of failures) {
    const history = summarise(f.testId, runId);
    const verdict: Verdict =
      f.outcome === 'flaky'
        ? 'flaky_test'
        : f.explanation && !f.explanation.error
          ? f.explanation.verdict
          : /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|socket hang up|50[234]\b/i.test(f.errorMessage)
            ? 'environment_issue'
            : 'real_bug';
    buckets[verdict].push({
      testId: f.testId,
      testTitle: f.testTitle,
      testFile: f.testFile,
      verdict,
      confidence: 'low',
      reasoning: f.outcome === 'flaky' ? 'Failed, then passed on retry (rule-based).' : 'Rule-based fallback.',
      recentOutcomes: history?.recentOutcomes ?? '',
    });
  }
  return { buckets, runSummary: `Rule-based classification — ${reason}`, sharedCause: null, usage: { calls: 0, inputTokens: 0, outputTokens: 0 } };
}

export async function classifyRun(failures: RunFailure[], runId: string): Promise<RunClassification | null> {
  if (failures.length === 0) return null;
  if (!aiEnabled()) return classifyByRules(failures, runId, 'AI layer disabled for this run.');
  if (!claimBudget()) return classifyByRules(failures, runId, 'AI call budget exhausted before run-level classification.');

  try {
    const response = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildInput(failures, runId) }],
      json: true,
    });

    const parsed = extractJson(response.text) as {
      runSummary?: string;
      sharedCause?: string | null;
      failures?: { testId: string; verdict: string; confidence: string; reasoning: string }[];
    };

    const buckets = emptyBuckets();
    const seen = new Set<string>();
    for (const item of parsed.failures ?? []) {
      const source = failures.find((f) => f.testId === item.testId) ?? failures.find((f) => item.testId?.endsWith(f.testTitle));
      if (!source || seen.has(source.testId)) continue;
      seen.add(source.testId);
      const modelVerdict = (VERDICTS as readonly string[]).includes(item.verdict) ? (item.verdict as Verdict) : 'real_bug';
      // Hard evidence beats model judgement: failed-then-passed IS flaky. In
      // run 3 of the demo the model, told to prefer test_defect for test-side
      // causes, filed a retry-pass under test_defect. The prompt was fixed
      // too, but a guarantee belongs in code, not in a prompt.
      const verdict: Verdict = source.outcome === 'flaky' ? 'flaky_test' : modelVerdict;
      buckets[verdict].push({
        testId: source.testId,
        testTitle: source.testTitle,
        testFile: source.testFile,
        verdict,
        confidence: item.confidence ?? 'low',
        reasoning: item.reasoning ?? '',
        recentOutcomes: summarise(source.testId, runId)?.recentOutcomes ?? '',
      });
    }

    // Anything the model dropped still gets a bucket — never lose a failure.
    const missed = failures.filter((f) => !seen.has(f.testId));
    if (missed.length) {
      const fallback = classifyByRules(missed, runId, 'model omitted these');
      for (const verdict of VERDICTS) buckets[verdict].push(...fallback.buckets[verdict]);
    }

    const shared = parsed.sharedCause;
    return {
      buckets,
      runSummary: parsed.runSummary ?? '',
      sharedCause: shared && !/^null$/i.test(shared) ? shared : null,
      usage: response.usage,
    };
  } catch (error) {
    const result = classifyByRules(failures, runId, `LLM classification failed: ${(error as Error).message.slice(0, 200)}`);
    result.error = (error as Error).message;
    return result;
  }
}
