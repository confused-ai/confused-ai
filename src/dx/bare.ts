/**
 * bare() — Absolute zero-defaults agent.
 *
 * Everything is your responsibility:
 * - No HttpClientTool / BrowserTool injected
 * - No InMemorySessionStore created
 * - No guardrails of any kind
 * - Instructions default to '' (empty)
 * - Name defaults to 'Agent'
 *
 * Use when you want to build an agent entirely from scratch.
 *
 * @example
 * ```ts
 * import { bare } from 'fluxion';
 *
 * const myAgent = bare({
 *   llm: new OpenAIProvider({ model: 'gpt-4o', apiKey: '...' }),
 * });
 * const result = await myAgent.run('Hello');
 * // → pure LLM call, no tools, no session, no guardrails
 *
 * // Bring your own everything:
 * const agent = bare({
 *   instructions: 'You are a code reviewer.',
 *   llm: new AnthropicProvider({ model: 'claude-opus-4-5' }),
 *   tools: [myCustomTool],
 *   hooks: { afterRun: (r) => { audit.log(r); return r; } },
 * });
 * ```
 */

import type { LLMProvider } from '../providers/types.js';
import type { Tool, ToolRegistry } from '../tools/core/types.js';
import type { AgenticLifecycleHooks } from '../agentic/types.js';
import type { CreateAgentResult } from '../create-agent/types.js';
import { createAgenticAgent } from '../agentic/index.js';
import { toToolRegistry, type ToolProvider } from '../tools/core/registry.js';
import type { Message } from '../providers/types.js';

export interface BareAgentOptions {
    /** Agent name. Default: 'Agent' */
    name?: string;
    /** System instructions. Default: '' (no system prompt) */
    instructions?: string;
    /**
     * LLM provider. Required — bare() never auto-resolves from env.
     * Use createAgent() or agent() if you want env-based auto-resolution.
     */
    llm: LLMProvider;
    /**
     * Tools. Default: [] (none).
     * Pass false or omit for pure text reasoning.
     */
    tools?: Tool[] | ToolRegistry | false;
    /** Max agentic loop steps. Default: 10 */
    maxSteps?: number;
    /** Timeout in ms. Default: 60_000 */
    timeoutMs?: number;
    /** Lifecycle hooks */
    hooks?: AgenticLifecycleHooks;
}

/**
 * Create an agent with zero defaults.
 * You control LLM, tools, and every hook. Nothing is injected automatically.
 */
export function bare(options: BareAgentOptions): CreateAgentResult {
    const {
        name = 'Agent',
        instructions = '',
        llm,
        tools: toolsOpt,
        maxSteps = 10,
        timeoutMs = 60_000,
        hooks,
    } = options;

    const tools =
        toolsOpt === false || toolsOpt === undefined
            ? toToolRegistry([])
            : toToolRegistry(toolsOpt as ToolProvider);

    const agenticAgent = createAgenticAgent({
        name,
        instructions,
        llm,
        tools,
        maxSteps,
        timeoutMs,
        hooks,
    });

    // Bare: no session store — stateless stubs
    return {
        name,
        instructions,
        async run(prompt: string, runOptions?: { messages?: Message[]; onChunk?: (t: string) => void; onToolCall?: (n: string, a: Record<string, unknown>) => void; onToolResult?: (n: string, r: unknown) => void; onStep?: (s: number) => void }) {
            return agenticAgent.run(
                {
                    prompt,
                    instructions,
                    messages: runOptions?.messages,
                    maxSteps,
                    timeoutMs,
                },
                {
                    onChunk: runOptions?.onChunk,
                    onToolCall: runOptions?.onToolCall,
                    onToolResult: runOptions?.onToolResult,
                    onStep: runOptions?.onStep,
                }
            );
        },
        async createSession() {
            throw new Error('bare() agents are stateless. Use createAgent() or pass a sessionStore for session support.');
        },
        async getSessionMessages() {
            return [];
        },
    };
}
