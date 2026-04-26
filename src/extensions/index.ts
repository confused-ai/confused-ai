/**
 * Extension points for production-grade, multi-agent frameworks.
 *
 * Plug any DB (session/memory), any tools (or ToolRegistry), cross-tool middleware,
 * and use high-level agents (createAgent / Agent) with Orchestrator, Supervisor, Pipeline.
 */

import type { SessionStore } from '../session/types.js';
import type { MemoryStore } from '../memory/types.js';
import type { Tool, ToolRegistry, ToolMiddleware } from '../tools/core/types.js';
import type { LLMProvider } from '../providers/types.js';
import type { GuardrailEngine } from '../guardrails/types.js';
import { Agent, AgentState } from '../core/types.js';
import type { AgentInput, AgentOutput, AgentContext } from '../core/types.js';
import type { AgentRunOptions } from '../create-agent.js';
import type { AgenticRunResult } from '../agentic/types.js';

// Re-export extension types and tool provider for convenience
export type { SessionStore, MemoryStore, Tool, ToolRegistry, ToolMiddleware, LLMProvider, GuardrailEngine };
export { toToolRegistry, type ToolProvider } from '../tools/core/registry.js';

/**
 * Create a tool middleware that logs tool calls and results (easy cross-tool integration).
 * Pass to createAgent({ toolMiddleware: [createLoggingToolMiddleware(logger)] }) or Agent({ toolMiddleware: [...] }).
 */
export function createLoggingToolMiddleware(
    log: (msg: string, meta?: Record<string, unknown>) => void = (msg, meta) => console.log(`[tool] ${msg}`, meta ?? {})
): ToolMiddleware {
    return {
        beforeExecute(tool, params) {
            log('tool.before', { tool: tool.name, params });
        },
        afterExecute(tool, result, ctx) {
            log('tool.after', {
                tool: tool.name,
                success: result.success,
                executionTimeMs: result.executionTimeMs,
                agentId: ctx.agentId,
                sessionId: ctx.sessionId,
            });
        },
        onError(tool, error, ctx) {
            log('tool.error', {
                tool: tool.name,
                error: error.message,
                agentId: ctx.agentId,
                sessionId: ctx.sessionId,
            });
        },
    };
}

/**
 * Session store provider: plug any DB (SQLite, Postgres, Redis, etc.).
 * Implement SessionStore and pass to createAgent({ sessionStore }) or Agent({ db }).
 */
export type SessionStoreProvider = SessionStore;

/**
 * Memory store provider: plug any vector/RAG store for long-term knowledge.
 * Implement MemoryStore and pass via agent options when supported.
 */
export type MemoryStoreProvider = MemoryStore;

/**
 * Minimal interface for high-level agents (createAgent return value or Agent class).
 * Use with wrapAgentForOrchestration so both work in Orchestrator, Supervisor, Pipeline.
 */
export interface RunnableHighLevelAgent {
    readonly name: string;
    readonly instructions: string;
    run(prompt: string, options?: AgentRunOptions): Promise<AgenticRunResult>;
}

/**
 * Wrap a high-level agent (createAgent / Agent) so it can be used with
 * Orchestrator, Supervisor, and Pipeline (core.Agent with run(AgentInput, AgentContext) => AgentOutput).
 *
 * @example
 * const highLevelAgent = createAgent({ name: 'Researcher', instructions: '...' });
 * const coreAgent = wrapAgentForOrchestration(highLevelAgent);
 * const pipeline = createPipeline({ name: 'Research', agents: [coreAgent, writerAgent] });
 *
 * @example
 * const agent = new Agent({ instructions: '...' });
 * const coreAgent = wrapAgentForOrchestration(agent);
 */
export function wrapAgentForOrchestration(agent: RunnableHighLevelAgent): Agent {
    return new OrchestrationAgentAdapter(agent);
}

class OrchestrationAgentAdapter extends Agent {
    constructor(private readonly delegate: RunnableHighLevelAgent) {
        super({
            name: delegate.name,
            description: delegate.instructions,
        });
    }

    async run(input: AgentInput, _ctx: AgentContext): Promise<AgentOutput> {
        const ctx = input.context ?? {};
        const result = await this.delegate.run(input.prompt, {
            sessionId: ctx.sessionId as string | undefined,
            userId: ctx.userId as string | undefined,
        });
        const state =
            result.finishReason === 'stop'
                ? AgentState.COMPLETED
                : result.finishReason === 'error' || result.finishReason === 'timeout'
                  ? AgentState.FAILED
                  : AgentState.COMPLETED;
        return {
            result: result.text,
            state,
            metadata: {
                startTime: new Date(),
                durationMs: 0,
                iterations: result.steps,
                tokensUsed: result.usage?.totalTokens,
            },
        };
    }
}
