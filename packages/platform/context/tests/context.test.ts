/**
 * @confused-ai/context — conformance tests.
 *
 * Covers: ContextMode enum, ContextProvider (abstract base class),
 *         ContextBackend (abstract base class), types.
 */

import { describe, it, expect } from 'vitest';
import {
    ContextMode,
    ContextProvider,
    ContextBackend,
} from '@confused-ai/context';
import type { Answer, Document, QueryOptions } from '@confused-ai/context';

// ── Minimal concrete implementations ─────────────────────────────────────────

class StaticContextProvider extends ContextProvider {
    private docs: Document[];

    constructor(docs: Document[] = [], name = 'static') {
        super({ name });
        this.docs = docs;
    }

    async query(query: string, options?: QueryOptions): Promise<Answer> {
        const results = this.docs.filter(d =>
            d.content?.toLowerCase().includes(query.toLowerCase())
        ).slice(0, options?.limit ?? 10);
        return { results, text: results.map(d => d.content).join('\n') };
    }
}

class StaticContextBackend extends ContextBackend {
    private store: Document[] = [];

    async search(query: string, options?: QueryOptions): Promise<Document[]> {
        return this.store
            .filter(d => d.content?.includes(query))
            .slice(0, options?.limit ?? 10);
    }

    async upsert(documents: Document[]): Promise<void> {
        for (const doc of documents) {
            const idx = this.store.findIndex(d => d.id === doc.id);
            if (idx >= 0) this.store[idx] = doc;
            else this.store.push(doc);
        }
    }

    async delete(ids: string[]): Promise<void> {
        this.store = this.store.filter(d => !ids.includes(d.id));
    }
}

// ── ContextMode ───────────────────────────────────────────────────────────────

describe('ContextMode', () => {
    it('has DEFAULT value', () => {
        expect(ContextMode.DEFAULT).toBe('default');
    });

    it('has AGENT value', () => {
        expect(ContextMode.AGENT).toBe('agent');
    });

    it('has TOOLS value', () => {
        expect(ContextMode.TOOLS).toBe('tools');
    });
});

// ── ContextProvider ───────────────────────────────────────────────────────────

describe('ContextProvider', () => {
    it('constructor sets name', () => {
        const p = new StaticContextProvider([], 'my-provider');
        expect(p.name).toBe('my-provider');
    });

    it('default mode is DEFAULT', () => {
        const p = new StaticContextProvider();
        expect(p.mode).toBe(ContextMode.DEFAULT);
    });

    it('accepts explicit mode', () => {
        const p = new StaticContextProvider();
        // Override via config
        class ToolModeProvider extends ContextProvider {
            async query(): Promise<Answer> { return { results: [] }; }
        }
        const tp = new ToolModeProvider({ name: 'tool-p', mode: ContextMode.TOOLS });
        expect(tp.mode).toBe(ContextMode.TOOLS);
    });

    it('derives queryToolName from provider name', () => {
        const p = new StaticContextProvider([], 'wiki');
        expect(p.queryToolName).toBe('wiki_query');
    });

    it('derives updateToolName from provider name', () => {
        const p = new StaticContextProvider([], 'wiki');
        expect(p.updateToolName).toBe('wiki_update');
    });

    it('accepts custom queryToolName/updateToolName', () => {
        class Custom extends ContextProvider {
            async query(): Promise<Answer> { return { results: [] }; }
        }
        const c = new Custom({ name: 'x', queryToolName: 'ask', updateToolName: 'store' });
        expect(c.queryToolName).toBe('ask');
        expect(c.updateToolName).toBe('store');
    });

    it('status() returns ok: true by default', () => {
        const p = new StaticContextProvider();
        const s = p.status();
        expect(s.ok).toBe(true);
    });

    it('setup() resolves without error', async () => {
        const p = new StaticContextProvider();
        await expect(p.setup()).resolves.toBeUndefined();
    });

    it('close() resolves without error', async () => {
        const p = new StaticContextProvider();
        await expect(p.close()).resolves.toBeUndefined();
    });

    it('update() throws by default (not supported)', async () => {
        const p = new StaticContextProvider();
        await expect(p.update([])).rejects.toThrow(/not supported/);
    });

    it('query() returns matching documents', async () => {
        const docs: Document[] = [
            { id: '1', name: 'Foo', content: 'hello world' },
            { id: '2', name: 'Bar', content: 'goodbye world' },
        ];
        const p = new StaticContextProvider(docs);
        const answer = await p.query('hello');
        expect(answer.results).toHaveLength(1);
        expect(answer.results[0]!.id).toBe('1');
    });

    it('query() respects limit option', async () => {
        const docs: Document[] = Array.from({ length: 5 }, (_, i) => ({
            id: String(i),
            name: `Doc ${i}`,
            content: 'match',
        }));
        const p = new StaticContextProvider(docs);
        const answer = await p.query('match', { limit: 2 });
        expect(answer.results).toHaveLength(2);
    });

    it('astatus() resolves with same shape as status()', async () => {
        const p = new StaticContextProvider();
        const s = await p.astatus();
        expect(s.ok).toBe(true);
    });
});

// ── ContextBackend ────────────────────────────────────────────────────────────

describe('ContextBackend', () => {
    it('search() returns matching docs', async () => {
        const backend = new StaticContextBackend();
        await backend.upsert([
            { id: 'a', name: 'A', content: 'apple' },
            { id: 'b', name: 'B', content: 'banana' },
        ]);
        const results = await backend.search('apple');
        expect(results).toHaveLength(1);
        expect(results[0]!.id).toBe('a');
    });

    it('upsert() adds new documents', async () => {
        const backend = new StaticContextBackend();
        await backend.upsert([{ id: '1', name: 'X', content: 'test' }]);
        const results = await backend.search('test');
        expect(results).toHaveLength(1);
    });

    it('upsert() replaces existing document with same id', async () => {
        const backend = new StaticContextBackend();
        await backend.upsert([{ id: '1', name: 'X', content: 'original' }]);
        await backend.upsert([{ id: '1', name: 'X', content: 'updated' }]);
        const results = await backend.search('updated');
        expect(results).toHaveLength(1);
        const old = await backend.search('original');
        expect(old).toHaveLength(0);
    });

    it('delete() removes document by id', async () => {
        const backend = new StaticContextBackend();
        await backend.upsert([{ id: '1', name: 'X', content: 'test' }]);
        await backend.delete(['1']);
        const results = await backend.search('test');
        expect(results).toHaveLength(0);
    });
});
