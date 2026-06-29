/**
 * Next-gen feature parity — regression tests for the three capability gaps
 * closed against the competitive analysis:
 *   1. Tiered self-editing memory (Letta / MemGPT-style core + archival)
 *   2. Workflow suspend / resume (LangGraph-style human-in-the-loop)
 *   3. Agent data-stream protocol (Vercel-style SSE in / out)
 *
 * All imported from the package root barrel so the wiring is validated too.
 */

import { describe, it, expect } from 'vitest';
import {
    TieredMemory,
    createTieredMemoryTools,
    createWorkflow,
    isSuspended,
    toDataStream,
    readDataStream,
    type MemoryStore,
} from '../src/index.js';
// The data-stream protocol uses the rich typed-event StreamChunk from create-agent
// (distinct from core's text-only StreamChunk re-exported at the root).
import type { StreamChunk } from '../src/create-agent/types.js';

// ── Minimal in-memory MemoryStore for archival (substring match) ──────────────
function makeFakeStore(): MemoryStore {
    const items: Array<{ id: string; content: string }> = [];
    return {
        async store(entry) {
            const rec = { id: `m${items.length}`, content: entry.content };
            items.push(rec);
            return { id: rec.id, createdAt: new Date(), ...entry } as any;
        },
        async retrieve(query) {
            const limit = query.limit ?? 5;
            return items
                .filter((i) => i.content.toLowerCase().includes(query.query.toLowerCase()))
                .slice(0, limit)
                .map((i) => ({ entry: { id: i.id, content: i.content } as any, score: 1 }));
        },
        get: async () => null,
        update: async () => ({}) as any,
        delete: async () => true,
        clear: async () => {},
        getRecent: async () => [],
        snapshot: async () => [],
    };
}

describe('Tiered self-editing memory', () => {
    it('renders core blocks into a prompt section', () => {
        const mem = new TieredMemory({
            blocks: [
                { label: 'persona', value: 'I am helpful.' },
                { label: 'human', value: '' },
            ],
        });
        const rendered = mem.renderCore();
        expect(rendered).toContain('[Core Memory]');
        expect(rendered).toContain('<persona');
        expect(rendered).toContain('I am helpful.');
    });

    it('appends and replaces core memory', () => {
        const mem = new TieredMemory({ blocks: [{ label: 'human', value: 'Name: Jordan.' }] });
        mem.coreAppend('human', 'Likes Rust.');
        expect(mem.get('human')).toBe('Name: Jordan.\nLikes Rust.');
        mem.coreReplace('human', 'Jordan', 'Sam');
        expect(mem.get('human')).toContain('Name: Sam.');
    });

    it('enforces the per-block character limit', () => {
        const mem = new TieredMemory({ blocks: [{ label: 'x', value: '', limit: 10 }] });
        expect(() => mem.coreAppend('x', '12345678901')).toThrow(/limit/);
    });

    it('rejects edits to unknown blocks', () => {
        const mem = new TieredMemory();
        expect(() => mem.coreAppend('nope', 'hi')).toThrow(/Unknown core-memory block/);
    });

    it('inserts and searches archival memory', async () => {
        const mem = new TieredMemory({ archival: makeFakeStore() });
        await mem.archivalInsert('The capital of France is Paris.');
        const hits = await mem.archivalSearch('Paris');
        expect(hits).toContain('The capital of France is Paris.');
    });

    it('exposes the four Letta-style self-edit tools and they mutate state', async () => {
        const mem = new TieredMemory({ blocks: [{ label: 'human', value: '' }], archival: makeFakeStore() });
        const tools = createTieredMemoryTools(mem);
        expect(Object.keys(tools)).toEqual([
            'core_memory_append',
            'core_memory_replace',
            'archival_memory_insert',
            'archival_memory_search',
        ]);
        await tools.core_memory_append.execute({ label: 'human', content: 'Lives in Lisbon.' });
        expect(mem.get('human')).toContain('Lisbon');
        await tools.archival_memory_insert.execute({ content: 'Pet named Mango.' });
        const found = await tools.archival_memory_search.execute({ query: 'Mango' });
        expect(found.count).toBe(1);
    });
});

describe('Workflow suspend / resume', () => {
    // Minimal agent stub matching the DefinedAgent.run shape Workflow calls.
    const agent = (reply: string) =>
        ({ run: async () => reply }) as any;

    it('completes a workflow with no suspend step', async () => {
        const res = await createWorkflow().task('a', agent('done')).execute();
        expect(res.status).toBe('completed');
        if (res.status === 'completed') expect(res.results['a']).toBe('done');
    });

    it('pauses at a suspend step and resumes with the supplied value', async () => {
        const wf = createWorkflow()
            .task('draft', agent('draft text'))
            .suspend('approval', 'Approve the draft?')
            .task('publish', agent('published'))
            .build();

        const paused = await wf.execute({ topic: 'launch' });
        expect(isSuspended(paused)).toBe(true);
        if (!isSuspended(paused)) throw new Error('expected suspension');
        expect(paused.awaiting).toBe('approval');
        expect(paused.message).toBe('Approve the draft?');
        expect(paused.results['draft']).toBe('draft text');
        // Should NOT have run the publish step yet.
        expect(paused.results['publish']).toBeUndefined();

        const resumed = await wf.resume(paused, 'approved');
        expect(resumed.status).toBe('completed');
        if (resumed.status === 'completed') {
            expect(resumed.results['approval']).toBe('approved');
            expect(resumed.results['publish']).toBe('published');
        }
    });
});

describe('Agent data-stream protocol', () => {
    async function* fakeEvents(): AsyncGenerator<StreamChunk> {
        yield { type: 'text-delta', delta: 'Hello' };
        yield { type: 'tool-call', tool: { name: 'calc', input: { a: 1 } } };
        yield { type: 'step-finish', stepNumber: 1 };
        yield { type: 'text-delta', delta: ' world' };
    }

    it('round-trips typed events through SSE encode → decode', async () => {
        const stream = toDataStream(fakeEvents());
        const received: StreamChunk[] = [];
        for await (const ev of readDataStream(stream)) received.push(ev);

        expect(received.map((e) => e.type)).toEqual([
            'text-delta',
            'tool-call',
            'step-finish',
            'text-delta',
        ]);
        expect(received[0]?.delta).toBe('Hello');
        expect(received[1]?.tool?.name).toBe('calc');
        expect(received[2]?.stepNumber).toBe(1);
        const text = received.filter((e) => e.type === 'text-delta').map((e) => e.delta).join('');
        expect(text).toBe('Hello world');
    });

    it('emits a terminal error event when the source throws', async () => {
        async function* boom(): AsyncGenerator<StreamChunk> {
            yield { type: 'text-delta', delta: 'partial' };
            throw new Error('upstream failed');
        }
        const received: StreamChunk[] = [];
        for await (const ev of readDataStream(toDataStream(boom()))) received.push(ev);
        const last = received.at(-1);
        expect(last?.type).toBe('error');
        expect(last?.error?.message).toBe('upstream failed');
    });
});
