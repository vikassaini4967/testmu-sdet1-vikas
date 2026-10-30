import { createAnthropicAdapter } from './anthropic.js';
import { createOpenAiCompatibleAdapter } from './openai-compatible.js';
import { resolveProvider, type ResolvedProvider } from './providers.js';
import { LlmError, type ChatRequest, type ChatResponse, type ProviderAdapter, type Usage } from './types.js';

/**
 * The single entry point for every LLM call in the repo.
 *
 * Owns the concerns that must not differ by provider:
 *  - retry with backoff on 429 / 5xx / network errors, honouring the
 *    provider's own retry hint (free tiers rate-limit per minute; waiting the
 *    advertised 17s beats three blind retries in 3s)
 *  - per-process token accounting, so reports can show what triage cost
 */

let cached: { provider: ResolvedProvider; adapter: ProviderAdapter } | null = null;

function adapter(): { provider: ResolvedProvider; adapter: ProviderAdapter } {
  if (cached) return cached;
  const provider = resolveProvider();
  if (!provider) throw new LlmError('No LLM provider configured.', undefined, 'none');
  cached = {
    provider,
    adapter: provider.info.wire === 'anthropic' ? createAnthropicAdapter(provider) : createOpenAiCompatibleAdapter(provider),
  };
  return cached;
}

const processUsage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0 };

export function getProcessUsage(): Usage {
  return { ...processUsage };
}

export function addUsage(into: Usage, from: Usage): Usage {
  into.calls += from.calls;
  into.inputTokens += from.inputTokens;
  into.outputTokens += from.outputTokens;
  return into;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(error: unknown): boolean {
  if (error instanceof LlmError) {
    const status = error.status ?? 0;
    return status === 429 || status === 408 || status === 529 || status >= 500;
  }
  // fetch() network failures and AbortSignal timeouts.
  return error instanceof TypeError || (error as Error)?.name === 'TimeoutError';
}

export interface ChatOptions {
  /** Upper bound on total time spent waiting between retries. */
  maxRetryWaitMs?: number;
}

export async function chat(request: ChatRequest, options: ChatOptions = {}): Promise<ChatResponse> {
  const { adapter: provider } = adapter();
  const maxAttempts = 4;
  let waited = 0;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await provider.chat(request);
      addUsage(processUsage, response.usage);
      return response;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxAttempts) break;

      const hinted = error instanceof LlmError ? error.retryAfterMs : undefined;
      const backoff = Math.min(hinted ?? 2 ** attempt * 1000, 30_000) + Math.floor(Math.random() * 400);
      if (waited + backoff > (options.maxRetryWaitMs ?? 60_000)) break;
      waited += backoff;
      await sleep(backoff);
    }
  }
  throw lastError;
}

export function activeProvider(): ResolvedProvider | null {
  try {
    return adapter().provider;
  } catch {
    return null;
  }
}
