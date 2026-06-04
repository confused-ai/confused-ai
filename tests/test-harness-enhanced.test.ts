import { describe, it, expect } from 'vitest';
import { createTestAgent } from '../src/testing/test-agent.js';
import { MockLLMProvider } from '../src/testing/mock-llm.js';
import { MockSessionStore } from '../src/testing/mock-session-store.js';
import { MockMemoryStore } from '../src/testing/mock-memory-store.js';
import { MemoryType } from '../src/memory/types.js';

describe('Enhanced Agent Testing Harness', () => {
    it('wires up mock memory, session, and LLM by default', async () => {
        const harness = await createTestAgent({ response: 'test-reply' });

        expect(harness.llm).toBeInstanceOf(MockLLMProvider);
        expect(harness.sessionStore).toBeInstanceOf(MockSessionStore);
        expect(harness.memoryStore).toBeInstanceOf(MockMemoryStore);

        const result = await harness.agent.run('Hello');
        expect(result.text).toBe('test-reply');
        expect((harness.llm as MockLLMProvider).getCallCount()).toBe(1);
    });

    it('allows overriding mock LLM, session, and memory store', async () => {
        const customLLM = new MockLLMProvider({ response: 'custom-reply' });
        const customSession = new MockSessionStore();
        const customMemory = new MockMemoryStore();

        const harness = await createTestAgent({
            llm: customLLM,
            sessionStore: customSession as any,
            memoryStore: customMemory,
        });

        expect(harness.llm).toBe(customLLM);
        expect(harness.sessionStore).toBe(customSession);
        expect(harness.memoryStore).toBe(customMemory);

        const result = await harness.agent.run('Hello');
        expect(result.text).toBe('custom-reply');
    });

    it('auto-wires inline mockTools and records execution calls', async () => {
        const harness = await createTestAgent({
            response: 'paris-reply',
            mockTools: {
                getWeather: async (args) => {
                    return `Weather in ${args.location || 'unknown'} is sunny`;
                },
            },
            toolCalls: [
                { id: 'c1', name: 'getWeather', arguments: { location: 'Paris' } }
            ]
        });

        expect(harness.toolRegistry).toBeDefined();
        
        // Execute the tool through the registry / agent setup
        const tools = harness.toolRegistry!.toTools();
        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('getWeather');

        const result = await tools[0].execute({ location: 'Paris' }, {
            toolId: 't1',
            agentId: 'a1',
            sessionId: 's1',
            permissions: { allowNetwork: false, allowFileSystem: false, maxExecutionTimeMs: 1000 },
        });

        expect(result.success).toBe(true);
        expect(result.data).toBe('Weather in Paris is sunny');
        expect(harness.toolRegistry!.calls('getWeather')).toHaveLength(1);
        expect(harness.toolRegistry!.lastCall('getWeather')?.args).toEqual({ location: 'Paris' });
    });

    it('captures full lifecycle hooks execution history in hooksHistory', async () => {
        const harness = await createTestAgent({
            response: 'done',
            agentOptions: {
                // Check if user hooks also execute in combination
                hooks: {
                    beforeRun: (prompt) => prompt + ' modified',
                }
            }
        });

        expect(harness.hooksHistory).toHaveLength(0);

        const result = await harness.agent.run('Start');
        expect(result.text).toBe('done');

        // Audit log should contain hook events in chronological order
        const names = harness.hooksHistory.map(h => h.name);
        expect(names).toContain('beforeRun');
        expect(names).toContain('buildSystemPrompt');
        expect(names).toContain('beforeStep');
        expect(names).toContain('afterRun');

        // Check user custom hook executed
        const beforeRunHook = harness.hooksHistory.find(h => h.name === 'beforeRun');
        expect(beforeRunHook?.args[0]).toBe('Start');
    });

    it('resets all mock instances and hooksHistory on reset()', async () => {
        const harness = await createTestAgent({
            response: 'step1',
            mockTools: {
                dummy: () => 'ok'
            }
        });

        await harness.agent.run('go');
        expect(harness.hooksHistory.length).toBeGreaterThan(0);
        expect((harness.llm as MockLLMProvider).getCallCount()).toBe(1);

        harness.reset();

        expect(harness.hooksHistory).toHaveLength(0);
        expect((harness.llm as MockLLMProvider).getCallCount()).toBe(0);
    });

    it('MockMemoryStore matches standard operations and tracks query logs', async () => {
        const store = new MockMemoryStore();
        
        await store.store({
            type: MemoryType.SHORT_TERM,
            content: 'User prefers dark mode',
            metadata: { tags: ['ui'] }
        });

        expect(store.storedEntries).toHaveLength(1);
        expect(store.storedEntries[0].content).toBe('User prefers dark mode');

        const results = await store.retrieve({ query: 'dark', threshold: 0.1 });
        expect(store.retrievedQueries).toHaveLength(1);
        expect(store.retrievedQueries[0].query).toBe('dark');
        expect(results).toHaveLength(1);
        expect(results[0].entry.content).toBe('User prefers dark mode');

        store.reset();
        expect(store.storedEntries).toHaveLength(0);
        expect(store.retrievedQueries).toHaveLength(0);
    });
});
