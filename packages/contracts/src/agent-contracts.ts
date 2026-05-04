/**
 * Agent execution contracts — re-exported from @confused-ai/core.
 *
 * Single source of truth lives in packages/core/src/types.ts.
 * This file makes them available via @confused-ai/contracts for packages
 * that depend on contracts but not the full core.
 */
export type {
    EntityId,
    AgentInput,
    AgentOutput,
    AgentContext,
    AgentIdentity,
    AgentHooks,
    AgentConfig,
    ExecutionMetadata,
    Agent,
    AgentRunOptions,
    AgentRunResult,
} from '@confused-ai/core';
export { generateEntityId, AgentState } from '@confused-ai/core';

// ── Plugin contracts ─────────────────────────────────────────────────────────

import type { AgentInput, AgentOutput } from '@confused-ai/core';

/** Logger interface available to plugins. */
export interface Logger {
    debug(msg: string, meta?: Record<string, unknown>): void;
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
}

/** Tool middleware signature (function-based — wraps a single call). */
export type ToolMiddleware = (
    name: string,
    args: Record<string, unknown>,
    next: (name: string, args: Record<string, unknown>) => Promise<unknown>,
) => Promise<unknown>;

/** Tool reference passed to object-based middleware hooks. */
export interface ToolRef {
    readonly name: string;
    readonly description: string;
}

/** Tool execution result passed to object-based middleware hooks. */
export interface ToolExecutionResult {
    readonly success: boolean;
    readonly executionTimeMs: number;
    readonly output?: unknown;
    readonly error?: string;
}

/**
 * Object-based tool middleware — lifecycle hooks for tool execution.
 * Easier to use than the function-based ToolMiddleware for logging / metrics.
 */
export interface ToolMiddlewareObject {
    beforeExecute?(tool: ToolRef, params: Record<string, unknown>): void | Promise<void>;
    afterExecute?(tool: ToolRef, result: ToolExecutionResult, ctx: { agentId?: string }): void | Promise<void>;
    onError?(tool: ToolRef, error: Error, ctx: { agentId?: string }): void | Promise<void>;
}

/** Context available to plugins during execution. */
export interface PluginContext {
    readonly agentId?: string;
    readonly sessionId?: string;
    readonly logger: Logger;
    readonly metadata: Record<string, unknown>;
}

/**
 * Plugin interface for cross-cutting concerns.
 *
 * Plugins hook into the agent lifecycle, tool execution, and observability.
 * Register once via PluginRegistry; they apply to all agents.
 */
export interface Plugin {
    readonly id: string;
    readonly name: string;
    readonly version?: string;

    /** Called once when the plugin is registered. */
    onRegister?(context: PluginContext): Promise<void> | void;
    /** Called before each agent run — may transform input. */
    beforeRun?(input: AgentInput, context: PluginContext): Promise<AgentInput> | AgentInput;
    /** Called after each agent run — may transform output. */
    afterRun?(output: AgentOutput, context: PluginContext): Promise<AgentOutput> | AgentOutput;
    /** Optional tool middleware injected by this plugin. Can be function or object form. */
    toolMiddleware?: ToolMiddleware | ToolMiddlewareObject;
    /** Called on agent errors. */
    onError?(error: Error, context: PluginContext): Promise<void> | void;
}

/** Generic metrics collector interface for telemetry plugins. */
export interface MetricsCollector {
    counter(name: string, value: number, labels?: Record<string, string>): void;
    histogram(name: string, value: number, labels?: Record<string, string>): void;
    gauge?(name: string, value: number, labels?: Record<string, string>): void;
}
