/**
 * Keeps the Task 2 artefacts honest with each other. Run: npm run check:trace
 *
 *  1. Every TC id in the .feature files exists in test-cases.json, and vice versa.
 *  2. Every TC id has an automated test whose title starts with it, and every
 *     TC id used in a spec title is documented — no orphan tests, no phantom cases.
 *  3. Every prompt file in prompts/test-generation/ appears VERBATIM in
 *     prompts.md, so the deliverable can't drift from what actually runs.
 *
 * Cheap, no network, runs in CI before the suite.
 */
import fs from 'node:fs';
import path from 'node:path';

const problems: string[] = [];
const ids = (text: string) => new Set(text.match(/TC-(?:LOGIN|DASH|API)-\d{3}/g) ?? []);
const read = (file: string) => fs.readFileSync(file, 'utf8');
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const featureIds = new Set(
  fs
    .readdirSync('test-cases')
    .filter((f) => f.endsWith('.feature'))
    .flatMap((f) => [...ids(read(path.join('test-cases', f)))]),
);

const json = JSON.parse(read('test-cases/test-cases.json')) as { modules: { cases: { id: string }[] }[] };
const jsonIds = new Set(json.modules.flatMap((m) => m.cases.map((c) => c.id)));

const specIds = new Set(
  walk('tests')
    .filter((f) => f.endsWith('.spec.ts') && !f.includes(`${path.sep}demo${path.sep}`))
    .flatMap((f) => [...read(f).matchAll(/test\(\s*[`'"](TC-[A-Z]+-\d{3})/g)].map((m) => m[1])),
);

const diff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();

for (const id of diff(featureIds, jsonIds)) problems.push(`${id} is in a .feature file but not in test-cases.json`);
for (const id of diff(jsonIds, featureIds)) problems.push(`${id} is in test-cases.json but in no .feature file`);
for (const id of diff(featureIds, specIds)) problems.push(`${id} has no automated test (no test title starts with it)`);
for (const id of diff(specIds, featureIds)) problems.push(`${id} is automated but not documented in test-cases/`);

const promptsMd = read('prompts.md').replace(/\r\n/g, '\n');
const promptDir = path.join('prompts', 'test-generation');
for (const file of fs.readdirSync(promptDir).filter((f) => f.endsWith('.md'))) {
  const body = read(path.join(promptDir, file)).replace(/\r\n/g, '\n').trim();
  if (!promptsMd.includes(body)) problems.push(`prompts.md does not contain ${file} verbatim`);
}

if (problems.length) {
  console.error(`\n✗ Traceability check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
console.log(`\n✓ ${featureIds.size} test case ids: feature ⇄ json ⇄ spec all match; prompts.md carries every prompt verbatim.\n`);
