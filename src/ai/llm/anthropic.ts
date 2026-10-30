import Anthropic from '@anthropic-ai/sdk';
import type { ResolvedProvider } from './providers.js';
import { LlmError, type ChatMessage, type ChatRequest, type ChatResponse, type ProviderAdapter } from './types.js';

/**
 * Adapter for the Anthropic Messages API (native SDK). Tool results go back as
 * `tool_result` blocks inside a single user turn, so consecutive neutral
 * `tool` messages are folded together here.
 */

function toAnthropic(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      const previous = out[out.length - 1];
      // A nudge right after tool results must join that turn, not start a new one.
      if (previous?.role === 'user' && Array.isArray(previous.content)) {
        (previous.content as Anthropic.ContentBlockParam[]).push({ type: 'text', text: message.content });
      } else {
        out.push({ role: 'user', content: message.content });
      }
    } else if (message.role === 'assistant') {
      if (message.raw) {
        out.push({ role: 'assistant', content: message.raw as Anthropic.ContentBlockParam[] });
        continue;
      }
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (message.content) blocks.push({ type: 'text', text: message.content });
      for (const call of message.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments });
      }
      out.push({ role: 'assistant', content: blocks });
    } else {
      const block: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: message.content,
      };
      const previous = out[out.length - 1];
      if (previous?.role === 'user' && Array.isArray(previous.content)) {
        (previous.content as Anthropic.ContentBlockParam[]).push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
    }
  }
  return out;
}

export function createAnthropicAdapter(provider: ResolvedProvider): ProviderAdapter {
  // Retries are handled once, provider-agnostically, in client.ts.
  const client = new Anthropic({ apiKey: provider.apiKey, maxRetries: 0, timeout: 90_000 });

  return {
    async chat(request: ChatRequest): Promise<ChatResponse> {
      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model: provider.model,
          max_tokens: request.maxTokens ?? 4096,
          system: request.system,
          messages: toAnthropic(request.messages),
          ...(request.tools?.length
            ? {
                tools: request.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  input_schema: tool.parameters as Anthropic.Tool.InputSchema,
                })),
                tool_choice: { type: request.toolChoice ?? 'auto' },
              }
            : {}),
        });
      } catch (error) {
        const status = (error as { status?: number }).status;
        throw new LlmError(`Anthropic API error: ${(error as Error).message}`, status, 'anthropic');
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      const toolCalls = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map((block) => ({ id: block.id, name: block.name, arguments: (block.input ?? {}) as Record<string, unknown> }));

      return {
        text,
        toolCalls,
        stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : response.stop_reason === 'max_tokens' ? 'max_tokens' : 'end',
        usage: { calls: 1, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        raw: response.content,
        model: response.model,
      };
    },
  };
}
