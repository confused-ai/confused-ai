/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/**
 * @confused-ai/models — Anthropic adapter.
 * Lazy SDK import. Returns LLMProvider (DIP).
 */

import type { LLMProvider, Message, GenerateOptions, GenerateResult } from '@confused-ai/core';
import type { ModelAdapterConfig } from './types.js';

const MISSING_SDK_MSG =
  '[confused-ai] Anthropic adapter requires the @anthropic-ai/sdk package.\n' +
  '  Install: npm install @anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

export function anthropic(config: ModelAdapterConfig = {}): LLMProvider {
  const apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
  const model  = config.model  ?? DEFAULT_MODEL;

  let _client: unknown = null;

  async function getClient(): Promise<import('@anthropic-ai/sdk').default> {
    if (_client) return _client as import('@anthropic-ai/sdk').default;
    const mod = await import('@anthropic-ai/sdk').catch(() => { throw new Error(MISSING_SDK_MSG); });
    _client = new mod.default({ apiKey });
    return _client as import('@anthropic-ai/sdk').default;
  }

  function toAnthropicMessages(msgs: Message[]): import('@anthropic-ai/sdk').Anthropic.Messages.MessageParam[] {
    return msgs
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role:    m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })) as import('@anthropic-ai/sdk').Anthropic.Messages.MessageParam[];
  }

  function getSystem(msgs: Message[]): string | undefined {
    return msgs.find((m) => m.role === 'system')?.content as string | undefined;
  }

  async function generateText(messages: Message[], opts?: GenerateOptions): Promise<GenerateResult> {
    const client = await getClient();
    const tools = opts?.tools?.map((t) => ({
      name:         t.name,
      description:  t.description,
      input_schema: t.parameters as import('@anthropic-ai/sdk').Anthropic.Messages.Tool['input_schema'],
    }));

    const system = getSystem(messages);
    const res = await (client as import('@anthropic-ai/sdk').default).messages.create({
      model,
      max_tokens: opts?.maxTokens ?? config.maxTokens ?? 4096,
      messages:   toAnthropicMessages(messages),
      ...(system !== undefined && { system }),
      ...(tools?.length && { tools }),
    } as never);

    const textBlock  = res.content.find((b) => b.type === 'text');
    const toolBlocks = res.content.filter((b) => b.type === 'tool_use');
    const text       = textBlock ? textBlock.text : '';

    const toolCalls = toolBlocks.length
      ? toolBlocks.map((b) => ({ id: b.id, name: b.name, arguments: b.input as Record<string, unknown> }))
      : undefined;

    return {
      text,
      ...(toolCalls && { toolCalls }),
      finishReason: res.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      usage: { promptTokens: res.usage.input_tokens, completionTokens: res.usage.output_tokens, totalTokens: res.usage.input_tokens + res.usage.output_tokens },
    };
  }

  async function streamText(messages: Message[], opts?: GenerateOptions): Promise<GenerateResult> {
    const client = await getClient();
    let fullText = '';

    const system = getSystem(messages);
    const stream = (client as import('@anthropic-ai/sdk').default).messages.stream({
      model,
      max_tokens: opts?.maxTokens ?? config.maxTokens ?? 4096,
      messages:   toAnthropicMessages(messages),
      ...(system !== undefined && { system }),
    } as never);

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        opts?.onChunk?.(event.delta.text);
      }
    }

    return { text: fullText, finishReason: 'stop' };
  }

  return { generateText, streamText };
}
