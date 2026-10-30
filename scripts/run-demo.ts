/**
 * Runs the deliberately-failing demo specs so the AI layer can be seen working.
 *
 *   npm run demo              # run + open nothing; read ai-reports/ai-report.md
 *   npm run demo -- --capture # also copy the output into samples/ for the repo
 *
 * A script rather than `AI_DEMO=1 playwright test` so it works the same on
 * Windows, macOS and Linux without a cross-env dependency. Serial (one worker)
 * so a free-tier per-minute rate limit isn't hit by parallel agent loops.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { disabledReason } from '../src/ai/config.js';

const capture = process.argv.includes('--capture');
const reason = disabledReason();
if (reason) {
  console.error(`\n✗ The demo needs a live LLM. ${reason}\n  Then run: npm run verify:llm\n`);
  process.exit(1);
}

const result = spawnSync('npx', ['playwright', 'test', '--workers=1'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, AI_DEMO: '1' },
});

const report = path.join('ai-reports', 'ai-report.md');
if (!fs.existsSync(report)) {
  console.error('\n✗ No AI report was produced.\n');
  process.exit(1);
}

if (capture) {
  const out = path.join('samples', 'demo-run');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync('ai-reports', out, { recursive: true });
  console.log(`\nCaptured → ${out}/ (ai-report.md, ai-report.json, explanations/)`);
}

console.log(`\nDemo finished (Playwright exit ${result.status}: failures are expected).`);
console.log('  Run-level triage:  ai-reports/ai-report.md');
console.log('  Per-test:          npm run report → failing test → Attachments → ai-failure-explanation.md\n');
