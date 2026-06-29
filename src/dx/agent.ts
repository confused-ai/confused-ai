/**
 * Minimal agent() — best DX: one import, one call.
 *
 * agent('You are helpful.')
 * agent({ instructions: '...', model: 'openai:gpt-4o' })
 */

import type { CreateAgentResult } from '../create-agent.js';
import type { CreateAgentOptions } from '../create-agent.js';
import { createAgent } from '../create-agent.js';

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
 *   // No tools by default — pure text reasoning. Pass tools:'web' for
 *   // [HttpClientTool, BrowserTool], or tools:[...] for your own.
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
        ...opts,
        name: isString ? 'Agent' : (opts.name ?? 'Agent'),
        instructions: isString ? instructionsOrOptions : (opts.instructions ?? ''),
    };

    if (!options.instructions?.trim()) {
        throw new Error('agent() requires instructions. Use agent("...") or agent({ instructions: "..." }).');
    }

    return createAgent(options);
}
