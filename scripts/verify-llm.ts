/**
 * Pre-flight for the AI layer. Run with: npm run verify:llm
 *
 * Two checks, and the second is the one that matters:
 *  1. Basic completion — the key and model id work.
 *  2. Tool calling — the model actually CALLS a tool when it should. The
 *     failure explainer is an agent loop; a model that answers in prose
 *     instead of calling tools makes it useless. If this fails, switch model
 *     or set AI_DISABLE_TOOLS=1.
 */
import { aiConfig } from '../src/ai/config.js';
import { chat, getProcessUsage } from '../src/ai/llm/client.js';
import { listModels } from '../src/ai/llm/openai-compatible.js';
import { PROVIDERS, resolveProvider, unresolvedReason } from '../src/ai/llm/providers.js';
import { LlmError } from '../src/ai/llm/types.js';

function printProviderTable(): void {
  console.log('\nProviders (set one key in .env; AI_PROVIDER picks explicitly):\n');
  for (const p of Object.values(PROVIDERS)) {
    const has = process.env[p.keyEnv] ? '✓ key set' : p.keyOptional ? '  (no key needed)' : '  –';
    console.log(`  ${p.id.padEnd(11)} ${has.padEnd(18)} ${p.keyEnv.padEnd(19)} free: ${p.free.padEnd(36)} ${p.signup}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const provider = resolveProvider();
  if (!provider) {
    printProviderTable();
    console.error(`✗ ${unresolvedReason()}\n`);
    process.exit(1);
  }

  console.log(`\nProvider: ${provider.info.label} (${provider.info.id})`);
  console.log(`Model:    ${provider.model}${provider.reasoningEffort ? `  · reasoning_effort=${provider.reasoningEffort}` : ''}`);
  console.log(`Endpoint: ${provider.baseUrl}\n`);

  // 1. Basic completion
  const basic = await chat({
    system: 'You are verifying an API connection. Answer in one short sentence.',
    messages: [{ role: 'user', content: 'Reply with exactly: connection verified.' }],
    maxTokens: 512,
  });
  console.log(`✓ 1/2 completion — "${basic.text.slice(0, 80)}" (served by ${basic.model})`);

  // 2. Tool calling
  const tool = await chat({
    system: 'You are a test triage agent. Always use the available tools to look up facts; never guess.',
    messages: [{ role: 'user', content: 'How many times has test TC-LOGIN-001 failed? Use the tool.' }],
    tools: [
      {
        name: 'get_failure_history',
        description: 'Returns the failure count for a test id.',
        parameters: { type: 'object', properties: { test_id: { type: 'string' } }, required: ['test_id'] },
      },
    ],
    maxTokens: 1024,
  });

  const call = tool.toolCalls[0];
  if (call) {
    console.log(`✓ 2/2 tool calling — model called ${call.name}(${JSON.stringify(call.arguments)})`);
  } else {
    console.log(`⚠ 2/2 tool calling — model did NOT call the tool. It replied: "${tool.text.slice(0, 120)}"`);
    console.log('   The agent loop needs function calling. Switch AI_MODEL, or set AI_DISABLE_TOOLS=1 to use the');
    console.log('   single-prompt fallback (works, but cannot verify locator fixes).');
  }

  const usage = getProcessUsage();
  console.log(`\n  ${usage.calls} calls · ${usage.inputTokens} in / ${usage.outputTokens} out tokens`);
  console.log(`  Triage budget per run: AI_MAX_CALLS_PER_RUN=${aiConfig.maxCallsPerRun} · tools ${aiConfig.disableTools ? 'DISABLED' : 'enabled'}\n`);
}

main().catch(async (error: unknown) => {
  const status = error instanceof LlmError ? error.status : (error as { status?: number }).status;
  console.error(`\n✗ LLM call failed${status ? ` (HTTP ${status})` : ''}: ${(error as Error).message.slice(0, 500)}`);
  if (status === 401 || status === 403) console.error('  → Key is wrong, revoked, or not enabled for this API.');
  if (status === 429) console.error('  → Rate limited (free tiers are per-minute). Wait a minute, or lower AI_MAX_CALLS_PER_RUN.');
  if (status === 400 || status === 404) {
    console.error('  → Usually a bad model id. Check AI_MODEL.');
    const provider = resolveProvider();
    if (provider?.info.wire === 'openai') {
      const models = await listModels(provider).catch(() => []);
      if (models.length) console.error(`  → Models this key can see:\n     ${models.slice(0, 40).join('\n     ')}`);
    }
  }
  console.error('');
  process.exit(1);
});
