/**
 * Agentic loop (ReAct-style) types
 */

import type { Message, LLMToolDefinition } from '../providers/types.js';
import type { LLMProvider } from '../providers/types.js';
import type { ToolRegistry, ToolMiddleware } from '../tools/core/types.js';
import type { EntityId } from '../core/types.js';
import type { ZodType } from 'zod';

/** Observability: optional tracer and metrics for production monitoring */
export interface RunObservability {
    readonly tracer?: import('../observability/types.js').Tracer;
    readonly metrics?: import('../observability/types.js').MetricsCollector;
}

export interface AgenticRunConfig {
    /** System prompt / instructions for the agent */
    readonly instructions: string;
    /** User prompt for this run */
    readonly prompt: string;
    /** Optional conversation history to continue */
    readonly messages?: Message[];
    /** Max reasoning steps (LLM + tool calls per step). Default 10 */
    readonly maxSteps?: number;
    /** Timeout for the entire run (ms). Default 60000 */
    readonly timeoutMs?: number;
    /** Optional run ID for tracing and logs */
    readonly runId?: string;
    /** Optional trace ID for distributed tracing */
    readonly traceId?: string;
    /** Optional user ID — used for per-user budget enforcement */
    readonly userId?: string;
    /** AbortSignal to cancel the run */
    readonly signal?: AbortSignal;
    /** Optional Zod schema to validate and structure the final response */
    readonly responseModel?: ZodType;
    /** Optional RAG engine for knowledge retrieval */
    readonly ragContext?: string;
}

/** AbortSignal-compatible (subset for cancellation) */
export type AbortSignal = { aborted: boolean; addEventListener?: (type: 'abort', handler: () => void) => void; removeEventListener?: (type: 'abort', handler: () => void) => void };

export interface AgenticRunResult {
    /** Final assistant text response */
    readonly text: string;
    /**
     * The agent's response as a markdown artifact.
     * Content is identical to `text`; type is 'markdown', mimeType is 'text/markdown'.
     * Ready to save directly: `await fs.writeFile('response.md', result.markdown.content)`
     */
    readonly markdown: {
        readonly name: string;
        readonly content: string;
        readonly mimeType: 'text/markdown';
        readonly type: 'markdown';
    };
    /** Parsed structured output if responseModel was provided */
    readonly structuredOutput?: unknown;
    /** All messages in the conversation (including tool calls/results) */
    readonly messages: Message[];
    /** Number of steps taken */
    readonly steps: number;
    /** Finish reason */
    readonly finishReason: 'stop' | 'max_steps' | 'timeout' | 'error' | 'human_rejected' | 'aborted';
    /** Optional usage stats */
    readonly usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    /** Run ID when provided in config */
    readonly runId?: string;
    /** Trace ID when provided in config */
    readonly traceId?: string;
}

/** Retry policy for LLM and tool calls in the agentic loop */
export interface AgenticRetryPolicy {
    readonly maxRetries?: number;
    readonly backoffMs?: number;
    readonly maxBackoffMs?: number;
}

/** Stream / progress hooks */
export interface AgenticStreamHooks {
    onChunk?: (text: string) => void;
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
    onToolResult?: (name: string, result: unknown) => void;
    onStep?: (step: number) => void;
}

/**
 * Full lifecycle hooks for the agentic loop.
 *
 * These let you intercept every stage: before/after the entire run,
 * before/after each step, before/after each tool call, and on errors.
 * Return a modified value to override, or the original to pass through.
 *
 * @example
 * ```ts
 * const myAgent = agent({
 *   instructions: '...',
 *   hooks: {
 *     beforeRun: async (prompt, config) => { console.log('Starting:', prompt); return prompt; },
 *     afterRun:  async (result) => { console.log('Done:', result.text); return result; },
 *     beforeStep: async (step, messages) => { console.log('Step', step); return messages; },
 *     beforeToolCall: async (name, args) => { console.log('Tool:', name, args); return args; },
 *     afterToolCall:  async (name, result) => { console.log('Result:', result); return result; },
 *     onError: async (err, step) => { console.error('Error at step', step, err); },
 *   },
 * });
 * ```
 */
export interface AgenticLifecycleHooks {
    /**
     * Called before the entire run starts.
     * Return a modified prompt string to override, or the original to pass through.
     */
    beforeRun?: (prompt: string, config: AgenticRunConfig) => Promise<string> | string;

    /**
     * Called after the entire run completes (success or failure).
     * Return a modified result to override.
     */
    afterRun?: (result: AgenticRunResult) => Promise<AgenticRunResult> | AgenticRunResult;

    /**
     * Called before each reasoning step.
     * Receives current step number and full message history.
     * Return modified messages array to override (e.g. inject context, compress history).
     */
    beforeStep?: (step: number, messages: Message[]) => Promise<Message[]> | Message[];

    /**
     * Called after each reasoning step (after LLM responds, before tool dispatch).
     * Return modified messages to override.
     */
    afterStep?: (step: number, messages: Message[], text: string) => Promise<void> | void;

    /**
     * Called before each tool is executed.
     * Return modified args to override what the tool receives.
     */
    beforeToolCall?: (
        name: string,
        args: Record<string, unknown>,
        step: number,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;

    /**
     * Called after each tool executes.
     * Return a modified result string to override what the LLM sees.
     */
    afterToolCall?: (
        name: string,
        result: unknown,
        args: Record<string, unknown>,
        step: number,
    ) => Promise<unknown> | unknown;

    /**
     * Called when the system prompt is being built.
     * Receives instructions and optional RAG context.
     * Return a custom system prompt to completely override the default.
     */
    buildSystemPrompt?: (
        instructions: string,
        ragContext?: string,
    ) => Promise<string> | string;

    /**
     * Called on any error in the loop.
     */
    onError?: (error: Error, step: number) => Promise<void> | void;
}

/**
 * Wrap a **void-returning** lifecycle hook so it runs as a non-blocking background task.
 *
 * The agentic loop `await`s every hook.  Wrapping with `background()` makes that await
 * resolve instantly — the real async work is scheduled on the microtask queue but never
 * blocks the agent's response time.  Any rejection is caught and logged to `console.error`
 * so it never crashes the loop.
 *
 * Only valid on void-returning hooks: `afterStep`, `onError`.
 * For `afterRun` use it when you want fire-and-forget telemetry (result is passed to the
 * background callback unchanged; the hook's return value is ignored).
 *
 * @example
 * ```ts
 * import { agent, background } from 'fluxion';
 *
 * const ai = agent({
 *   model: 'gpt-4o',
 *   instructions: '...',
 *   hooks: {
 *     // analytics — never delays the response
 *     afterStep: background(async (step, messages) => {
 *       await analytics.track('agent.step', { step, tokens: messages.length });
 *     }),
 *
 *     // telemetry — fire and forget
 *     afterRun: background(async (result) => {
 *       await telemetry.record({ steps: result.steps, tokens: result.usage?.totalTokens });
 *     }),
 *
 *     // error reporting — non-blocking
 *     onError: background(async (err, step) => {
 *       await errorTracker.capture(err, { step });
 *     }),
 *   },
 * });
 * ```
 */
export function background<TArgs extends unknown[]>(
    fn: (...args: TArgs) => Promise<void> | void,
): (...args: TArgs) => void {
    return (...args: TArgs): void => {
        void Promise.resolve(fn(...args)).catch((err: unknown) => {
            console.error('[background hook error]', err);
        });
    };
}

export interface AgenticRunnerConfig {
    readonly llm: LLMProvider;
    readonly tools: ToolRegistry;
    readonly agentId?: EntityId;
    readonly sessionId?: string;
    readonly maxSteps?: number;
    readonly timeoutMs?: number;
    readonly retry?: AgenticRetryPolicy;
    /** Optional RAG engine for knowledge retrieval during runs */
    readonly ragEngine?: import('../knowledge/types.js').RAGEngine;
    /** Optional tool middleware for cross-tool integration (logging, rate limit, etc.) */
    readonly toolMiddleware?: ToolMiddleware[];
    /** Optional observability for production (tracer + metrics) */
    readonly observability?: RunObservability;
    /** Full lifecycle hooks — intercept every stage of the loop */
    readonly hooks?: AgenticLifecycleHooks;
    /**
     * Durable checkpoint store — saves loop state after each step so long-running
     * agents can resume from the last step after a process restart.
     * Only active when `runConfig.runId` is provided.
     */
    readonly checkpointStore?: import('../production/checkpoint.js').AgentCheckpointStore;
    /**
     * Budget enforcer — enforces per-run / per-user / monthly USD caps.
     * Call `addStepCost()` after each LLM step, `recordAndCheck()` after the run.
     */
    readonly budgetEnforcer?: import('../production/budget.js').BudgetEnforcer;
    /** Model ID passed to the budget enforcer for cost estimation. Default: `'gpt-4o'`. */
    readonly budgetModelId?: string;
}

/** Convert a framework Tool to LLM tool definition (name, description, parameters as JSON Schema) */
export function toolToLLMDefinition(
    name: string,
    description: string,
    parametersSchema: Record<string, unknown>
): LLMToolDefinition {
    return { name, description, parameters: parametersSchema };
}
