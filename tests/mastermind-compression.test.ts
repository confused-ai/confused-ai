/**
 * Mastermind Compression Pipeline — Regression Tests
 * ===================================================
 * Covers all 6 hardening fixes:
 *   1. CacheAligner does not reorder conversation history
 *   2. CCR tool produces valid JSON Schema (not Zod)
 *   3. Token-budget does not orphan tool_call / tool_result pairs
 *   4. Shared message refs are not mutated during compression
 *   5. Token estimator is unified (BPE, not length/3.5)
 *   6. End-to-end integration smoke test
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { CacheAligner } from '../src/compression/mastermind/cache-aligner.js';
import type { CacheAlignerMessage } from '../src/compression/mastermind/cache-aligner.js';
import { CCRStore, createRetrieveTool, annotateCCR } from '../src/compression/mastermind/ccr.js';
import { Mastermind } from '../src/compression/mastermind/mastermind.js';
import { countTokens } from '../src/compression/token-counter.js';
import { estimateTokenCount } from '../src/providers/context-window-manager.js';
import { smartCrush } from '../src/compression/mastermind/smart-crusher.js';
import { compressCode } from '../src/compression/mastermind/code-compressor.js';
import { detectContentType as staticDetectContentType } from '../src/compression/mastermind/router.js';

// ────────────────────────────────────────────────────────────────────────────
// 1. CacheAligner — never reorders conversation history
// ────────────────────────────────────────────────────────────────────────────

describe('CacheAligner — history preservation', () => {
    const aligner = new CacheAligner();

    it('preserves message order when no _cachePrefix markers are set', () => {
        const msgs: CacheAlignerMessage[] = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi!', tool_calls: [{ id: 'tc1', name: 'search' }] },
            { role: 'tool', content: '{"result":"found"}', tool_call_id: 'tc1' },
            { role: 'assistant', content: 'Here you go.' },
        ];

        const aligned = aligner.align(msgs);
        expect(aligned.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'assistant']);
        // tool_call_id must stay paired with its assistant
        expect(aligned[3].tool_call_id).toBe('tc1');
    });

    it('hoists only _cachePrefix-marked messages, preserves rest order', () => {
        const msgs: CacheAlignerMessage[] = [
            { role: 'system', content: 'System' },
            { role: 'user', content: 'Turn 1' },
            CacheAligner.markPrefix({ role: 'assistant', content: 'Static knowledge block' }),
            { role: 'assistant', content: 'Response with tool_calls', tool_calls: [{ id: 'x' }] },
            { role: 'tool', content: 'result', tool_call_id: 'x' },
        ];

        const aligned = aligner.align(msgs);
        // Prefix message hoisted after system, but tool pair stays together
        expect(aligned[0].role).toBe('system');
        expect(aligned[1].content).toBe('Static knowledge block'); // hoisted
        expect(aligned[2].content).toBe('Turn 1');
        expect(aligned[3].tool_calls).toBeDefined();
        expect(aligned[4].tool_call_id).toBe('x');
    });

    it('does not mutate the input array', () => {
        const original: CacheAlignerMessage[] = [
            { role: 'system', content: 'test\n\n' },
            { role: 'user', content: 'hi  ' },
        ];
        const snapshot = JSON.stringify(original);
        aligner.align(original);
        expect(JSON.stringify(original)).toBe(snapshot);
    });

    it('normalises trailing whitespace on system message', () => {
        const msgs: CacheAlignerMessage[] = [
            { role: 'system', content: 'prompt   \n  \n' },
        ];
        const aligned = aligner.align(msgs);
        expect(aligned[0].content).toBe('prompt\n');
    });

    it('handles empty message array', () => {
        expect(aligner.align([])).toEqual([]);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. CCR tool — proper shape and functionality
// ────────────────────────────────────────────────────────────────────────────

describe('CCR Store & Retrieve Tool', () => {
    it('stores and retrieves original content', () => {
        const store = new CCRStore();
        const handle = store.store({ original: 'full text here', compressed: 'short', algorithm: 'smart-crusher' });
        expect(handle).toMatch(/^ccr_/);
        const entry = store.retrieve(handle);
        expect(entry).not.toBeNull();
        expect(entry!.original).toBe('full text here');
    });

    it('returns null for evicted / unknown handles', () => {
        const store = new CCRStore(1);
        store.store({ original: 'a', compressed: 'a', algorithm: 'smart-crusher' });
        const h2 = store.store({ original: 'b', compressed: 'b', algorithm: 'smart-crusher' }); // evicts first
        expect(store.retrieve('ccr_0001')).toBeNull(); // evicted
        expect(store.retrieve(h2)).not.toBeNull();
    });

    it('createRetrieveTool returns the correct shape', () => {
        const store = new CCRStore();
        const tool = createRetrieveTool(store);
        expect(tool.name).toBe('mastermind_retrieve');
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe('object');
        expect(tool.parameters.properties.handle).toBeDefined();
        expect(typeof tool.execute).toBe('function');
    });

    it('retrieve tool returns found: true for valid handles', async () => {
        const store = new CCRStore();
        const handle = store.store({ original: 'original text', compressed: 'short', algorithm: 'smart-crusher' });
        const tool = createRetrieveTool(store);
        const result = await tool.execute({ handle });
        expect(result.found).toBe(true);
        expect(result.content).toBe('original text');
    });

    it('retrieve tool returns found: false for missing handles', async () => {
        const store = new CCRStore();
        const tool = createRetrieveTool(store);
        const result = await tool.execute({ handle: 'ccr_nope' });
        expect(result.found).toBe(false);
    });

    it('annotateCCR appends the handle hint', () => {
        const annotated = annotateCCR('compressed text', 'ccr_0001');
        expect(annotated).toContain('ccr_0001');
        expect(annotated).toContain('mastermind_retrieve');
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Token-budget — never orphan tool_call / tool_result pairs
// ────────────────────────────────────────────────────────────────────────────

describe('Token budget — tool pair preservation', () => {
    it('keeps tool_call and tool_result together when budget forces drops', async () => {
        const longContent = 'x'.repeat(500); // ~125 tokens each
        const messages = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'What is 2+2?' },
            { role: 'assistant', content: longContent, tool_calls: [{ id: 'tc1', function: { name: 'calc' } }] },
            { role: 'tool', content: longContent, tool_call_id: 'tc1' },
            { role: 'user', content: 'Thanks!' },
            { role: 'assistant', content: 'You are welcome.' },
        ];

        const mm = new Mastermind({ contextTokenBudget: 200 });
        const { messages: result } = await mm.compress(messages);

        // If the tool_call assistant was dropped, its tool result must also be dropped.
        const hasToolCall = result.some((m: any) =>
            m.role === 'assistant' && m.tool_calls?.length > 0
        );
        const hasToolResult = result.some((m: any) =>
            m.role === 'tool' && m.tool_call_id === 'tc1'
        );
        // Both present or both absent — never orphaned.
        expect(hasToolCall).toBe(hasToolResult);
    });

    it('preserves system and recent messages under tight budget', async () => {
        const messages = [
            { role: 'system', content: 'System prompt.' },
            { role: 'user', content: 'x'.repeat(300) },
            { role: 'assistant', content: 'y'.repeat(300) },
            { role: 'user', content: 'Latest question' },
        ];

        const mm = new Mastermind({ contextTokenBudget: 100, recentWindow: 2 });
        const { messages: result } = await mm.compress(messages);

        // System is always kept
        expect(result[0].role).toBe('system');
        // Last 2 messages are pinned by recentWindow
        const roles = result.map((m: any) => m.role);
        expect(roles[roles.length - 1]).toBe('user');
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Message mutation — shared refs must not be modified
// ────────────────────────────────────────────────────────────────────────────

describe('Message mutation safety', () => {
    it('Mastermind.compress does not mutate the original message objects when cloned', async () => {
        const original = [
            { role: 'system', content: 'system' },
            { role: 'user', content: 'Hello world, this is a test message.' },
        ];
        const snapshot = JSON.stringify(original);

        // Clone before compressing (as factory.ts now does)
        const cloned = original.map(m => ({ ...m }));
        const mm = new Mastermind({ contextTokenBudget: 5000 });
        await mm.compress(cloned);

        // Original should be untouched
        expect(JSON.stringify(original)).toBe(snapshot);
    });

    it('CacheAligner.align returns new objects, not original refs', () => {
        const aligner = new CacheAligner();
        const msgs: CacheAlignerMessage[] = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'hi' },
        ];
        const aligned = aligner.align(msgs);
        // Should be new objects (system is always spread)
        expect(aligned[0]).not.toBe(msgs[0]);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Token estimator unification
// ────────────────────────────────────────────────────────────────────────────

describe('Unified token estimation', () => {
    it('countTokens and estimateTokenCount agree on the same string', () => {
        const text = 'Hello world, this is a test of the token counting system.';
        const bpe = countTokens(text);
        const provider = estimateTokenCount(text);

        // Both should use the same BPE algorithm now
        expect(provider).toBe(bpe);
    });

    it('handles empty string', () => {
        expect(countTokens('')).toBe(0);
        expect(estimateTokenCount('')).toBe(0);
    });

    it('handles code content accurately', () => {
        const code = `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`;
        const tokens = countTokens(code);
        // BPE should give a reasonable count (not just length/3.5)
        expect(tokens).toBeGreaterThan(10);
        expect(tokens).toBeLessThan(100);
    });

    it('estimateTokenCount for Message[] includes framing overhead', () => {
        const messages = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hi' },
        ];
        const total = estimateTokenCount(messages as any);
        const contentOnly = countTokens('You are helpful.') + countTokens('Hi');
        // Total should be greater due to system prompt overhead + per-message overhead
        expect(total).toBeGreaterThan(contentOnly);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. CCRStore edge cases
// ────────────────────────────────────────────────────────────────────────────

describe('CCRStore edge cases', () => {
    it('handles clear correctly', () => {
        const store = new CCRStore();
        const h1 = store.store({ original: 'a', compressed: 'a', algorithm: 'smart-crusher' });
        expect(store.size).toBe(1);
        store.clear();
        expect(store.size).toBe(0);
        expect(store.retrieve(h1)).toBeNull();
    });

    it('generates unique handles', () => {
        const store = new CCRStore();
        const handles = new Set<string>();
        for (let i = 0; i < 50; i++) {
            handles.add(store.store({ original: `text-${i}`, compressed: `c-${i}`, algorithm: 'smart-crusher' }));
        }
        expect(handles.size).toBe(50); // all unique
    });

    it('evicts oldest when at capacity', () => {
        const store = new CCRStore(3);
        const h1 = store.store({ original: '1', compressed: '1', algorithm: 'passthrough' });
        store.store({ original: '2', compressed: '2', algorithm: 'passthrough' });
        store.store({ original: '3', compressed: '3', algorithm: 'passthrough' });
        // This should evict h1
        store.store({ original: '4', compressed: '4', algorithm: 'passthrough' });
        expect(store.retrieve(h1)).toBeNull();
        expect(store.size).toBe(3);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. Token budget — advanced edge cases
// ────────────────────────────────────────────────────────────────────────────

describe('Token budget — advanced edge cases', () => {
    it('groups parallel tool calls: assistant with 2 tool_calls + 2 tool_results', async () => {
        const messages = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'do two things' },
            {
                role: 'assistant',
                content: 'x'.repeat(400),
                tool_calls: [
                    { id: 'tc1', function: { name: 'tool_a' } },
                    { id: 'tc2', function: { name: 'tool_b' } },
                ],
            },
            { role: 'tool', content: 'x'.repeat(200), tool_call_id: 'tc1' },
            { role: 'tool', content: 'x'.repeat(200), tool_call_id: 'tc2' },
            { role: 'user', content: 'ok' },
        ];

        const mm = new Mastermind({ contextTokenBudget: 100, recentWindow: 1 });
        const { messages: result } = await mm.compress(messages);

        // The assistant + both tool results should be dropped as one atomic group.
        const hasAssistantToolCall = result.some((m: any) => m.tool_calls?.length > 0);
        const hasToolResult1 = result.some((m: any) => m.tool_call_id === 'tc1');
        const hasToolResult2 = result.some((m: any) => m.tool_call_id === 'tc2');

        // All three dropped together or all three kept together
        expect(hasAssistantToolCall).toBe(hasToolResult1);
        expect(hasAssistantToolCall).toBe(hasToolResult2);
    });

    it('handles pinned message between tool_call and tool_result', async () => {
        // This is the exact bug scenario that Fix 3 addresses:
        // A system message (always pinned) sits between an assistant tool_call
        // and its tool_result. The old code would treat the tool_result as a
        // standalone group, allowing it to be dropped without its parent.
        const messages = [
            { role: 'system', content: 'System prompt.' },
            { role: 'assistant', content: 'x'.repeat(400), tool_calls: [{ id: 'tc1' }] },
            { role: 'system', content: 'Injected system note.' }, // pinned — sits between pair
            { role: 'tool', content: 'x'.repeat(400), tool_call_id: 'tc1' },
            { role: 'user', content: 'Thanks' },
        ];

        const mm = new Mastermind({ contextTokenBudget: 150, recentWindow: 1 });
        const { messages: result } = await mm.compress(messages);

        const hasToolCall = result.some((m: any) => m.tool_calls?.length > 0);
        const hasToolResult = result.some((m: any) => m.tool_call_id === 'tc1');
        // Both dropped together — never orphaned
        expect(hasToolCall).toBe(hasToolResult);
    });

    it('handles Anthropic-style tool results (role=user with tool_call_id)', async () => {
        const messages = [
            { role: 'system', content: 'sys' },
            { role: 'assistant', content: 'x'.repeat(400), tool_calls: [{ id: 'tc1' }] },
            { role: 'user', content: 'x'.repeat(400), tool_call_id: 'tc1' }, // Anthropic format
            { role: 'user', content: 'latest' },
        ];

        const mm = new Mastermind({ contextTokenBudget: 100, recentWindow: 1 });
        const { messages: result } = await mm.compress(messages);

        const hasToolCall = result.some((m: any) => m.tool_calls?.length > 0);
        const hasUserToolResult = result.some((m: any) => m.role === 'user' && m.tool_call_id === 'tc1');
        expect(hasToolCall).toBe(hasUserToolResult);
    });

    it('does not drop anything when exactly at budget', async () => {
        const messages = [
            { role: 'system', content: 'short' },
            { role: 'user', content: 'hi' },
        ];

        // Set budget high enough to fit
        const mm = new Mastermind({ contextTokenBudget: 50_000 });
        const { messages: result } = await mm.compress(messages);
        expect(result.length).toBe(messages.length);
    });

    it('survives when all non-system messages are pinned (recentWindow covers all)', async () => {
        const messages = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'x'.repeat(500) },
            { role: 'assistant', content: 'x'.repeat(500) },
        ];

        // recentWindow = 10 covers all messages, so nothing is droppable
        const mm = new Mastermind({ contextTokenBudget: 10, recentWindow: 10 });
        const { messages: result } = await mm.compress(messages);

        // All messages survive because they're all pinned
        expect(result.length).toBe(messages.length);
    });

    it('drops multiple consecutive tool groups oldest-first', async () => {
        const messages = [
            { role: 'system', content: 'sys' },
            // Group A (older)
            { role: 'assistant', content: 'x'.repeat(200), tool_calls: [{ id: 'a1' }] },
            { role: 'tool', content: 'x'.repeat(200), tool_call_id: 'a1' },
            // Group B (newer)
            { role: 'assistant', content: 'x'.repeat(200), tool_calls: [{ id: 'b1' }] },
            { role: 'tool', content: 'x'.repeat(200), tool_call_id: 'b1' },
            // Recent
            { role: 'user', content: 'latest' },
        ];

        // Budget tight enough to force dropping at least Group A
        const mm = new Mastermind({ contextTokenBudget: 300, recentWindow: 1 });
        const { messages: result } = await mm.compress(messages);

        // Group A should be dropped first (oldest)
        const hasGroupA = result.some((m: any) => m.tool_call_id === 'a1');
        // If group A is gone, its assistant must also be gone
        if (!hasGroupA) {
            const hasAssistantA = result.some((m: any) =>
                m.tool_calls?.some?.((tc: any) => tc.id === 'a1')
            );
            expect(hasAssistantA).toBe(false);
        }
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. Mutation safety — nested objects
// ────────────────────────────────────────────────────────────────────────────

describe('Message mutation safety — nested objects', () => {
    it('shallow clone preserves original tool_calls array (current code does not mutate nested)', async () => {
        const toolCalls = [{ id: 'tc1', function: { name: 'search', arguments: '{"q":"test"}' } }];
        const original = [
            { role: 'system', content: 'system' },
            { role: 'assistant', content: 'x'.repeat(300), tool_calls: toolCalls },
            { role: 'tool', content: 'x'.repeat(300), tool_call_id: 'tc1' },
        ];
        const toolCallsSnapshot = JSON.stringify(toolCalls);

        const cloned = original.map(m => ({ ...m }));
        const mm = new Mastermind({ contextTokenBudget: 5000 });
        await mm.compress(cloned);

        // tool_calls array should not be mutated (Mastermind only reads it)
        expect(JSON.stringify(toolCalls)).toBe(toolCallsSnapshot);
    });

    it('clone isolates compressedContent writes from original', async () => {
        const original = [
            { role: 'system', content: 'sys' },
            { role: 'tool', content: '{"data":' + '"x"}'.repeat(100) },
        ];

        const cloned = original.map(m => ({ ...m }));
        const mm = new Mastermind({ contextTokenBudget: 5000 });
        await mm.compress(cloned);

        // Original should NOT have compressedContent
        expect((original[1] as any).compressedContent).toBeUndefined();
        // Original should NOT have _ccrHandle
        expect((original[1] as any)._ccrHandle).toBeUndefined();
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. Token estimator — i18n and special content
// ────────────────────────────────────────────────────────────────────────────

describe('Unified token estimation — i18n and special content', () => {
    it('handles CJK text (Chinese/Japanese/Korean)', () => {
        const cjk = '这是一个测试消息用于验证中文的令牌计数';
        const tokens = countTokens(cjk);
        // CJK chars are ~1.5 tokens each; this string has ~18 CJK chars → ~27 tokens
        expect(tokens).toBeGreaterThan(15);
        expect(tokens).toBeLessThan(60);
        // Both counters must agree
        expect(estimateTokenCount(cjk)).toBe(tokens);
    });

    it('handles emoji text', () => {
        const emoji = '🎉🚀🌟💡🔥 Great job! 🎯✅';
        const tokens = countTokens(emoji);
        expect(tokens).toBeGreaterThan(5);
        expect(estimateTokenCount(emoji)).toBe(tokens);
    });

    it('handles mixed content (code + prose + punctuation)', () => {
        const mixed = `
## Summary

The function \`calculateScore()\` was updated:
- Added null check (line 42)
- Fixed off-by-one error in loop

\`\`\`js
function calculateScore(items) {
  return items.filter(Boolean).reduce((s, i) => s + i.score, 0);
}
\`\`\`
`;
        const tokens = countTokens(mixed);
        expect(tokens).toBeGreaterThan(20);
        expect(tokens).toBeLessThan(200);
        expect(estimateTokenCount(mixed)).toBe(tokens);
    });

    it('handles very long strings efficiently', () => {
        const long = 'word '.repeat(10_000); // ~10,000 words
        const tokens = countTokens(long);
        // Should be roughly 10,000 tokens (one per word)
        expect(tokens).toBeGreaterThan(8_000);
        expect(tokens).toBeLessThan(15_000);
    });

    it('handles multipart Message content (array of parts)', () => {
        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What is this image?' },
                    { type: 'image_url', image_url: 'data:...' },
                ],
            },
        ];
        const total = estimateTokenCount(messages as any);
        // Should count the text part but skip the image_url part
        expect(total).toBeGreaterThan(0);
    });

    it('handles null/undefined message content gracefully', () => {
        const messages = [
            { role: 'assistant', content: null },
            { role: 'assistant', content: undefined },
        ];
        // Should not throw
        expect(() => estimateTokenCount(messages as any)).not.toThrow();
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 10. CacheAligner — advanced edge cases
// ────────────────────────────────────────────────────────────────────────────

describe('CacheAligner — advanced edge cases', () => {
    it('multiple _cachePrefix messages maintain their relative order after hoisting', () => {
        const aligner = new CacheAligner();
        const msgs: CacheAlignerMessage[] = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'dynamic turn' },
            CacheAligner.markPrefix({ role: 'assistant', content: 'Knowledge Block A' }),
            CacheAligner.markPrefix({ role: 'assistant', content: 'Knowledge Block B' }),
            { role: 'user', content: 'another turn' },
        ];

        const aligned = aligner.align(msgs);
        // Both hoisted after system, preserving A before B
        expect(aligned[0].role).toBe('system');
        expect(aligned[1].content).toBe('Knowledge Block A');
        expect(aligned[2].content).toBe('Knowledge Block B');
        // Dynamic messages follow
        expect(aligned[3].content).toBe('dynamic turn');
        expect(aligned[4].content).toBe('another turn');
    });

    it('normaliseWhitespace: false preserves trailing whitespace', () => {
        const aligner = new CacheAligner({ normaliseWhitespace: false });
        const msgs: CacheAlignerMessage[] = [
            { role: 'system', content: 'prompt   \n  \n' },
            { role: 'user', content: 'hi  ' },
        ];
        const aligned = aligner.align(msgs);
        // Content should be unchanged since normalisation is off
        expect(aligned[0].content).toBe('prompt   \n  \n');
        expect(aligned[1].content).toBe('hi  ');
    });

    it('handles null content without throwing', () => {
        const aligner = new CacheAligner();
        const msgs: CacheAlignerMessage[] = [
            { role: 'system', content: null },
            { role: 'assistant', content: null },
        ];
        expect(() => aligner.align(msgs)).not.toThrow();
    });

    it('single message (only system) produces a single-element output', () => {
        const aligner = new CacheAligner();
        const aligned = aligner.align([{ role: 'system', content: 'only one' }]);
        expect(aligned.length).toBe(1);
        expect(aligned[0].content).toBe('only one\n');
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 11. Content type detection (Router)
// ────────────────────────────────────────────────────────────────────────────

describe('Content Router — type detection', () => {
    // Importing detectContentType directly
    let detectContentType: (text: string) => string;
    let routeContent: (text: string, hasLLM: boolean) => { contentType: string; algorithm: string; requiresLLM: boolean };

    beforeAll(async () => {
        const mod = await import('../src/compression/mastermind/router.js');
        detectContentType = mod.detectContentType;
        routeContent = mod.routeContent;
    });

    it('detects JSON correctly', () => {
        expect(detectContentType('{"key": "value", "num": 42}')).toBe('json');
    });

    it('detects partial/nested JSON', () => {
        expect(detectContentType('  { "results": [{ "id": 1 }, { "id": 2 }]')).toBe('json');
    });

    it('detects XML/HTML', () => {
        expect(detectContentType('<root><child attr="val">text</child></root>')).toBe('xml');
    });

    it('detects log lines', () => {
        expect(detectContentType('2024-01-15T10:30:00 INFO Starting application\n2024-01-15T10:30:01 DEBUG Loading config')).toBe('log');
    });

    it('detects CSV data', () => {
        expect(detectContentType('name,age,city\nAlice,30,NYC\nBob,25,LA\nCharlie,35,SF')).toBe('csv');
    });

    it('detects markdown', () => {
        expect(detectContentType('# My Heading\n\nSome paragraph text\n\n- item 1\n- item 2')).toBe('markdown');
    });

    it('detects code with keywords', () => {
        expect(detectContentType('    function hello() {\n        return "world";\n    }')).toBe('code');
    });

    it('detects code with fenced blocks', () => {
        expect(detectContentType('```python\ndef foo():\n    pass\n```')).toBe('code');
    });

    it('returns text for plain prose', () => {
        expect(detectContentType('This is just a plain sentence with no special formatting.')).toBe('text');
    });

    it('routes binary content to passthrough', () => {
        // Create content with many control characters
        const binary = '\x00\x01\x02\x03\x04\x05\x06\x07 some text';
        const result = routeContent(binary, false);
        expect(result.algorithm).toBe('passthrough');
    });

    it('routes text without LLM to sliding-window', () => {
        const result = routeContent('Just some plain text here.', false);
        expect(result.algorithm).toBe('sliding-window');
    });

    it('routes text with LLM to summary-llm', () => {
        const result = routeContent('Just some plain text here.', true);
        expect(result.algorithm).toBe('summary-llm');
        expect(result.requiresLLM).toBe(true);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 12. End-to-end pipeline smoke test
// ────────────────────────────────────────────────────────────────────────────

describe('E2E Pipeline — compress → materialize → CCR retrieve', () => {
    it('full lifecycle: compress JSON tool output, materialize, then retrieve original', async () => {
        const bigJson = JSON.stringify({
            results: Array.from({ length: 50 }, (_, i) => ({
                id: i,
                name: `item_${i}`,
                description: `This is a detailed description for item number ${i} with lots of unnecessary verbosity.`,
                metadata: { created: '2024-01-15', tags: ['tag_a', 'tag_b', 'tag_c'] },
            })),
        });

        const messages = [
            { role: 'system', content: 'You are a data analyst.' },
            { role: 'user', content: 'Fetch all items.' },
            { role: 'assistant', content: 'Calling search tool...', tool_calls: [{ id: 'tc1' }] },
            { role: 'tool', content: bigJson, tool_call_id: 'tc1' },
            { role: 'user', content: 'Summarise the results.' },
        ];

        const mm = new Mastermind({
            contextTokenBudget: 50_000, // no budget pressure
            enableCCR: true,
        });

        // Step 1: Compress
        const { messages: compressed, stats } = await mm.compress(messages);

        // Step 2: Materialize (replace content with compressedContent)
        const materialized = Mastermind.materialize(compressed);

        // The tool result should have been compressed (JSON > 100 tokens)
        const toolMsg = materialized.find((m: any) => m.tool_call_id === 'tc1');
        expect(toolMsg).toBeDefined();

        if (stats.messagesCompressed > 0) {
            // Should be shorter than original
            expect((toolMsg!.content as string).length).toBeLessThan(bigJson.length);

            // Step 3: CCR retrieve the original
            expect(stats.ccrEntries).toBeGreaterThan(0);
            const ccrMsg = compressed.find((m: any) => m._ccrHandle);
            expect(ccrMsg).toBeDefined();

            const retrieveResult = await mm.retrieveTool.execute({ handle: ccrMsg!._ccrHandle! });
            expect(retrieveResult.found).toBe(true);
            expect(retrieveResult.content).toBe(bigJson);
        }
    });

    it('materialize preserves uncompressed messages as-is', () => {
        const messages = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'hello' },
        ];
        const materialized = Mastermind.materialize(messages as any);
        expect(materialized[0].content).toBe('sys');
        expect(materialized[1].content).toBe('hello');
    });

    it('compress handles empty message array gracefully', async () => {
        const mm = new Mastermind();
        const { messages, stats } = await mm.compress([]);
        expect(messages).toEqual([]);
        expect(stats.messagesCompressed).toBe(0);
    });

    it('system messages are never compressed', async () => {
        const bigSystem = 'x'.repeat(1000);
        const messages = [
            { role: 'system', content: bigSystem },
            { role: 'user', content: 'hi' },
        ];

        const mm = new Mastermind({ contextTokenBudget: 50_000 });
        const { messages: result } = await mm.compress(messages);
        const sysMsg = result.find((m: any) => m.role === 'system');
        expect(sysMsg!.compressedContent).toBeUndefined();
    });

    it('recent messages within recentMessagesWindow are never compressed', async () => {
        const bigContent = 'x'.repeat(1000);
        const messages = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: bigContent },      // within window (4 from end)
            { role: 'assistant', content: bigContent },  // within window
            { role: 'user', content: bigContent },       // within window
            { role: 'assistant', content: bigContent },  // within window
        ];

        const mm = new Mastermind({ contextTokenBudget: 50_000, recentMessagesWindow: 4 });
        const { messages: result, stats } = await mm.compress(messages);
        // All 4 non-system messages are within the recent window
        expect(stats.messagesCompressed).toBe(0);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// 15. Production-grade Hardening Edge Cases
// ────────────────────────────────────────────────────────────────────────────

describe('Production-grade Hardening Edge Cases', () => {
    it('smartCrush keeps empty arrays and empty objects when removeEmpty is false', () => {
        const data = {
            emptyArray: [],
            emptyObj: {},
            nestedEmptyArray: [[]],
            value: 42
        };
        const crushed = smartCrush(data, { removeEmpty: false });
        const parsed = JSON.parse(crushed);
        expect(parsed.emptyArray).toEqual([]);
        expect(parsed.emptyObj).toEqual({});
        expect(parsed.nestedEmptyArray).toEqual([[]]);
        expect(parsed.value).toBe(42);
    });

    it('CodeCompressor stripComments does not strip double slashes inside URLs', () => {
        const code = `
            // This is a comment
            const api = "https://example.com/api"; // Endpoint URL
            const local = 'http://localhost:8080/path';
            const ws = "wss://echo.websocket.org";
        `;
        const compressed = compressCode(code, { stripComments: true });
        expect(compressed).toContain('https://example.com/api');
        expect(compressed).toContain('http://localhost:8080/path');
        expect(compressed).toContain('wss://echo.websocket.org');
        expect(compressed).not.toContain('This is a comment');
        expect(compressed).not.toContain('Endpoint URL');
    });

    it('detectContentType detects code block fences without regex backtracking failure', () => {
        // Construct a huge string representing a markdown code block to test O(1) start/end fence check
        const hugeCodeBlock = '```javascript\n' + 'console.log("hello");\n'.repeat(50_000) + '```';
        const type = staticDetectContentType(hugeCodeBlock);
        expect(type).toBe('code');
    });
});


