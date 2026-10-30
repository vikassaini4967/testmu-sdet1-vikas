/**
 * Provider registry.
 *
 * Default is Google Gemini's free tier: real function calling (the agent loop
 * needs it), a generous daily quota and no card. Everything else is one env
 * var away. If AI_PROVIDER is unset, the first provider whose key is present
 * wins, so dropping GROQ_API_KEY into .env is enough to switch.
 *
 * Model ids were checked against each provider's model list on 2026-10-30.
 * They drift; `npm run verify:llm` lists what your key can actually see when
 * the configured id is rejected.
 */

export type ProviderId = 'gemini' | 'groq' | 'cerebras' | 'openrouter' | 'anthropic' | 'custom';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  wire: 'openai' | 'anthropic';
  baseUrl: string;
  keyEnv: string;
  /** Local servers (Ollama, LM Studio) don't need a key. */
  keyOptional?: boolean;
  defaultModel: string;
  /** Sent as `reasoning_effort` on OpenAI-compatible APIs that support it. */
  defaultReasoningEffort?: string;
  free: string;
  signup: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    wire: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    defaultModel: 'gemini-3.8-flash',
    // Gemini 3+ cannot switch thinking off; "low" keeps triage fast and cheap.
    defaultReasoningEffort: 'low',
    free: 'yes — free tier, no card',
    signup: 'https://aistudio.google.com/apikey',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    wire: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    defaultModel: 'openai/gpt-oss-120b',
    defaultReasoningEffort: 'low',
    free: 'yes — free tier, no card',
    signup: 'https://console.groq.com/keys',
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    wire: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyEnv: 'CEREBRAS_API_KEY',
    defaultModel: 'gpt-oss-120b',
    defaultReasoningEffort: 'low',
    free: 'yes — free tier',
    signup: 'https://cloud.cerebras.ai',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    wire: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'openai/gpt-oss-120b',
    free: 'some models (":free" suffix)',
    signup: 'https://openrouter.ai/keys',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    wire: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyEnv: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-haiku-5-5',
    free: 'no — paid API (separate from a claude.ai subscription)',
    signup: 'https://console.anthropic.com',
  },
  custom: {
    id: 'custom',
    label: 'Custom OpenAI-compatible (Ollama, LM Studio, vLLM…)',
    wire: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    keyEnv: 'AI_API_KEY',
    keyOptional: true,
    defaultModel: 'qwen3:8b',
    free: 'yes — runs locally',
    signup: 'https://ollama.com',
  },
};

/** Order used for auto-detection when AI_PROVIDER is not set. */
const AUTO_ORDER: ProviderId[] = ['gemini', 'groq', 'cerebras', 'openrouter', 'anthropic'];

export interface ResolvedProvider {
  info: ProviderInfo;
  apiKey: string;
  model: string;
  baseUrl: string;
  reasoningEffort?: string;
}

export function resolveProvider(env: NodeJS.ProcessEnv = process.env): ResolvedProvider | null {
  const requested = env.AI_PROVIDER?.trim().toLowerCase() as ProviderId | undefined;

  let info: ProviderInfo | undefined;
  if (requested) {
    info = PROVIDERS[requested];
    if (!info) return null;
  } else {
    info = AUTO_ORDER.map((id) => PROVIDERS[id]).find((p) => !!env[p.keyEnv]);
  }
  if (!info) return null;

  const apiKey = env[info.keyEnv] ?? '';
  if (!apiKey && !info.keyOptional) return null;

  const effort = env.AI_REASONING_EFFORT?.trim();
  return {
    info,
    apiKey,
    model: env.AI_MODEL?.trim() || info.defaultModel,
    baseUrl: (info.id === 'custom' && env.AI_BASE_URL?.trim()) || info.baseUrl,
    reasoningEffort: effort === 'off' || effort === 'none' ? undefined : effort || info.defaultReasoningEffort,
  };
}

/** Why no provider resolved — written for a human reading a skipped attachment. */
export function unresolvedReason(env: NodeJS.ProcessEnv = process.env): string {
  const requested = env.AI_PROVIDER?.trim().toLowerCase();
  if (requested && !PROVIDERS[requested as ProviderId]) {
    return `AI_PROVIDER="${requested}" is not one of: ${Object.keys(PROVIDERS).join(', ')}.`;
  }
  if (requested) {
    return `AI_PROVIDER=${requested} but ${PROVIDERS[requested as ProviderId].keyEnv} is not set.`;
  }
  return 'No LLM key found. Add GEMINI_API_KEY (free: https://aistudio.google.com/apikey) to .env — or any key listed in .env.example.';
}
