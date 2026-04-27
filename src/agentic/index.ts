/**
 * Agentic loop (ReAct-style) exports
 */

export * from './types.js';
export { AgenticRunner } from './runner.js';

import type { LLMProvider } from '../providers/types.js';
import type { ToolRegistry, ToolMiddleware } from '../tools/core/types.js';
import type { AgenticRunConfig, AgenticRunResult, AgenticStreamHooks, AgenticLifecycleHooks } from './types.js';
import type { HumanInTheLoopHooks, GuardrailEngine } from '../guardrails/types.js';
import { AgenticRunner } from './runner.js';
import { toToolRegistry, type ToolProvider } from '../tools/core/registry.js';

/**
 * Create a production-style agentic agent (ReAct loop with LLM + tools).
 * Use with OpenAIProvider or any LLMProvider implementation.
 * Supports Tool[] or ToolRegistry and optional tool middleware for cross-tool integration.
 *
 * @example
 * import { createAgenticAgent, OpenAIProvider } from 'confused-ai';
 * const agent = createAgenticAgent({
 *   name: 'Researcher',
 *   instructions: 'You research topics and cite sources.',
 *   llm: new OpenAIProvider({ model: 'gpt-4o' }),
 *   tools: myToolRegistry,
 *   toolMiddleware: [loggingMiddleware],
 *   maxSteps: 10,
 * });
 * const result = await agent.run({ prompt: 'Latest TypeScript news', instructions: agent.instructions });
 */
export function createAgenticAgent(config: {
    name: string;
    instructions: string;
    llm: LLMProvider;
    tools: ToolRegistry | import('../tools/core/types.js').Tool[];
    maxSteps?: number;
    timeoutMs?: number;
    retry?: import('./types.js').AgenticRetryPolicy;
    humanInTheLoop?: HumanInTheLoopHooks;
    guardrails?: GuardrailEngine;
    toolMiddleware?: ToolMiddleware[];
    /** Full lifecycle hooks — intercept every stage of the loop */
    hooks?: AgenticLifecycleHooks;
    /** Durable checkpoint store for resumable long-running agents */
    checkpointStore?: import('../production/checkpoint.js').AgentCheckpointStore;
    /** Budget enforcer for per-run / per-user / monthly spend caps */
    budgetEnforcer?: import('../production/budget.js').BudgetEnforcer;
    /** Model ID for budget cost estimation */
    budgetModelId?: string;
}): {
    name: string;
    instructions: string;
    run(
        runConfig: { prompt: string; instructions?: string; messages?: import('../providers/types.js').Message[]; maxSteps?: number; timeoutMs?: number; runId?: string; userId?: string; ragContext?: string },
        hooks?: AgenticStreamHooks
    ): Promise<AgenticRunResult>;
} {
    const toolRegistry = toToolRegistry(config.tools as ToolProvider);

    const runner = new AgenticRunner({
        llm: config.llm,
        tools: toolRegistry,
        maxSteps: config.maxSteps ?? 10,
        timeoutMs: config.timeoutMs ?? 60_000,
        retry: config.retry,
        toolMiddleware: config.toolMiddleware,
        hooks: config.hooks,
        checkpointStore: config.checkpointStore,
        budgetEnforcer: config.budgetEnforcer,
        budgetModelId: config.budgetModelId,
    });

    // Set human-in-the-loop hooks if provided
    if (config.humanInTheLoop) {
        runner.setHumanInTheLoop(config.humanInTheLoop);
    }

    // Set guardrails if provided
    if (config.guardrails) {
        runner.setGuardrails(config.guardrails);
    }

    return {
        name: config.name,
        instructions: config.instructions,
        async run(runConfig, hooks) {
            const instructions = runConfig.instructions ?? config.instructions;
            const cfg: AgenticRunConfig = {
                instructions,
                prompt: runConfig.prompt,
                messages: runConfig.messages,
                maxSteps: runConfig.maxSteps,
                timeoutMs: runConfig.timeoutMs,
                ragContext: runConfig.ragContext,
                ...(runConfig.runId && { runId: runConfig.runId }),
                ...(runConfig.userId && { userId: runConfig.userId }),
            };
            return runner.run(cfg, hooks);
        },
    };
}
