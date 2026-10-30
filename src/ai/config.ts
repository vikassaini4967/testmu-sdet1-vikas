import dotenv from 'dotenv';
import { resolveProvider, unresolvedReason } from './llm/providers.js';

dotenv.config({ quiet: true });

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const aiConfig = {
  /**
   * Hard cap on failures explained per run. Without it, one broken deploy
   * that fails 200 tests becomes 200 agent loops. Shared across Playwright
   * workers through slot files (see budget.ts), not an in-memory counter.
   */
  maxCallsPerRun: int('AI_MAX_CALLS_PER_RUN', 10),

  /** Max tool-use round trips the agent may take per failure. */
  maxAgentSteps: int('AI_MAX_AGENT_STEPS', 5),

  /**
   * Fallback for models with weak function calling: one prompt carrying all
   * the evidence instead of an agent loop. Worse and more expensive, but works
   * everywhere. `npm run verify:llm` tells you whether you need it.
   */
  disableTools: process.env.AI_DISABLE_TOOLS === '1',

  /** Truncation limits — keeps prompts cheap and the signal visible. */
  limits: {
    domChars: 6_000,
    bodyChars: 4_000,
    consoleLines: 40,
    networkEntries: 25,
    errorChars: 3_000,
  },

  paths: {
    historyDir: '.ai-history',
    failures: '.ai-history/failures.jsonl',
    runs: '.ai-history/runs.jsonl',
    budgetDir: '.ai-history/budget',
    reportDir: 'ai-reports',
  },
} as const;

/** Human-readable reason the AI layer is off, or null when it's on. */
export function disabledReason(): string | null {
  if (process.env.AI_EXPLAIN === '0') return 'AI_EXPLAIN=0 — AI layer explicitly disabled.';
  if (!resolveProvider()) return unresolvedReason();
  return null;
}

export function aiEnabled(): boolean {
  return disabledReason() === null;
}
