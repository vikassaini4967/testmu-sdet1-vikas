import type { Usage } from './llm/types.js';

/** Everything the collectors scrape at the moment of failure. */
export interface FailureContext {
  testTitle: string;
  testFile: string;
  project: string;
  retry: number;
  durationMs: number;
  errorMessage: string;
  errorStack?: string;
  /** The spec lines around the failing statement, with the failing line marked. */
  sourceSnippet?: string;

  /** UI failures */
  url?: string;
  domSnapshot?: string;
  consoleLogs?: string[];
  networkFailures?: NetworkEntry[];
  selectorCandidates?: SelectorCandidate[];

  /** API failures */
  request?: { method: string; url: string; body?: string };
  response?: { status: number; statusText: string; body?: string; headers?: Record<string, string> };
}

export interface NetworkEntry {
  method: string;
  url: string;
  status: number | null;
  failure?: string;
}

export interface SelectorCandidate {
  selector: string;
  tag: string;
  text: string;
  attributes: Record<string, string>;
}

/**
 * Option B asks for three buckets. In practice the most common red build is
 * a fourth thing: the app is fine and the test is out of date (renamed test
 * id, changed copy, wrong expectation). Forcing that into "real bug" sends a
 * developer hunting a defect that doesn't exist; calling it "flaky" is simply
 * wrong — it fails every time. So it gets its own bucket.
 */
export type Verdict = 'real_bug' | 'environment_issue' | 'flaky_test' | 'test_defect';

export const VERDICTS: readonly Verdict[] = ['real_bug', 'environment_issue', 'flaky_test', 'test_defect'];

export const VERDICT_LABEL: Record<Verdict, string> = {
  real_bug: '🐞 Real bug',
  environment_issue: '🌍 Environment issue',
  flaky_test: '🎲 Flaky test',
  test_defect: '🧪 Test defect (app OK, test is wrong/outdated)',
};

/** A live locator check the agent ran against the page at failure time. */
export interface LocatorProbe {
  expression: string;
  count: number;
  visible: boolean;
  outerHtml?: string;
  error?: string;
}

/** The structured thing the agent produces for a single failure. */
export interface Explanation {
  summary: string;
  rootCause: string;
  suggestedFix: string;
  verdict: Verdict;
  confidence: 'high' | 'medium' | 'low';
  /**
   * Replacement locator proposed by the agent. `verified` is set by OUR code
   * from the probe log, never from the model's own claim.
   */
  healedLocator?: { expression: string; verified: boolean; matches: number };
  /** Tool names the agent chose to call, in order — shows the agentic path. */
  toolsUsed: string[];
  probes: LocatorProbe[];
  steps: number;
  provider: string;
  model: string;
  usage: Usage;
  error?: string;
}

/** One line in .ai-history/failures.jsonl — one per failed attempt. */
export interface FailureRecord {
  ts: number;
  runId: string;
  testId: string;
  testTitle: string;
  testFile: string;
  project: string;
  retry: number;
  errorMessage: string;
  explanation: Explanation | null;
}

/** One line in .ai-history/runs.jsonl — one per test per run, written by the reporter. */
export interface RunRecord {
  ts: number;
  runId: string;
  testId: string;
  testTitle: string;
  /** Playwright's outcome: flaky = failed then passed on retry. */
  outcome: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  verdict: Verdict | null;
}
