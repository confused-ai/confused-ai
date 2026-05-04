import type { z } from 'zod';
import type { MemoryStore } from '@confused-ai/memory';
import type { Tool } from '@confused-ai/tools';
import type { Planner } from '@confused-ai/planner';

/**
 * High-level agent definition: typed I/O, optional handler, pluggable memory/planner.
 */
export interface AgentDefinitionConfig<TInput, TOutput> {
    name: string;
    description?: string;
    inputSchema: z.ZodType<TInput>;
    outputSchema: z.ZodType<TOutput>;
    /**
     * Production handler. If omitted, `run()` validates and returns the input as the output (schema permitting).
     */
    handler?: (input: TInput, context?: Record<string, unknown>) => Promise<TOutput> | TOutput;
    tools?: Tool[];
    memory?: MemoryStore;
    planner?: Planner;
    maxIterations?: number;
    timeoutMs?: number;
}

/**
 * One invocation of a {@link import('./defined-agent.js').DefinedAgent}.
 */
export interface AgentRunConfig<TInput> {
    input: TInput;
    context?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface WorkflowResult {
    results: Record<string, unknown>;
}
