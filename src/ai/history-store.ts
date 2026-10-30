import fs from 'node:fs';
import path from 'node:path';
import { aiConfig } from './config.js';
import type { FailureRecord, RunRecord } from './types.js';

/**
 * Append-only history that persists ACROSS runs (CI restores it from cache).
 *
 * Two logs, because they answer different questions:
 *  - failures.jsonl  (written by fixtures)  "what did each failure look like?"
 *  - runs.jsonl      (written by reporter)  "how did this test do, run by run?"
 *
 * Together they separate the cases one run can't:
 *   failed 3 of the last 10 runs, 3 different errors  → flaky
 *   failed 5 of the last 5 runs, the identical error  → a real bug nobody fixed
 *
 * JSONL because workers are separate processes appending concurrently; one
 * short appendFileSync line is effectively atomic, a rewritten JSON array is not.
 */

function append(file: string, record: unknown): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // History is a nice-to-have. Never fail a test run over it.
  }
}

function readJsonl<T>(file: string): T[] {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

export const appendFailure = (record: FailureRecord) => append(aiConfig.paths.failures, record);
export const appendRun = (record: RunRecord) => append(aiConfig.paths.runs, record);
export const readFailures = () => readJsonl<FailureRecord>(aiConfig.paths.failures);
export const readRuns = () => readJsonl<RunRecord>(aiConfig.paths.runs);

/** Stable identity for a test across runs — title alone collides across files. */
export function testIdOf(file: string, title: string, project: string): string {
  return `${project}::${file.replace(/\\/g, '/')}::${title}`;
}

export interface TestHistorySummary {
  testId: string;
  /** Previous runs this test took part in (skips excluded). */
  runsSeen: number;
  failedRuns: number;
  flakyRuns: number;
  passedRuns: number;
  /** Most recent last. P = passed, F = failed, ~ = flaky (failed then passed on retry). */
  recentOutcomes: string;
  distinctErrors: number;
  errorSamples: string[];
  priorVerdicts: string[];
}

/**
 * Pre-aggregated history for one test, excluding the current run. Handed to
 * the model as-is: raw rows would blow the context window and make the model
 * do arithmetic, which it is worse at than we are.
 */
export function summarise(testId: string, excludeRunId?: string): TestHistorySummary | null {
  const runs = readRuns().filter((r) => r.testId === testId && r.runId !== excludeRunId && r.outcome !== 'skipped');
  const failures = readFailures().filter((r) => r.testId === testId && r.runId !== excludeRunId);
  if (runs.length === 0 && failures.length === 0) return null;

  const errors = failures.map((r) => normaliseError(r.errorMessage));
  const symbol = { expected: 'P', unexpected: 'F', flaky: '~', skipped: '' } as const;

  return {
    testId,
    runsSeen: runs.length,
    failedRuns: runs.filter((r) => r.outcome === 'unexpected').length,
    flakyRuns: runs.filter((r) => r.outcome === 'flaky').length,
    passedRuns: runs.filter((r) => r.outcome === 'expected').length,
    recentOutcomes: runs.slice(-10).map((r) => symbol[r.outcome]).join(''),
    distinctErrors: new Set(errors).size,
    errorSamples: [...new Set(errors)].slice(0, 4),
    priorVerdicts: runs.map((r) => r.verdict).filter((v): v is NonNullable<typeof v> => !!v).slice(-5),
  };
}

/**
 * Strips the parts of an error that change on every run (timings, ids,
 * timestamps, ANSI colour) so "same error" means same error.
 */
export function normaliseError(message: string): string {
  return (message || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\b[0-9a-f]{24}\b/g, '<id>')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<ts>')
    .replace(/\b\d+(\.\d+)?ms\b/g, '<n>ms')
    .split('\n')
    .slice(0, 3)
    .join(' ')
    .slice(0, 200)
    .trim();
}
