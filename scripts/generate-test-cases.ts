/**
 * Runs the Task 2 prompts against the configured LLM — the "we'll run your
 * prompts ourselves" path, as one command.
 *
 *   npm run generate:cases                         # fresh run
 *   npm run generate:cases -- --resume <run dir>   # continue a run that stopped
 *
 * Sends prompts/test-generation/00…04 in order as ONE conversation (later
 * prompts say "same system, same role" and depend on the earlier turns), and
 * writes every reply verbatim to test-cases/generated/<run>/. Raw output is
 * never edited; the curated, automated cases live in test-cases/*.feature and
 * prompts.md records what changed between the two.
 *
 * The final JSON-conversion step is sent COMPACT: just the three feature files
 * plus the prompt, not the whole conversation. On a free tier the full history
 * is ~11k tokens by then — over Groq's 8k tokens-per-minute cap for one
 * request — and the conversion needs only the Gherkin anyway. Pasting the
 * prompts into a chat UI in one conversation works the same without this.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chat, getProcessUsage } from '../src/ai/llm/client.js';
import { resolveProvider, unresolvedReason } from '../src/ai/llm/providers.js';
import type { ChatMessage, LlmError } from '../src/ai/llm/types.js';
import '../src/ai/config.js';

const PROMPT_DIR = path.join('prompts', 'test-generation');

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const provider = resolveProvider();
  if (!provider) {
    console.error(`\n✗ ${unresolvedReason()}\n`);
    process.exit(1);
  }

  const system = fs.readFileSync(path.join(PROMPT_DIR, 'system.md'), 'utf8').trim();
  const steps = fs
    .readdirSync(PROMPT_DIR)
    .filter((f) => /^\d{2}-.*\.md$/.test(f))
    .sort();

  const resume = argValue('--resume');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = resume ?? path.join('test-cases', 'generated', `${stamp}_${provider.info.id}`);
  fs.mkdirSync(outDir, { recursive: true });

  // Snapshot the exact prompts this run used, so the output stays traceable
  // after the prompt files are edited.
  if (!resume) fs.cpSync(PROMPT_DIR, path.join(outDir, 'prompts-used'), { recursive: true });

  const runFile = path.join(outDir, 'run.json');
  const previous = fs.existsSync(runFile) ? (JSON.parse(fs.readFileSync(runFile, 'utf8')) as { steps: StepLog[] }) : null;
  const log: StepLog[] = previous?.steps ?? [];

  console.log(`\n${resume ? 'Resuming' : 'Running'} ${steps.length} prompts on ${provider.info.id}/${provider.model} → ${outDir}\n`);

  const messages: ChatMessage[] = [];
  const featureOutputs: string[] = [];

  for (const file of steps) {
    const prompt = fs.readFileSync(path.join(PROMPT_DIR, file), 'utf8').trim();
    const isConversion = file.includes('to-json');
    const outputFile = file.replace(/\.md$/, isConversion ? '.output.json' : '.output.md');
    const outputPath = path.join(outDir, outputFile);

    if (resume && fs.existsSync(outputPath)) {
      const saved = fs.readFileSync(outputPath, 'utf8').trim();
      messages.push({ role: 'user', content: prompt }, { role: 'assistant', content: saved });
      if (/^0[1-3]-/.test(file)) featureOutputs.push(saved);
      console.log(`  ${file.padEnd(18)} … reused from ${outputFile}`);
      continue;
    }

    const started = Date.now();
    process.stdout.write(`  ${file.padEnd(18)} … `);

    let text: string;
    let outputTokens: number;
    let mode: StepLog['mode'] = isConversion ? 'compact' : 'conversation';
    let model = provider.model;

    if (isConversion) {
      try {
        const response = await chat(
          { system, messages: [{ role: 'user', content: `${featureOutputs.join('\n\n')}\n\n---\n\n${prompt}` }], maxTokens: 7_000 },
          { maxRetryWaitMs: 180_000 },
        );
        ({ text, model } = response);
        outputTokens = response.usage.outputTokens;
      } catch (error) {
        if ((error as LlmError).status !== 413) throw error;
        // Too large for one request on this tier: convert per module, merge in code.
        process.stdout.write('too large for one request → per module … ');
        mode = 'per-module';
        const parts = [];
        outputTokens = 0;
        for (const feature of featureOutputs) {
          const response = await chat(
            {
              system,
              messages: [{ role: 'user', content: `${feature}\n\n---\n\n${prompt}\n\n${PER_MODULE_NOTE}` }],
              // No strict JSON mode: Groq rejects the whole reply if it is cut
              // short; parseJsonObject() extracts the object leniently instead.
              maxTokens: 5_000,
            },
            { maxRetryWaitMs: 180_000 },
          );
          parts.push(parseJsonObject(response.text));
          outputTokens += response.usage.outputTokens;
          model = response.model;
        }
        text = JSON.stringify(mergeModules(parts), null, 2);
      }
    } else {
      let response;
      try {
        response = await chat({ system, messages: [...messages, { role: 'user', content: prompt }], maxTokens: 6_000 }, { maxRetryWaitMs: 180_000 });
      } catch (error) {
        if ((error as LlmError).status !== 413) throw error;
        // Over the provider's per-request limit: keep the facts (step 00) and
        // every prompt, but elide earlier MODULE outputs — a module needs the
        // output contract, not the previous module's scenarios.
        process.stdout.write('too large → eliding earlier module outputs … ');
        mode = 'compacted-history';
        const compacted = messages.map((m, i) =>
          m.role === 'assistant' && i > 1 ? { ...m, content: '[earlier module output omitted to fit the provider token limit]' } : m,
        );
        response = await chat({ system, messages: [...compacted, { role: 'user', content: prompt }], maxTokens: 6_000 }, { maxRetryWaitMs: 180_000 });
      }
      ({ text, model } = response);
      outputTokens = response.usage.outputTokens;
      if (response.stopReason === 'max_tokens') process.stdout.write('⚠ TRUNCATED · ');
    }

    messages.push({ role: 'user', content: prompt }, { role: 'assistant', content: text });
    if (/^0[1-3]-/.test(file)) featureOutputs.push(text);
    fs.writeFileSync(outputPath, text + '\n', 'utf8');

    const seconds = Math.round((Date.now() - started) / 1000);
    log.push({ prompt: file, outputFile, seconds, outputTokens, mode, model });
    console.log(`${seconds}s · ${outputTokens} tokens`);
  }

  fs.writeFileSync(
    runFile,
    JSON.stringify({ ranAt: new Date().toISOString(), provider: provider.info.id, model: provider.model, steps: log, usageThisInvocation: getProcessUsage() }, null, 2),
  );
  console.log(`\n✓ Raw output saved to ${outDir}/ — compare with the curated cases in test-cases/.\n`);
}

interface StepLog {
  prompt: string;
  outputFile: string;
  seconds: number;
  outputTokens: number;
  mode?: 'conversation' | 'compacted-history' | 'compact' | 'per-module';
  model?: string;
}

/** Appended by the script (not part of the prompt file) only in per-module mode. */
const PER_MODULE_NOTE =
  '(This request contains ONE of the three feature files, to fit a free-tier token limit. Return the same shape with a single entry in "modules"; the script merges the three and computes "coverage" itself.)';

type Converted = { modules?: { name: string; cases: { priority?: string }[] }[]; warnings?: string[] };

function parseJsonObject(text: string): Converted {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return JSON.parse(text.slice(start, end + 1)) as Converted;
}

/** Merging and counting is arithmetic — done here, not by the model. */
function mergeModules(parts: Converted[]) {
  const modules = parts.flatMap((p) => p.modules ?? []);
  const cases = modules.flatMap((m) => m.cases);
  const byPriority: Record<string, number> = {};
  for (const c of cases) byPriority[c.priority ?? 'unset'] = (byPriority[c.priority ?? 'unset'] ?? 0) + 1;
  return {
    modules,
    coverage: {
      total: cases.length,
      byModule: Object.fromEntries(modules.map((m) => [m.name, m.cases.length])),
      byPriority,
    },
    warnings: parts.flatMap((p) => p.warnings ?? []),
    $generatedBy: 'per-module conversion merged by scripts/generate-test-cases.ts (provider token limit)',
  };
}

main().catch((error) => {
  console.error(`\n✗ ${(error as Error).message}\n`);
  process.exit(1);
});
