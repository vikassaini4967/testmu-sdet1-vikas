import { aiConfig, aiEnabled } from './config.js';
import { claimBudget } from './budget.js';
import { activeProvider, addUsage, chat } from './llm/client.js';
import type { ChatMessage, ToolSpec, Usage } from './llm/types.js';
import { summarise, testIdOf } from './history-store.js';
import { truncate, type LocatorProbeFn, type LocatorStrategy } from './context-collector.js';
import { VERDICTS, type Explanation, type FailureContext, type LocatorProbe, type Verdict } from './types.js';

/**
 * ===========================================================================
 * WHY OPTION A (Failure Explainer) AND NOT OPTION B
 * ===========================================================================
 * The ticket says the team loses time "writing and FIXING regression tests".
 * Fixing is the expensive half, and most of it is diagnosis: the 10–20 minutes
 * between "CI is red" and "oh, the test id was renamed". A flaky classifier
 * (Option B) produces a label; a human still opens the trace to find out why.
 * The explainer attacks the diagnosis itself.
 *
 * It also fails in the safer direction. A wrong explanation costs a few
 * seconds and a bad paragraph. A classifier that wrongly files a real bug as
 * "flaky" gets that bug ignored — a false negative that ships defects. Given
 * one choice, I'd rather the AI advise than decide.
 *
 * B is still valuable, so it rides along at run level (flaky-classifier.ts),
 * fed by cross-run history the per-failure agent can also query. A is the
 * deliverable; B reuses its output.
 *
 * ===========================================================================
 * WHY AN AGENT LOOP RATHER THAN ONE PROMPT
 * ===========================================================================
 * One prompt forces a bad choice: stuff every artefact in (expensive, the
 * signal drowns) or guess which one matters (often wrong). Instead the model
 * gets a thin summary plus TOOLS and pulls only what it needs:
 *   locator timeout     → get_selector_candidates, then probe_locator to
 *                         CHECK its proposed fix against the live page
 *   unexpected 4xx/5xx  → get_response_body
 *   "is this new?"      → get_failure_history (cross-run)
 * Most failures resolve in 1–3 tool calls, so the common case is cheaper than
 * the stuffed prompt. AI_DISABLE_TOOLS=1 falls back to the stuffed prompt for
 * models whose function calling is unreliable.
 */

const SYSTEM_PROMPT = `You are a senior SDET triaging one automated test failure in a Playwright + TypeScript suite. Be terse and concrete: an engineer reads this at 9am and needs to know what to change.

You receive a failure summary (error, failing source line) and tools that fetch more evidence. Call a tool when the answer depends on evidence you do not have; do not call one whose result you can already infer.

How to judge:
- A locator timeout or "element(s) not found" is usually selector drift, not a slow app. Look at the selector candidates before blaming timing.
- If you propose a replacement locator, you MUST first check it with probe_locator. Only propose one that resolved to exactly 1 visible element.
- The verdict is about WHERE the defect is. If the app works and the test is wrong or outdated — a renamed/wrong locator, changed copy, a wrong expected status, a missing setup step — the verdict is test_defect, even when you can name the change.
- real_bug only when the APP misbehaves: a 5xx, a crash, wrong data, or a layout/behaviour defect a user would notice.
- Connection refused, DNS, timeouts to the host, 502/503 → environment_issue.
- Never call something flaky without evidence of intermittency (history with mixed pass/fail, or differing errors). One failure is not flaky.
- The fix must preserve what the test is trying to prove. If a precondition is missing (no token, no data), fix the setup — never weaken or invert the assertion just to make the test pass.
- The fix must be a concrete code change (a diff against the failing line is ideal) or one specific thing to check. Never "investigate further".

Verdicts:
real_bug | environment_issue | flaky_test | test_defect

End your reply with exactly this block and nothing after it:
<verdict>one verdict</verdict>
<confidence>high|medium|low</confidence>
<summary>one sentence, max 25 words</summary>
<root_cause>2-4 sentences</root_cause>
<suggested_fix>concrete change; a small diff if useful</suggested_fix>
<healed_locator>the verified replacement locator expression exactly as probe_locator echoed it, or none</healed_locator>`;

const FINAL_NUDGE =
  'You have used all evidence-gathering steps. Do not call any more tools. Give your final answer now, ending with the required block.';

const REPAIR_PROMPT =
  'Your reply did not end with the required <verdict>…</healed_locator> block. Reply with ONLY that block — all six tags, nothing before or after — based on the analysis you already did.';

const hasVerdictBlock = (text: string) => /<verdict>\s*[a-z_]+\s*<\/verdict>/i.test(text);

export interface LiveTools {
  /** Present for UI failures while the page is still open. */
  probeLocator?: LocatorProbeFn;
}

/* ----------------------------------------------------------------- tools */

const noArgs = { type: 'object', properties: {}, required: [] };

function buildTools(ctx: FailureContext, live: LiveTools): ToolSpec[] {
  const tools: ToolSpec[] = [
    {
      name: 'get_failure_history',
      description:
        'How THIS test did in previous runs: runs seen, failed/flaky/passed counts, recent outcomes (P/F/~), distinct error count and prior verdicts. Use it to tell flaky from persistently broken.',
      parameters: noArgs,
    },
  ];

  if (ctx.selectorCandidates?.length) {
    tools.push({
      name: 'get_selector_candidates',
      description:
        'Interactive elements on the page at failure time with id/name/role/data-testid/placeholder. Use when a locator timed out or matched nothing.',
      parameters: {
        type: 'object',
        properties: { filter: { type: 'string', description: 'Optional case-insensitive substring to match tag, text or attributes.' } },
        required: [],
      },
    });
  }

  if (live.probeLocator) {
    tools.push({
      name: 'probe_locator',
      description:
        'Runs a Playwright locator against the LIVE page at failure time and returns how many elements match, whether the first is visible, and its HTML. Use it to verify a replacement locator before proposing it.',
      parameters: {
        type: 'object',
        properties: {
          strategy: { type: 'string', enum: ['testid', 'role', 'text', 'label', 'placeholder', 'css'] },
          value: { type: 'string', description: 'Test id, ARIA role, text, label, placeholder or CSS selector.' },
          name: { type: 'string', description: 'Accessible name — only with strategy "role".' },
        },
        required: ['strategy', 'value'],
      },
    });
  }

  if (ctx.domSnapshot) {
    tools.push({
      name: 'get_dom_snapshot',
      description:
        'Sanitised HTML of the app root at failure time. Use for structure — e.g. "element missing" vs "present but hidden".',
      parameters: {
        type: 'object',
        properties: { search: { type: 'string', description: 'Optional substring; returns the matching region only.' } },
        required: [],
      },
    });
  }

  if (ctx.consoleLogs?.length || ctx.networkFailures?.length) {
    tools.push({
      name: 'get_browser_logs',
      description: 'Console errors/warnings and failed or non-2xx network requests captured during the test.',
      parameters: noArgs,
    });
  }

  if (ctx.response) {
    tools.push({
      name: 'get_response_body',
      description: 'The full HTTP request and response of the last API call: status, headers, body.',
      parameters: noArgs,
    });
  }

  return tools;
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: FailureContext,
  live: LiveTools,
  probes: LocatorProbe[],
  runId: string,
): Promise<string> {
  switch (name) {
    case 'get_failure_history': {
      const summary = summarise(testIdOf(ctx.testFile, ctx.testTitle, ctx.project), runId);
      return summary
        ? JSON.stringify(summary, null, 2)
        : 'No history for this test: it has never run (or never failed) before this run.';
    }

    case 'get_selector_candidates': {
      const filter = String(input.filter ?? '').toLowerCase();
      let items = ctx.selectorCandidates ?? [];
      if (filter) {
        items = items.filter((c) => `${c.tag} ${c.text} ${JSON.stringify(c.attributes)}`.toLowerCase().includes(filter));
      }
      if (!items.length) return `No elements matched "${filter}". Call again without a filter to see all.`;
      return JSON.stringify(items.slice(0, 40), null, 2);
    }

    case 'probe_locator': {
      if (!live.probeLocator) return 'probe_locator is not available for this failure.';
      const probe = await live.probeLocator({
        strategy: String(input.strategy ?? 'css') as LocatorStrategy,
        value: String(input.value ?? ''),
        name: input.name ? String(input.name) : undefined,
      });
      probes.push(probe);
      return JSON.stringify(probe, null, 2);
    }

    case 'get_dom_snapshot': {
      const search = String(input.search ?? '');
      const dom = ctx.domSnapshot ?? '';
      if (!search) return truncate(dom, 4_000) ?? '';
      const idx = dom.toLowerCase().indexOf(search.toLowerCase());
      if (idx === -1) return `"${search}" does not appear anywhere in the DOM at failure time.`;
      return dom.slice(Math.max(0, idx - 800), idx + 1_600);
    }

    case 'get_browser_logs':
      return JSON.stringify({ consoleLogs: ctx.consoleLogs ?? [], networkFailures: ctx.networkFailures ?? [] }, null, 2);

    case 'get_response_body':
      return JSON.stringify({ request: ctx.request, response: ctx.response }, null, 2);

    default:
      return `Unknown tool: ${name}`;
  }
}

/* -------------------------------------------------------------- parsing */

function tagValue(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

const normaliseExpression = (s: string) => s.replace(/`/g, '').replace(/"/g, "'").replace(/\s+/g, '').replace(/;$/, '');

function parseExplanation(
  text: string,
  meta: Pick<Explanation, 'toolsUsed' | 'probes' | 'steps' | 'provider' | 'model' | 'usage'>,
): Explanation {
  const rawVerdict = tagValue(text, 'verdict').toLowerCase() as Verdict;
  // Unparseable → real_bug: a mislabelled bug costs more than a mislabelled flake.
  const verdict: Verdict = VERDICTS.includes(rawVerdict) ? rawVerdict : 'real_bug';

  const rawConfidence = tagValue(text, 'confidence').toLowerCase();
  const confidence = (['high', 'medium', 'low'] as const).find((c) => c === rawConfidence) ?? 'low';

  const healedRaw = tagValue(text, 'healed_locator');
  let healedLocator: Explanation['healedLocator'];
  if (healedRaw && !/^none\.?$/i.test(healedRaw)) {
    // Trust our probe log, not the model's say-so.
    const probe = meta.probes.find((p) => normaliseExpression(p.expression) === normaliseExpression(healedRaw));
    healedLocator = {
      expression: healedRaw.replace(/`/g, ''),
      verified: !!probe && probe.count === 1 && probe.visible,
      matches: probe?.count ?? -1,
    };
  }

  return {
    summary: tagValue(text, 'summary') || 'Model did not return a structured summary.',
    rootCause: tagValue(text, 'root_cause') || text.slice(0, 600) || 'Model returned no text.',
    suggestedFix: tagValue(text, 'suggested_fix') || 'No fix suggested.',
    verdict,
    confidence,
    healedLocator,
    ...meta,
  };
}

/* ------------------------------------------------------------ the agent */

function openingMessage(ctx: FailureContext): string {
  const lines = [
    `Test: ${ctx.testTitle}`,
    `File: ${ctx.testFile}`,
    `Project: ${ctx.project}  |  Attempt: ${ctx.retry + 1}  |  Duration: ${ctx.durationMs}ms`,
    ctx.url ? `Page URL at failure: ${ctx.url}` : null,
    ctx.request ? `Last request: ${ctx.request.method} ${ctx.request.url}` : null,
    ctx.response ? `Last response: ${ctx.response.status} ${ctx.response.statusText}` : null,
    '',
    'Error:',
    truncate(ctx.errorMessage, aiConfig.limits.errorChars) ?? '(no message)',
    ctx.sourceSnippet ? `\nFailing source (">" marks the failing line):\n${ctx.sourceSnippet}` : null,
  ].filter((line) => line !== null);

  return `${lines.join('\n')}\n\nDiagnose this failure.`;
}

/** Everything at once — the AI_DISABLE_TOOLS fallback. */
function stuffedMessage(ctx: FailureContext, runId: string): string {
  const history = summarise(testIdOf(ctx.testFile, ctx.testTitle, ctx.project), runId);
  const sections = [
    openingMessage(ctx),
    `\nFailure history:\n${history ? JSON.stringify(history) : 'none'}`,
    ctx.selectorCandidates?.length ? `\nSelector candidates:\n${JSON.stringify(ctx.selectorCandidates.slice(0, 40))}` : '',
    ctx.domSnapshot ? `\nDOM (truncated):\n${truncate(ctx.domSnapshot, 3_000)}` : '',
    ctx.consoleLogs?.length || ctx.networkFailures?.length
      ? `\nBrowser logs:\n${JSON.stringify({ console: ctx.consoleLogs, network: ctx.networkFailures })}`
      : '',
    ctx.response ? `\nHTTP exchange:\n${JSON.stringify({ request: ctx.request, response: ctx.response })}` : '',
    '\n(No tools are available: you cannot verify a locator, so <healed_locator> must be none.)',
  ];
  return sections.join('\n');
}

function unavailable(summary: string, rootCause: string, meta: Partial<Explanation> = {}): Explanation {
  const provider = activeProvider();
  return {
    summary,
    rootCause,
    suggestedFix: 'The test result itself is unaffected.',
    verdict: 'real_bug',
    confidence: 'low',
    toolsUsed: [],
    probes: [],
    steps: 0,
    provider: provider?.info.id ?? 'none',
    model: provider?.model ?? 'none',
    usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
    error: rootCause,
    ...meta,
  };
}

/**
 * Runs the agent loop for one failure. Never throws — a failing LLM call must
 * not change the outcome of the test run.
 */
export async function explainFailure(
  ctx: FailureContext,
  live: LiveTools = {},
  runId = '',
): Promise<Explanation | null> {
  if (!aiEnabled()) return null;

  if (!claimBudget()) {
    return unavailable(
      'AI triage budget for this run was exhausted.',
      `More than AI_MAX_CALLS_PER_RUN (${aiConfig.maxCallsPerRun}) failures needed triage. When this many tests fail at once it is almost always one shared cause — read the run-level report first.`,
    );
  }

  const provider = activeProvider()!;
  const usage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const toolsUsed: string[] = [];
  const probes: LocatorProbe[] = [];
  const meta = () => ({ toolsUsed, probes, provider: provider.info.id, model: provider.model, usage });

  try {
    if (aiConfig.disableTools) {
      const response = await chat({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: stuffedMessage(ctx, runId) }],
      });
      addUsage(usage, response.usage);
      return parseExplanation(response.text, { ...meta(), steps: 1 });
    }

    const tools = buildTools(ctx, live);
    const messages: ChatMessage[] = [{ role: 'user', content: openingMessage(ctx) }];

    for (let step = 1; step <= aiConfig.maxAgentSteps; step++) {
      const isLastStep = step === aiConfig.maxAgentSteps;
      if (isLastStep && toolsUsed.length) messages.push({ role: 'user', content: FINAL_NUDGE });

      const response = await chat({
        system: SYSTEM_PROMPT,
        messages,
        tools,
        // Final step: tools stay defined (some APIs reject tool turns without
        // them) but may not be called, forcing a conclusion.
        toolChoice: isLastStep ? 'none' : 'auto',
      });
      addUsage(usage, response.usage);

      if (response.toolCalls.length && !isLastStep) {
        messages.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls, raw: response.raw });
        for (const call of response.toolCalls) {
          toolsUsed.push(call.name);
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            name: call.name,
            content: await runTool(call.name, call.arguments, ctx, live, probes, runId),
          });
        }
        continue;
      }

      if (hasVerdictBlock(response.text)) return parseExplanation(response.text, { ...meta(), steps: step });

      // Observed with gpt-oss on Groq: the right diagnosis, written as markdown
      // instead of the tag block (or cut off mid-answer). Defaulting that to
      // real_bug would misfile a correct diagnosis, so ask once to reformat.
      messages.push({ role: 'assistant', content: response.text }, { role: 'user', content: REPAIR_PROMPT });
      const repaired = await chat({ system: SYSTEM_PROMPT, messages, tools, toolChoice: 'none', maxTokens: 2048 });
      addUsage(usage, repaired.usage);
      toolsUsed.push('(format repair)');
      return parseExplanation(hasVerdictBlock(repaired.text) ? repaired.text : response.text, { ...meta(), steps: step + 1 });
    }

    return parseExplanation('', { ...meta(), steps: aiConfig.maxAgentSteps });
  } catch (error) {
    return unavailable('AI triage unavailable for this failure.', `The LLM call failed: ${(error as Error).message}`, {
      ...meta(),
      steps: 0,
    });
  }
}
