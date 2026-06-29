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
    toSSEResponse,
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

    it('renders empty string when no core blocks exist', () => {
        expect(new TieredMemory().renderCore()).toBe('');
    });

    it('includes a block description in the rendered core', () => {
        const mem = new TieredMemory({
            blocks: [{ label: 'persona', value: 'hi', description: 'who I am' }],
        });
        expect(mem.renderCore()).toContain('— who I am');
    });

    it('coreReplace with empty oldText overwrites the whole block', () => {
        const mem = new TieredMemory({ blocks: [{ label: 'h', value: 'old stuff' }] });
        expect(mem.coreReplace('h', '', 'brand new')).toBe('brand new');
        expect(mem.get('h')).toBe('brand new');
    });

    it('coreReplace throws when the search text is absent', () => {
        const mem = new TieredMemory({ blocks: [{ label: 'h', value: 'abc' }] });
        expect(() => mem.coreReplace('h', 'zzz', 'q')).toThrow(/not found/);
    });

    it('coreReplace throws when the result exceeds the limit', () => {
        const mem = new TieredMemory({ blocks: [{ label: 'h', value: 'abc', limit: 5 }] });
        expect(() => mem.coreReplace('h', 'abc', '1234567')).toThrow(/limit/);
    });

    it('reports per-block and default limits, and lists labels', () => {
        const mem = new TieredMemory({
            blocks: [{ label: 'a', value: '' }, { label: 'b', value: '', limit: 50 }],
            defaultBlockLimit: 99,
        });
        expect(mem.labels()).toEqual(['a', 'b']);
        expect(mem.limitOf('a')).toBe(99);
        expect(mem.limitOf('b')).toBe(50);
        expect(mem.get('missing')).toBeUndefined();
    });

    it('throws when archival is used but not configured', async () => {
        const mem = new TieredMemory({ blocks: [{ label: 'x', value: '' }] });
        await expect(mem.archivalInsert('fact')).rejects.toThrow(/not configured/);
        await expect(mem.archivalSearch('q')).rejects.toThrow(/not configured/);
    });

    it('stores archival entries with tags via the tool', async () => {
        const mem = new TieredMemory({ archival: makeFakeStore() });
        const res = await mem.archivalInsert('Tagged fact.', ['topic']);
        expect(typeof res).toBe('string');
        expect(await mem.archivalSearch('Tagged')).toContain('Tagged fact.');
    });

    it('core_memory_replace tool edits state', async () => {
        const mem = new TieredMemory({ blocks: [{ label: 'human', value: 'Name: Jordan.' }] });
        const tools = createTieredMemoryTools(mem);
        const out = await tools.core_memory_replace.execute({
            label: 'human',
            old_content: 'Jordan',
            new_content: 'Alex',
        });
        expect(out.value).toContain('Alex');
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

    it('round-trips a run-finish event with its run payload', async () => {
        const run = { text: 'final', messages: [], steps: 2, finishReason: 'stop' } as any;
        async function* evs(): AsyncGenerator<StreamChunk> {
            yield { type: 'run-finish', run };
        }
        const out: StreamChunk[] = [];
        for await (const ev of readDataStream(toDataStream(evs()))) out.push(ev);
        expect(out).toHaveLength(1);
        expect(out[0]?.type).toBe('run-finish');
        expect(out[0]?.run?.text).toBe('final');
        expect(out[0]?.run?.steps).toBe(2);
    });

    it('yields nothing for an empty stream', async () => {
        async function* empty(): AsyncGenerator<StreamChunk> {}
        const out: StreamChunk[] = [];
        for await (const ev of readDataStream(toDataStream(empty()))) out.push(ev);
        expect(out).toEqual([]);
    });

    it('toSSEResponse sets event-stream headers and SSE body', async () => {
        async function* evs(): AsyncGenerator<StreamChunk> {
            yield { type: 'text-delta', delta: 'hi' };
        }
        const res = toSSEResponse(evs());
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        const body = await res.text();
        expect(body).toBe('data: {"type":"text-delta","delta":"hi"}\n\n');
    });

    it('reads from a Response-like object exposing a body stream', async () => {
        async function* evs(): AsyncGenerator<StreamChunk> {
            yield { type: 'text-delta', delta: 'x' };
        }
        const wrapped = { body: toDataStream(evs()) };
        const out: StreamChunk[] = [];
        for await (const ev of readDataStream(wrapped)) out.push(ev);
        expect(out[0]?.delta).toBe('x');
    });

    it('throws when the source has no readable body', async () => {
        await expect(async () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _ of readDataStream({ body: null })) { /* unreachable */ }
        }).rejects.toThrow(/no readable body/);
    });
});

describe('Workflow suspend / resume — edge cases', () => {
    const agent = (reply: string) => ({ run: async () => reply }) as any;

    it('runs a parallel batch and merges results before a later sequential step', async () => {
        const res = await createWorkflow()
            .parallel()
            .task('a', agent('ra'))
            .task('b', agent('rb'))
            .sequential()
            .task('c', agent('rc'))
            .execute();
        expect(res.status).toBe('completed');
        if (res.status === 'completed') {
            expect(res.results['a']).toBe('ra');
            expect(res.results['b']).toBe('rb');
            expect(res.results['c']).toBe('rc');
        }
    });

    it('handles two suspend steps in sequence, resuming each', async () => {
        const wf = createWorkflow()
            .task('t1', agent('one'))
            .suspend('gate1')
            .task('t2', agent('two'))
            .suspend('gate2', 'second gate')
            .task('t3', agent('three'))
            .build();

        const p1 = await wf.execute();
        if (!isSuspended(p1)) throw new Error('expected first suspension');
        expect(p1.awaiting).toBe('gate1');
        expect(p1.token).toMatch(/.+/);
        expect(p1.message).toBeUndefined();

        const p2 = await wf.resume(p1, 'ok1');
        if (!isSuspended(p2)) throw new Error('expected second suspension');
        expect(p2.awaiting).toBe('gate2');
        expect(p2.message).toBe('second gate');
        expect(p2.results['gate1']).toBe('ok1');
        expect(p2.results['t2']).toBe('two');

        const done = await wf.resume(p2, 'ok2');
        expect(done.status).toBe('completed');
        if (done.status === 'completed') {
            expect(done.results['gate2']).toBe('ok2');
            expect(done.results['t3']).toBe('three');
        }
    });

    it('flushes a pending parallel batch before suspending', async () => {
        const wf = createWorkflow()
            .parallel()
            .task('a', agent('ra'))
            .task('b', agent('rb'))
            .suspend('approve')
            .build();
        const paused = await wf.execute();
        if (!isSuspended(paused)) throw new Error('expected suspension');
        // Parallel results must be present at the pause point.
        expect(paused.results['a']).toBe('ra');
        expect(paused.results['b']).toBe('rb');
    });

    it('records dependsOn metadata without breaking execution', async () => {
        const res = await createWorkflow()
            .task('a', agent('ra'))
            .task('b', agent('rb'))
            .dependsOn('a')
            .execute();
        expect(res.status).toBe('completed');
        if (res.status === 'completed') expect(res.results['b']).toBe('rb');
    });

    it('dependsOn is a no-op when the preceding step is not a task', async () => {
        // .parallel() pushes a marker step, so dependsOn has no task to attach to.
        const res = await createWorkflow().parallel().dependsOn('x').execute();
        expect(res.status).toBe('completed');
    });
});

describe('Agent data-stream protocol — cancellation', () => {
    it('propagates cancel to the source iterator on client disconnect', async () => {
        let cleanedUp = false;
        async function* infinite(): AsyncGenerator<StreamChunk> {
            try {
                for (;;) yield { type: 'text-delta', delta: 'x' };
            } finally {
                cleanedUp = true; // generator return() ran → upstream aborts
            }
        }
        const stream = toDataStream(infinite());
        const reader = stream.getReader();
        await reader.read();
        await reader.cancel('client gone');
        expect(cleanedUp).toBe(true);
    });

    it('stringifies a non-Error thrown value into the error event', async () => {
        async function* boom(): AsyncGenerator<StreamChunk> {
            yield { type: 'text-delta', delta: 'x' };
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw 'plain string failure';
        }
        const out: StreamChunk[] = [];
        for await (const ev of readDataStream(toDataStream(boom()))) out.push(ev);
        expect(out.at(-1)?.error?.message).toBe('plain string failure');
    });

    it('ignores SSE frames that carry no data line', async () => {
        // Hand-rolled stream: a comment frame, then a real data frame.
        const encoder = new TextEncoder();
        const raw = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode(': keep-alive comment\n\n'));
                controller.enqueue(encoder.encode('data: {"type":"text-delta","delta":"ok"}\n\n'));
                controller.close();
            },
        });
        const out: StreamChunk[] = [];
        for await (const ev of readDataStream(raw)) out.push(ev);
        expect(out).toHaveLength(1);
        expect(out[0]?.delta).toBe('ok');
    });
});
