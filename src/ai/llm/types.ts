/**
 * Provider-neutral chat types.
 *
 * The agent loop in failure-explainer.ts is written against these, never
 * against a vendor SDK, so swapping Gemini for Groq or Claude is an env var
 * rather than a refactor. Each adapter maps to and from its own wire format.
 */

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      toolCalls?: ToolCall[];
      /**
       * The provider's original assistant message, echoed back verbatim on the
       * next turn. Gemini 3 attaches thought signatures to tool calls and
       * rejects a follow-up turn that drops them; re-sending the raw message is
       * the only provider-agnostic way to never lose that state.
       */
      raw?: unknown;
    }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** 'none' keeps tools defined (some APIs require it once tool turns exist) but forbids calling them. */
  toolChoice?: 'auto' | 'none';
  maxTokens?: number;
  /** Ask for a bare JSON object back (honoured where the provider supports it). */
  json?: boolean;
}

export interface Usage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  /** Normalised: 'tool_use' when the model wants tools run, else 'end'. */
  stopReason: 'tool_use' | 'end' | 'max_tokens';
  usage: Usage;
  /** Echo this back as `raw` on the assistant turn. */
  raw: unknown;
  model: string;
}

export interface ProviderAdapter {
  chat(request: ChatRequest): Promise<ChatResponse>;
}

/** Thrown for any non-2xx from a provider, with enough detail to act on. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly provider: string,
    readonly body?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
