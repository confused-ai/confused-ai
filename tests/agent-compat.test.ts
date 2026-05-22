import { describe, expect, it } from 'vitest';

import { Agent } from '../src/agent.js';
import { InMemoryCheckpointStore } from '../src/execution/state-graph.js';
import { InMemorySessionStore } from '../src/session/index.js';

describe('Agent compatibility surface', () => {
    it('keeps legacy constructor defaults while exposing fluent API', () => {
        const agent = new Agent({ instructions: 'You are helpful.' });
        const opts = (agent as any)._opts;

        expect(agent.name).toBe('Agent');
        expect(agent.instructions).toBe('You are helpful.');
        expect(agent.learning).toBe(false);
        expect(opts.sessionStore).toBeInstanceOf(InMemorySessionStore);
        expect(Array.isArray(opts.tools)).toBe(true);
        expect(opts.tools).toHaveLength(2);
        expect(opts.tools[0]?.constructor?.name).toBe('HttpClientTool');
        expect(opts.tools[1]?.constructor?.name).toBe('BrowserTool');
    });

    it('supports legacy db option and new fluent methods on the same instance', () => {
        const db = new InMemorySessionStore();
        const agent = new Agent({ instructions: 'You are helpful.', db, learning: true })
            .withName('DocsBot')
            .withInstructions('You are exact and concise.')
            .memory({} as any);

        const opts = (agent as any)._opts;

        expect(agent.name).toBe('DocsBot');
        expect(agent.instructions).toBe('You are exact and concise.');
        expect(agent.learning).toBe(true);
        expect(opts.sessionStore).toBe(db);
        expect(opts.enableAgenticMemory).toBe(true);
    });

    it('installs an in-memory checkpoint store for zero-arg durable()', () => {
        const agent = new Agent({ instructions: 'You are helpful.' }).durable();
        const opts = (agent as any)._opts;

        expect(opts.checkpointStore).toBeInstanceOf(InMemoryCheckpointStore);
    });
});

describe('Agent unified class surface', () => {
    it('keeps the single class-based API as the modern surface', () => {
        const agent = new Agent({ instructions: 'You are a helpful AI assistant.', tools: [] });
        const opts = (agent as any)._opts;

        expect(opts.name).toBe('Agent');
        expect(opts.instructions).toBe('You are a helpful AI assistant.');
        expect(opts.sessionStore).toBeInstanceOf(InMemorySessionStore);
        expect(opts.tools).toEqual([]);
    });
});
