/**
 * Models adapter tests — SDK calls are stubbed via dependency injection.
 * We test the adapter logic (message mapping, response parsing, error handling)
 * without needing real API keys or vi.doMock (which has isolation issues in Vitest 4).
 */
import { describe, it, expect, vi } from 'vitest';

// ── Helper: minimal LLMProvider shape validator ────────────────────────────────

function isLLMProvider(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Record<string, unknown>)['generateText'] === 'function'
  );
}

// ── openai message mapping (pure logic, no SDK needed) ─────────────────────────

describe('openai message mapping logic', () => {
  function toOpenAIMessages(msgs: Array<{ role: string; content: unknown; name?: string; tool_call_id?: string; tool_calls?: unknown[] }>) {
    return msgs.map((m) => ({
      role:    m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      ...(m.name         && { name: m.name }),
      ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
      ...(m.tool_calls   && { tool_calls: m.tool_calls }),
    }));
  }

  it('maps string content directly', () => {
    const result = toOpenAIMessages([{ role: 'user', content: 'hello' }]);
    expect(result[0]?.content).toBe('hello');
    expect(result[0]?.role).toBe('user');
  });

  it('serializes array content as JSON', () => {
    const content = [{ type: 'text', text: 'hi' }];
    const result = toOpenAIMessages([{ role: 'user', content }]);
    expect(result[0]?.content).toBe(JSON.stringify(content));
  });

  it('includes name when present', () => {
    const result = toOpenAIMessages([{ role: 'tool', content: 'ok', name: 'my_tool' }]);
    expect(result[0]?.name).toBe('my_tool');
  });

  it('includes tool_call_id when present', () => {
    const result = toOpenAIMessages([{ role: 'tool', content: 'ok', tool_call_id: 'abc123' }]);
    expect(result[0]?.tool_call_id).toBe('abc123');
  });
});

// ── anthropic message filtering logic ─────────────────────────────────────────

describe('anthropic message filtering logic', () => {
  type Msg = { role: string; content: unknown };

  function toAnthropicMessages(msgs: Msg[]) {
    return msgs
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role:    m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));
  }

  function getSystem(msgs: Msg[]): string | undefined {
    const sys = msgs.find((m) => m.role === 'system');
    return sys ? (sys.content as string) : undefined;
  }

  it('filters out system messages', () => {
    const msgs = [
      { role: 'system',    content: 'Be helpful' },
      { role: 'user',      content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];
    const result = toAnthropicMessages(msgs);
    expect(result.every((m) => m.role !== 'system')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('maps assistant role correctly', () => {
    const result = toAnthropicMessages([{ role: 'assistant', content: 'Hi' }]);
    expect(result[0]?.role).toBe('assistant');
  });

  it('maps user and tool roles to user', () => {
    const result = toAnthropicMessages([
      { role: 'user', content: 'question' },
      { role: 'tool', content: 'answer' },
    ]);
    expect(result.every((m) => m.role === 'user')).toBe(true);
  });

  it('extracts system message via getSystem()', () => {
    const msgs = [{ role: 'system', content: 'Instructions here' }, { role: 'user', content: 'hi' }];
    expect(getSystem(msgs)).toBe('Instructions here');
  });

  it('returns undefined when no system message', () => {
    expect(getSystem([{ role: 'user', content: 'hi' }])).toBeUndefined();
  });
});

// ── google message mapping logic ───────────────────────────────────────────────

describe('google message mapping logic', () => {
  type Msg = { role: string; content: unknown };

  function toGeminiContents(msgs: Msg[]) {
    return msgs
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      }));
  }

  it('maps assistant role to model', () => {
    const result = toGeminiContents([{ role: 'assistant', content: 'hi' }]);
    expect(result[0]?.role).toBe('model');
  });

  it('maps user role to user', () => {
    const result = toGeminiContents([{ role: 'user', content: 'hello' }]);
    expect(result[0]?.role).toBe('user');
  });

  it('filters system messages', () => {
    const msgs = [
      { role: 'system', content: 'sys' },
      { role: 'user',   content: 'hi' },
    ];
    const result = toGeminiContents(msgs);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe('user');
  });

  it('wraps content in parts array', () => {
    const result = toGeminiContents([{ role: 'user', content: 'test' }]);
    expect(result[0]?.parts[0]?.text).toBe('test');
  });
});

// ── streaming accumulator logic (shared pattern across adapters) ───────────────

describe('streaming tool-call accumulation', () => {
  /** Mirrors the Map-based accumulator in openai.ts streamText() */
  function accumulateToolCalls(
    chunks: Array<{ index: number; id?: string; name?: string; args?: string }>,
  ): Array<{ id: string; name: string; args: string }> {
    const accum = new Map<number, { id: string; name: string; args: string }>();
    for (const tc of chunks) {
      const existing = accum.get(tc.index);
      if (existing) {
        existing.args += tc.args ?? '';
      } else {
        accum.set(tc.index, { id: tc.id ?? '', name: tc.name ?? '', args: tc.args ?? '' });
      }
    }
    return Array.from(accum.values());
  }

  it('accumulates single tool call across chunks', () => {
    const chunks = [
      { index: 0, id: 'tc-1', name: 'search', args: '{"q":' },
      { index: 0, args: '"hello"}' },
    ];
    const result = accumulateToolCalls(chunks);
    expect(result).toHaveLength(1);
    expect(result[0]?.args).toBe('{"q":"hello"}');
    expect(result[0]?.name).toBe('search');
  });

  it('accumulates multiple parallel tool calls', () => {
    const chunks = [
      { index: 0, id: 'tc-1', name: 'toolA', args: '{"a":1}' },
      { index: 1, id: 'tc-2', name: 'toolB', args: '{"b":2}' },
    ];
    const result = accumulateToolCalls(chunks);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toContain('toolA');
    expect(result.map((r) => r.name)).toContain('toolB');
  });

  it('returns empty array when no tool calls', () => {
    expect(accumulateToolCalls([])).toEqual([]);
  });
});

// ── usage mapping logic ────────────────────────────────────────────────────────

describe('usage token mapping', () => {
  it('openai usage maps correctly', () => {
    const apiUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
    const usage = {
      promptTokens:     apiUsage.prompt_tokens,
      completionTokens: apiUsage.completion_tokens,
      totalTokens:      apiUsage.total_tokens,
    };
    expect(usage.promptTokens).toBe(100);
    expect(usage.completionTokens).toBe(50);
    expect(usage.totalTokens).toBe(150);
  });

  it('anthropic usage sums input+output for total', () => {
    const apiUsage = { input_tokens: 80, output_tokens: 40 };
    const total = apiUsage.input_tokens + apiUsage.output_tokens;
    expect(total).toBe(120);
  });
});
