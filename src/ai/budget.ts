import fs from 'node:fs';
import path from 'node:path';
import { aiConfig } from './config.js';

/**
 * Per-run cap on AI triage, shared by every Playwright worker.
 *
 * Workers are separate processes, so the counter has to live on disk. Each
 * claim creates `slot-N` with the exclusive `wx` flag, which the OS
 * guarantees only one process can win — no lockfile dependency, and no
 * read-modify-write race letting two workers take the same slot.
 */

export function resetBudget(): void {
  fs.rmSync(aiConfig.paths.budgetDir, { recursive: true, force: true });
  fs.mkdirSync(aiConfig.paths.budgetDir, { recursive: true });
}

export function claimBudget(): boolean {
  fs.mkdirSync(aiConfig.paths.budgetDir, { recursive: true });
  for (let slot = 0; slot < aiConfig.maxCallsPerRun; slot++) {
    try {
      fs.closeSync(fs.openSync(path.join(aiConfig.paths.budgetDir, `slot-${slot}`), 'wx'));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return false;
    }
  }
  return false;
}

export function budgetUsed(): number {
  try {
    return fs.readdirSync(aiConfig.paths.budgetDir).filter((f) => f.startsWith('slot-')).length;
  } catch {
    return 0;
  }
}
