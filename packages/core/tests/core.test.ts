/**
 * @confused-ai/core — unit tests.
 *
 * Tests the public surface: createAgent, MapToolRegistry, AsyncQueue (via stream),
 * and the error hierarchy.
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgent, MapToolRegistry, ConfigError } from '../src/index.js';
import type { LLMProvider, Tool } from '../src/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockLLM = (responses: string[]): LLMProvider => {
    let call = 0;
    return {
        generateText: vi.fn(async () => ({
            text:       responses[call++ % responses.length] ?? 'done',
            finishReason: 'stop' as const,
        })),
    };
};

const echoTool: Tool = {
    name:        'echo',
    description: 'Echoes the input',
    parameters:  { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    execute:     async (input) => `ECHO: ${String((input as { text: string }).text)}`,
};

// ── MapToolRegistry ───────────────────────────────────────────────────────────

describe('MapToolRegistry', () => {
    it('get() returns undefined for unknown tool — O(1)', () => {
        const reg = new MapToolRegistry([echoTool]);
        expect(reg.get('unknown')).toBeUndefined();
    });

    it('get() returns the tool — O(1)', () => {
        const reg = new MapToolRegistry([echoTool]);
        expect(reg.get('echo')).toBe(echoTool);
    });

    it('list() is cached after first call', () => {
        const reg = new MapToolRegistry([echoTool]);
        const first  = reg.list();
        const second = reg.list();
        expect(first).toBe(second); // same reference → cached
    });

    it('list() cache is invalidated after register()', () => {
        const reg   = new MapToolRegistry([echoTool]);
        const before = reg.list();
        const newTool: Tool = { ...echoTool, name: 'echo2' };
        reg.register(newTool);
        const after = reg.list();
        expect(after).not.toBe(before);    // cache invalidated
        expect(after).toHaveLength(2);
    });

    it('size is O(1)', () => {
        const reg = new MapToolRegistry([echoTool]);
        expect(reg.size).toBe(1);
    });
});

// ── createAgent validation ────────────────────────────────────────────────────

describe('createAgent validation', () => {
    it('throws ConfigError when name is empty', () => {
        expect(() =>
            createAgent({ name: '', instructions: 'x', llm: mockLLM(['hi']) }),
        ).toThrow(ConfigError);
    });

    it('throws ConfigError when instructions is empty', () => {
        expect(() =>
            createAgent({ name: 'bot', instructions: '  ', llm: mockLLM(['hi']) }),
        ).toThrow(ConfigError);
    });

    it('throws ConfigError when no LLM is provided', () => {
        expect(() =>
            createAgent({ name: 'bot', instructions: 'sys' }),
        ).toThrow(ConfigError);
    });
});

// ── run() ─────────────────────────────────────────────────────────────────────

describe('createAgent.run()', () => {
    it('returns text from the LLM', async () => {
        const agent = createAgent({
            name:         'tester',
            instructions: 'You are a test agent.',
            llm:          mockLLM(['Hello world']),
            tools:        false,
        });
        const result = await agent.run('ping');
        expect(result.text).toBe('Hello world');
        expect(result.finishReason).toBe('stop');
    });

    it('exposes markdown artifact with correct mimeType', async () => {
        const agent = createAgent({
            name:         'tester',
            instructions: 'sys',
            llm:          mockLLM(['resp']),
            tools:        false,
        });
        const result = await agent.run('hi');
        expect(result.markdown.mimeType).toBe('text/markdown');
        expect(result.markdown.content).toBe('resp');
    });

    it('calls beforeRun and afterRun hooks', async () => {
        const calls: string[] = [];
        const agent = createAgent({
            name:         'hooker',
            instructions: 'sys',
            llm:          mockLLM(['ok']),
            tools:        false,
            hooks: {
                beforeRun: (p) => { calls.push('before'); return p; },
                afterRun:  (r) => { calls.push('after');  return r; },
            },
        });
        await agent.run('x');
        expect(calls).toEqual(['before', 'after']);
    });
});

// ── stream() — SPSC AsyncQueue ────────────────────────────────────────────────

describe('createAgent.stream()', () => {
    it('yields all chunks and completes', async () => {
        const llm = mockLLM(['chunk']);
        // Override to simulate streaming via onChunk
        const chunks: string[] = [];
        const agent = createAgent({
            name:         's',
            instructions: 'sys',
            llm:          {
                generateText: async (_msgs, opts) => {
                    opts?.onChunk?.('chunk1');
                    opts?.onChunk?.('chunk2');
                    return { text: 'chunk1chunk2', finishReason: 'stop' };
                },
            },
            tools: false,
        });
        for await (const chunk of agent.stream('go')) {
            chunks.push(chunk);
        }
        expect(chunks).toEqual(['chunk1', 'chunk2']);
    });
});

// ── streamEvents() ─────────────────────────────────────────────────────────────

describe('createAgent.streamEvents()', () => {
    it('emits run-finish as the last event', async () => {
        const agent = createAgent({
            name:         'ev',
            instructions: 'sys',
            llm:          mockLLM(['done']),
            tools:        false,
        });
        const events = [];
        for await (const ev of agent.streamEvents('hi')) {
            events.push(ev.type);
        }
        expect(events.at(-1)).toBe('run-finish');
    });
});

// ── Session store — in-memory default ────────────────────────────────────────

describe('session management', () => {
    it('createSession returns a unique id', async () => {
        const agent = createAgent({
            name:         'sess',
            instructions: 'sys',
            llm:          mockLLM(['ok']),
            tools:        false,
        });
        const id1 = await agent.createSession();
        const id2 = await agent.createSession();
        expect(id1).not.toBe(id2);
    });

    it('getSessionMessages returns [] for new session', async () => {
        const agent = createAgent({
            name:         'sess2',
            instructions: 'sys',
            llm:          mockLLM(['ok']),
            tools:        false,
        });
        const id = await agent.createSession();
        expect(await agent.getSessionMessages(id)).toEqual([]);
    });

    it('throws when sessionStore is disabled', async () => {
        const agent = createAgent({
            name:         'nostore',
            instructions: 'sys',
            llm:          mockLLM(['ok']),
            tools:        false,
            sessionStore: false,
        });
        await expect(agent.createSession()).rejects.toThrow(ConfigError);
    });
});
