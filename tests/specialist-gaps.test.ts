/**
 * Specialist-tier feature parity — regression tests for the three second-tier
 * gaps closed against the competitive analysis:
 *   1. Prompt management / versioning  (Langfuse / Braintrust parity)
 *   2. Graph / entity memory           (Zep / Mem0 parity)
 *   3. Prompt optimization             (DSPy bootstrap-few-shot parity)
 *
 * Imported from the package root barrel so wiring is validated too.
 */

import { describe, it, expect } from 'vitest';
import {
    PromptRegistry,
    renderTemplate,
    GraphMemory,
    createGraphMemoryTools,
    bootstrapFewShot,
} from '../src/index.js';

describe('Prompt management / versioning', () => {
    it('substitutes {{vars}} and leaves unknown placeholders intact', () => {
        expect(renderTemplate('Hi {{name}} from {{city}}', { name: 'Sam' })).toBe('Hi Sam from {{city}}');
    });

    it('versions, pins, and renders the pinned default', () => {
        const r = new PromptRegistry();
        expect(r.register('greet', 'Hello {{name}}.')).toBe('v1');
        expect(r.register('greet', 'Hey {{name}}!')).toBe('v2');
        expect(r.versions('greet')).toEqual(['v1', 'v2']);
        // First version is the default until pinned otherwise.
        expect(r.render('greet', { name: 'Sam' })).toBe('Hello Sam.');
        r.pin('greet', 'v2');
        expect(r.render('greet', { name: 'Sam' })).toBe('Hey Sam!');
        // Explicit selector overrides the pin.
        expect(r.render('greet', { name: 'Sam' }, { version: 'v1' })).toBe('Hello Sam.');
    });

    it('selects by label (latest labelled wins)', () => {
        const r = new PromptRegistry();
        r.register('sys', 'A', { labels: ['production'] });
        r.register('sys', 'B', { labels: ['production'] });
        expect(r.get('sys', { label: 'production' }).template).toBe('B');
    });

    it('A/B selects deterministically with an injected rng', () => {
        const r = new PromptRegistry();
        r.register('x', 'A'); // v1
        r.register('x', 'B'); // v2
        // weight 1:1, rand=0.1 → first bucket (v1); rand=0.9 → second (v2)
        expect(r.abSelect('x', { v1: 1, v2: 1 }, () => 0.1).version).toBe('v1');
        expect(r.abSelect('x', { v1: 1, v2: 1 }, () => 0.9).version).toBe('v2');
    });

    it('throws on unknown prompt or version', () => {
        const r = new PromptRegistry();
        expect(() => r.render('nope')).toThrow(/unknown prompt/);
        r.register('a', 'x');
        expect(() => r.get('a', { version: 'v9' })).toThrow(/no version/);
    });
});

describe('Graph / entity memory', () => {
    it('records relations and searches an entity', () => {
        const g = new GraphMemory();
        g.addRelation('Jordan', 'works_at', 'AcmeCorp');
        g.addRelation('Jordan', 'lives_in', 'Lisbon');
        expect(g.search('Jordan')).toEqual(['Jordan works_at AcmeCorp', 'Jordan lives_in Lisbon']);
        expect(g.neighbors('Jordan').sort()).toEqual(['AcmeCorp', 'Lisbon']);
    });

    it('auto-creates endpoints and dedupes identical triples', () => {
        const g = new GraphMemory();
        g.addRelation('A', 'rel', 'B');
        g.addRelation('A', 'rel', 'B'); // duplicate
        expect(g.allRelations()).toHaveLength(1);
        expect(g.entityNames().sort()).toEqual(['A', 'B']);
    });

    it('self-edit tools mutate the graph', async () => {
        const g = new GraphMemory();
        const tools = createGraphMemoryTools(g);
        expect(Object.keys(tools)).toEqual(['add_entity', 'add_relation', 'search_graph']);
        await tools.add_relation.execute({ from: 'Sam', relation: 'owns', to: 'Mango' });
        const found = await tools.search_graph.execute({ name: 'Sam' });
        expect(found.facts).toContain('Sam owns Mango');
        expect(found.neighbors).toContain('Mango');
    });
});

describe('Prompt optimization (bootstrap few-shot)', () => {
    const exactScorer = (expected: string, actual: string) =>
        actual.trim().toLowerCase() === expected.toLowerCase() ? 1 : 0;

    it('keeps only examples the model answers correctly and compiles demos', async () => {
        // Fake model: always answers "positive" — correct for the two positive
        // examples, wrong for the negative one (which is therefore dropped).
        const generate = async (): Promise<string> => 'positive';
        const optimized = await bootstrapFewShot({
            instruction: 'Classify sentiment.',
            trainset: [
                { input: 'I love this', expected: 'positive' },
                { input: 'this is great', expected: 'positive' },
                { input: 'meh, terrible', expected: 'negative' }, // model says positive → dropped
            ],
            generate,
            scorer: exactScorer,
        });
        expect(optimized.demos).toHaveLength(2);
        expect(optimized.demos.map((d) => d.input)).toEqual(['I love this', 'this is great']);
        expect(optimized.yield).toBeCloseTo(2 / 3, 5);
    });

    it('renders an optimized prompt containing the demos and the new input', async () => {
        const optimized = await bootstrapFewShot({
            instruction: 'Echo.',
            trainset: [{ input: 'a', expected: 'a' }],
            generate: async () => 'a',
            scorer: exactScorer,
        });
        const prompt = optimized.render('z');
        expect(prompt).toContain('Echo.');
        expect(prompt).toContain('Input: a');
        expect(prompt).toContain('Output: a');
        expect(prompt.endsWith('Input: z\nOutput:')).toBe(true);
    });

    it('respects maxDemos', async () => {
        const optimized = await bootstrapFewShot({
            instruction: 'i',
            trainset: Array.from({ length: 6 }, (_, n) => ({ input: `x${n}`, expected: 'ok' })),
            generate: async () => 'ok',
            scorer: exactScorer,
            maxDemos: 3,
        });
        expect(optimized.demos).toHaveLength(3);
        expect(optimized.yield).toBe(1);
    });

    it('skips examples whose generation throws, reflecting it in the yield', async () => {
        let calls = 0;
        const generate = async (): Promise<string> => {
            calls++;
            if (calls === 2) throw new Error('model down');
            return 'ok';
        };
        const optimized = await bootstrapFewShot({
            instruction: 'i',
            trainset: [
                { input: 'a', expected: 'ok' },
                { input: 'b', expected: 'ok' }, // generation throws → skipped
                { input: 'c', expected: 'ok' },
            ],
            generate,
            scorer: exactScorer,
        });
        expect(optimized.demos.map((d) => d.input)).toEqual(['a', 'c']);
        expect(optimized.yield).toBeCloseTo(2 / 3, 5);
    });

    it('handles an empty trainset (yield 0, render still works)', async () => {
        const optimized = await bootstrapFewShot({
            instruction: 'Solo.',
            trainset: [],
            generate: async () => '',
            scorer: exactScorer,
        });
        expect(optimized.demos).toEqual([]);
        expect(optimized.yield).toBe(0);
        // No demos → render is instruction + the new input only.
        expect(optimized.render('q')).toBe('Solo.\n\nInput: q\nOutput:');
    });

    it('uses a custom formatInput for non-string inputs', async () => {
        const optimized = await bootstrapFewShot<{ a: number }>({
            instruction: 'sum',
            trainset: [{ input: { a: 1 }, expected: '1' }],
            generate: async () => '1',
            scorer: exactScorer,
            formatInput: (i) => `a=${i.a}`,
        });
        expect(optimized.render({ a: 9 })).toContain('Input: a=9');
        expect(optimized.render({ a: 9 })).toContain('Input: a=1');
    });

    it('default formatInput JSON-encodes object inputs', async () => {
        const optimized = await bootstrapFewShot<{ k: string }>({
            instruction: 'i',
            trainset: [],
            generate: async () => '',
            scorer: exactScorer,
        });
        expect(optimized.render({ k: 'v' })).toContain('{"k":"v"}');
    });

    it('respects a custom threshold', async () => {
        // scorer returns 0.4; threshold 0.3 keeps it, default 0.5 would drop it.
        const optimized = await bootstrapFewShot({
            instruction: 'i',
            trainset: [{ input: 'a', expected: 'a' }],
            generate: async () => 'a',
            scorer: () => 0.4,
            threshold: 0.3,
        });
        expect(optimized.demos).toHaveLength(1);
    });
});

describe('Prompt registry — edge cases', () => {
    it('throws on duplicate explicit version', () => {
        const r = new PromptRegistry();
        r.register('p', 'a', { version: 'v1' });
        expect(() => r.register('p', 'b', { version: 'v1' })).toThrow(/already exists/);
    });

    it('pin option on register makes it the default immediately', () => {
        const r = new PromptRegistry();
        r.register('p', 'first');
        r.register('p', 'second', { pin: true });
        expect(r.defaultVersion('p')).toBe('v2');
        expect(r.render('p')).toBe('second');
    });

    it('pin throws for an unknown version', () => {
        const r = new PromptRegistry();
        r.register('p', 'a');
        expect(() => r.pin('p', 'v9')).toThrow(/cannot pin unknown version/);
    });

    it('get by missing label throws', () => {
        const r = new PromptRegistry();
        r.register('p', 'a');
        expect(() => r.get('p', { label: 'prod' })).toThrow(/no version labelled/);
    });

    it('abSelect falls back to the default when no positive weights apply', () => {
        const r = new PromptRegistry();
        r.register('p', 'a'); // v1
        r.register('p', 'b'); // v2
        const sel = r.abSelect('p', { v1: 0, v2: 0 });
        expect(sel.version).toBe('v1'); // default
    });

    it('lists names and a deterministic clock stamps createdAt', () => {
        const fixed = new Date('2026-01-01T00:00:00Z');
        const r = new PromptRegistry({ clock: () => fixed });
        r.register('a', 'x');
        r.register('b', 'y');
        expect(r.names().sort()).toEqual(['a', 'b']);
        expect(r.get('a').createdAt).toBe(fixed);
    });
});

describe('Graph memory — edge cases', () => {
    it('updates an existing entity, merging type and props', () => {
        const g = new GraphMemory();
        g.addEntity('X', { type: 'thing', props: { a: 1 } });
        g.addEntity('X', { props: { b: 2 } });
        const e = g.getEntity('X');
        expect(e?.type).toBe('thing');
        expect(e?.props).toEqual({ a: 1, b: 2 });
    });

    it('returns empty facts for an unknown entity', () => {
        expect(new GraphMemory().search('ghost')).toEqual([]);
    });

    it('relationsOf includes incoming edges; toFacts lists everything', () => {
        const g = new GraphMemory();
        g.addRelation('A', 'r1', 'B');
        g.addRelation('C', 'r2', 'B'); // incoming to B
        expect(g.relationsOf('B').map((x) => `${x.from} ${x.relation} ${x.to}`).sort()).toEqual([
            'A r1 B',
            'C r2 B',
        ]);
        expect(g.toFacts().sort()).toEqual(['A r1 B', 'C r2 B']);
    });

    it('add_entity tool creates a typed entity', async () => {
        const g = new GraphMemory();
        const tools = createGraphMemoryTools(g);
        const out = await tools.add_entity.execute({ name: 'Acme', type: 'company' });
        expect(out.created).toBe(true);
        expect(g.getEntity('Acme')?.type).toBe('company');
    });

    it('overwrites the type on an existing entity', () => {
        const g = new GraphMemory();
        g.addEntity('X', { type: 'draft' });
        g.addEntity('X', { type: 'final' });
        expect(g.getEntity('X')?.type).toBe('final');
    });

    it('add_entity tool works without an optional type', async () => {
        const g = new GraphMemory();
        const tools = createGraphMemoryTools(g);
        await tools.add_entity.execute({ name: 'Untyped' });
        expect(g.getEntity('Untyped')?.type).toBeUndefined();
    });
});
