/**
 * @confused-ai/agentic — ReAct-style agentic loop with tool dispatch, guardrails, and HITL
 */

export * from './types.js';
export { AgenticRunner } from './runner.js';
export type { Tool, ToolResult, ToolRegistry, ToolMiddleware, ToolContext, ToolPermissions, ToolProvider } from './_tool-types.js';
export { ToolCategory, toToolRegistry } from './_tool-types.js';
export type { GuardrailEngine, HumanInTheLoopHooks, GuardrailContext, GuardrailViolation, GuardrailResult } from './_guardrail-types.js';
export { createStructuredAgent, StructuredOutputError } from './structured-agent.js';
export type { StructuredAgentResult, StructuredAgentConfig } from './structured-agent.js';

import type { LLMProvider } from '@confused-ai/core';
import type { Message } from '@confused-ai/core';
import type { ToolMiddleware, ToolProvider } from './_tool-types.js';
import { toToolRegistry } from './_tool-types.js';
import type { AgenticRunConfig, AgenticRunResult, AgenticStreamHooks, AgenticLifecycleHooks, AgenticRetryPolicy } from './types.js';
import type { HumanInTheLoopHooks, GuardrailEngine } from './_guardrail-types.js';
import { AgenticRunner } from './runner.js';

/**
 * Create a production-style agentic agent (ReAct loop with LLM + tools).
 */
export function createAgenticAgent(config: {
    name: string;
    instructions: string;
    llm: LLMProvider;
    tools: ToolProvider;
    maxSteps?: number;
    timeoutMs?: number;
    retry?: AgenticRetryPolicy;
    humanInTheLoop?: HumanInTheLoopHooks;
    guardrails?: GuardrailEngine;
    toolMiddleware?: ToolMiddleware[];
    hooks?: AgenticLifecycleHooks;
    checkpointStore?: import('@confused-ai/production').AgentCheckpointStore;
    budgetEnforcer?: import('@confused-ai/production').BudgetEnforcer;
    budgetModelId?: string;
    knowledgebase?: import('@confused-ai/knowledge').RAGEngine;
}): {
    name: string;
    instructions: string;
    run(
        runConfig: {
            prompt: string;
            instructions?: string;
            messages?: Message[];
            maxSteps?: number;
            timeoutMs?: number;
            runId?: string;
            userId?: string;
            ragContext?: string;
        },
        hooks?: AgenticStreamHooks,
    ): Promise<AgenticRunResult>;
} {
    const toolRegistry = toToolRegistry(config.tools);

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

    if (config.humanInTheLoop) runner.setHumanInTheLoop(config.humanInTheLoop);
    if (config.guardrails) runner.setGuardrails(config.guardrails);

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
