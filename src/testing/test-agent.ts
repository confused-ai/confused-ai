/**
 * createTestAgent — zero-config agent harness for unit tests.
 *
 * Auto-wires MockLLMProvider + MockSessionStore so you can test agent behavior
 * without real API calls or a database.
 *
 * @example
 * ```ts
 * import { createTestAgent, MockLLMProvider } from 'fluxion/testing';
 *
 * const { agent, llm, sessionStore } = createTestAgent({
 *   response: 'Paris',
 * });
 *
 * const result = await agent.run('What is the capital of France?');
 * expect(result.text).toBe('Paris');
 * expect(llm.callCount).toBe(1);
 * expect(sessionStore.getCreatedSessionIds()).toHaveLength(1);
 * ```
 *
 * @example With tool registry
 * ```ts
 * const registry = new MockToolRegistry({ lookup: async (args) => 'data' });
 * const { agent } = createTestAgent({ response: 'done', tools: registry.toTools() });
 * await agent.run('Look up data');
 * expect(registry.calls('lookup')).toHaveLength(1);
 * ```
 */

import type { CreateAgentOptions } from '../create-agent/types.js';
import type { Tool } from '../tools/core/types.js';
import { MockLLMProvider, type MockLLMOptions } from './mock-llm.js';
import { MockSessionStore } from './mock-session-store.js';

export interface TestAgentOptions extends MockLLMOptions {
    /** Agent name. Default: 'test-agent' */
    name?: string;
    /** Agent instructions. Default: 'You are a test assistant.' */
    instructions?: string;
    /** Tools to give the agent. Default: [] (no tools) */
    tools?: Tool[];
    /** Extra createAgent options */
    agentOptions?: Partial<CreateAgentOptions>;
}

export interface TestAgentHandle {
    /** The created agent (call .run() to invoke). */
    agent: { run: (prompt: string, opts?: Record<string, unknown>) => Promise<unknown> };
    /** The MockLLM so you can inspect callCount, change responses etc. */
    llm: MockLLMProvider;
    /** The MockSessionStore so you can inspect created/deleted session IDs. */
    sessionStore: MockSessionStore;
}

/**
 * Create a pre-wired test agent: MockLLM + MockSessionStore + no default tools.
 * Returns the agent, LLM mock, and session store for assertion.
 */
export async function createTestAgent(opts: TestAgentOptions = {}): Promise<TestAgentHandle> {
    // Lazy import so the testing module doesn't pull in createAgent at module load time
    const { createAgent } = await import('../create-agent/factory.js');

    const llm = new MockLLMProvider({
        response: opts.response,
        responses: opts.responses,
        shouldError: opts.shouldError,
        toolCalls: opts.toolCalls,
        delay: opts.delay,
    });

    const sessionStore = new MockSessionStore();

    const agent = createAgent({
        name: opts.name ?? 'test-agent',
        instructions: opts.instructions ?? 'You are a test assistant.',
        llm,
        sessionStore,
        tools: opts.tools ?? [],
        guardrails: false,
        ...opts.agentOptions,
    });

    return { agent, llm, sessionStore };
}
