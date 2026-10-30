import type { ResolvedProvider } from './providers.js';
import { LlmError, type ChatMessage, type ChatRequest, type ChatResponse, type ProviderAdapter, type ToolCall } from './types.js';

/**
 * Adapter for every OpenAI-compatible chat-completions endpoint: Gemini,
 * Groq, Cerebras, OpenRouter and local servers. Plain fetch — no SDK — so the
 * one code path is exactly what goes over the wire.
 */

interface WireToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface WireMessage {
  role: string;
  content?: string | null;
  tool_calls?: WireToolCall[];
}

interface WireResponse {
  model?: string;
  choices?: { message?: WireMessage; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function toWire(system: string, messages: ChatMessage[]): unknown[] {
  const wire: unknown[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (message.role === 'user') {
      wire.push({ role: 'user', content: message.content });
    } else if (message.role === 'assistant') {
      wire.push(
        message.raw ?? {
          role: 'assistant',
          content: message.content || null,
          ...(message.toolCalls?.length
            ? {
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  type: 'function',
                  function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                })),
              }
            : {}),
        },
      );
    } else {
      wire.push({ role: 'tool', tool_call_id: message.toolCallId, name: message.name, content: message.content });
    }
  }
  return wire;
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Gemini puts the wait in the body ("retryDelay": "17s"); others use Retry-After. */
function retryAfterMs(headers: Headers, body: string): number | undefined {
  const header = headers.get('retry-after');
  if (header && Number.isFinite(Number(header))) return Number(header) * 1000;
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return match ? Number(match[1]) * 1000 : undefined;
}

export function createOpenAiCompatibleAdapter(provider: ResolvedProvider): ProviderAdapter {
  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const body: Record<string, unknown> = {
        model: provider.model,
        messages: toWire(request.system, request.messages),
        max_tokens: request.maxTokens ?? 4096,
      };
      if (request.tools?.length) {
        body.tools = request.tools.map((tool) => ({
          type: 'function',
          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
        }));
        body.tool_choice = request.toolChoice ?? 'auto';
      }
      if (request.json) body.response_format = { type: 'json_object' };
      if (provider.reasoningEffort) body.reasoning_effort = provider.reasoningEffort;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });

      const text = await response.text();
      if (!response.ok) {
        throw new LlmError(
          `${provider.info.label} returned HTTP ${response.status}: ${text.slice(0, 400)}`,
          response.status,
          provider.info.id,
          text,
          retryAfterMs(response.headers, text),
        );
      }

      const data = JSON.parse(text) as WireResponse;
      const choice = data.choices?.[0];
      const message = choice?.message ?? { role: 'assistant', content: '' };

      const toolCalls: ToolCall[] = (message.tool_calls ?? [])
        .filter((call) => call.function?.name)
        .map((call, index) => ({
          id: call.id || `call_${Date.now()}_${index}`,
          name: call.function!.name!,
          arguments: parseArguments(call.function?.arguments),
        }));

      // Some providers omit ids; the echoed message must carry the same ids
      // as the tool results that follow it.
      const raw = {
        ...message,
        role: 'assistant',
        ...(message.tool_calls?.length
          ? { tool_calls: message.tool_calls.map((call, index) => ({ ...call, id: toolCalls[index]?.id ?? call.id })) }
          : {}),
      };

      return {
        text: (message.content ?? '').trim(),
        toolCalls,
        stopReason: toolCalls.length ? 'tool_use' : choice?.finish_reason === 'length' ? 'max_tokens' : 'end',
        usage: {
          calls: 1,
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
        raw,
        model: data.model ?? provider.model,
      };
    },
  };
}

/** Lists model ids the key can see — used by verify:llm when a model id is rejected. */
export async function listModels(provider: ResolvedProvider): Promise<string[]> {
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/models`, {
    headers: provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {},
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((m) => m.id.replace(/^models\//, ''));
}
