/**
 * Minimal agent() — best DX: one import, one call.
 *
 * agent('You are helpful.')
 * agent({ instructions: '...', model: 'openai:gpt-4o' })
 */

import type { CreateAgentResult } from '../create-agent.js';
import type { CreateAgentOptions } from '../create-agent.js';
import { createAgent } from '../create-agent.js';
import { createDevLogger } from './dev-logger.js';
import { createDevToolMiddleware } from './dev-logger.js';

/** Minimal options when using agent({ ... }) */
export type AgentMinimalOptions = Partial<
    Omit<CreateAgentOptions, 'name' | 'instructions'> & {
        /** System instructions (required unless using agent(instructions) form) */
        instructions: string;
        /** Agent name (default: 'Agent') */
        name?: string;
        /** Enable dev mode: console + tool logging */
        dev?: boolean;
    }
>;

/**
 * Create an agent with the best DX: minimal surface, smart defaults.
 *
 * One-argument form (instructions only):
 *   const runnable = agent('You are a helpful assistant.');
 *   // Uses HttpClientTool + BrowserTool by default. Pass tools:[] to disable.
 *
 * Options form (full control):
 *   const runnable = agent({
 *     instructions: 'You are helpful.',
 *     model: 'openai:gpt-4o',
 *     tools: [],               // no tools — pure text reasoning
 *     guardrails: false,       // opt out of guardrails
 *     sessionStore: false,     // stateless
 *     hooks: { beforeRun: async (p) => `Today is Monday\n\n${p}` },
 *     dev: true,
 *   });
 *
 * Returns the same runnable as createAgent() (run, createSession, getSessionMessages).
 */
export function agent(instructionsOrOptions: string | AgentMinimalOptions): CreateAgentResult {
    const isString = typeof instructionsOrOptions === 'string';
    const opts = isString ? {} as AgentMinimalOptions : instructionsOrOptions;

    const options: CreateAgentOptions = {
        name: isString ? 'Agent' : (opts.name ?? 'Agent'),
        instructions: isString ? instructionsOrOptions : (opts.instructions ?? ''),
        model: opts.model,
        apiKey: opts.apiKey,
        baseURL: opts.baseURL,
        openRouter: opts.openRouter,
        llm: opts.llm,
        // Only inject default tools when user hasn't explicitly set anything.
        // tools: false → no tools; tools: [] → no tools; tools: [...] → use those.
        tools: (opts as AgentMinimalOptions).tools,
        toolMiddleware: opts.toolMiddleware,
        sessionStore: opts.sessionStore,
        guardrails: opts.guardrails,
        maxSteps: opts.maxSteps,
        timeoutMs: opts.timeoutMs,
        retry: opts.retry,
        logger: opts.logger,
        learningMode: opts.learningMode,
        userProfileStore: opts.userProfileStore,
        memoryStore: opts.memoryStore,
        knowledgebase: opts.knowledgebase,
        inputSchema: opts.inputSchema,
        outputSchema: opts.outputSchema,
        hooks: opts.hooks,
    };

    if (!options.instructions?.trim()) {
        throw new Error('agent() requires instructions. Use agent("...") or agent({ instructions: "..." }).');
    }

    if (opts.dev) {
        options.logger = options.logger ?? createDevLogger();
        options.toolMiddleware = [
            ...(options.toolMiddleware ?? []),
            createDevToolMiddleware(),
        ];
    }

    return createAgent(options);
}
