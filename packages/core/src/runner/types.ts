/**
 * @confused-ai/core — internal runner types.
 *
 * Not exported from the package barrel — internal use only.
 */

import type { Message, AgentLifecycleHooks, AgentRunResult } from '../types.js';

// ── Stream hooks (internal) ──────────────────────────────────────────────────

/** Low-level streaming callbacks threaded through the runner. */
export interface RunnerStreamHooks {
    onChunk?: (text: string) => void;
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
    onToolResult?: (name: string, result: unknown) => void;
    onStep?: (step: number) => void;
}

// ── Run config ───────────────────────────────────────────────────────────────

export interface RunnerRunConfig {
    readonly instructions: string;
    readonly prompt: string;
    readonly messages?: Message[];
    readonly maxSteps?: number;
    readonly timeoutMs?: number;
    readonly runId?: string;
    readonly userId?: string;
    readonly ragContext?: string;
    readonly signal?: {
        aborted: boolean;
        addEventListener?: (type: 'abort', handler: () => void) => void;
        removeEventListener?: (type: 'abort', handler: () => void) => void;
    };
}

// ── Retry policy ─────────────────────────────────────────────────────────────

export interface RetryPolicy {
    readonly maxRetries?: number;
    readonly backoffMs?: number;
    readonly maxBackoffMs?: number;
}

// ── LLM provider interface (subset required by runner) ───────────────────────

export interface LLMToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

export interface GenerateOptions {
    tools?: LLMToolDefinition[];
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; name: string };
    maxTokens?: number;
    temperature?: number;
    stop?: string[];
    onChunk?: (chunk: string) => void;
}

/** Flat tool call result returned by LLMProvider.generateText / streamText. */
export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

/** @deprecated renamed to ToolCall */
export type ToolCallResult = ToolCall;

export interface GenerateResult {
    text: string;
    toolCalls?: ToolCall[];
    finishReason?: 'stop' | 'tool_calls' | 'max_tokens' | 'error';
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export interface LLMProvider {
    generateText(messages: Message[], options?: GenerateOptions): Promise<GenerateResult>;
    streamText?: (messages: Message[], options?: GenerateOptions) => Promise<GenerateResult>;
}

// ── ISP sub-interfaces (Interface Segregation Principle) ─────────────────────
//
// Code that only needs text generation can depend on ITextGenerator rather
// than the full LLMProvider union.  All existing LLMProvider implementations
// satisfy these interfaces automatically — no migration required.

/** Minimal interface: synchronous text generation only. */
export interface ITextGenerator {
    generateText(messages: Message[], options?: GenerateOptions): Promise<GenerateResult>;
}

/** Providers that support server-sent streaming (SSE / ReadableStream). */
export interface IStreamingProvider extends ITextGenerator {
    streamText(messages: Message[], options?: GenerateOptions): Promise<GenerateResult>;
}

/** Providers that accept tool definitions and return tool-call results. */
export interface IToolCallProvider extends ITextGenerator {
    /** True when the underlying model supports parallel tool calls. */
    readonly supportsTools: boolean;
}

/**
 * Providers that can produce embeddings.
 * Separated from text generation to avoid burdening chat-only providers.
 */
export interface IEmbeddingProvider {
    embed(text: string, options?: { model?: string }): Promise<number[]>;
    embedBatch(texts: string[], options?: { model?: string }): Promise<number[][]>;
}

/**
 * Full-capability provider (backward-compatible aggregate).
 * LLMProvider implementations are automatically assignable to any sub-interface.
 */
export type IFullLLMProvider = IStreamingProvider & IToolCallProvider;

// ── Tool interface (subset required by runner) ───────────────────────────────

export interface Tool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(input: Record<string, unknown>): Promise<unknown>;
}

export interface ToolRegistry {
    list(): Tool[];
    get(name: string): Tool | undefined;
}

// ── Runner config ─────────────────────────────────────────────────────────────

export interface RunnerConfig {
    readonly name: string;
    readonly instructions: string;
    readonly llm: LLMProvider;
    readonly tools: ToolRegistry;
    readonly maxSteps?: number;
    readonly timeoutMs?: number;
    readonly retry?: RetryPolicy;
    readonly hooks?: AgentLifecycleHooks;
    readonly toolTimeoutMs?: number;
}

// ── Internal run result (aliased to public AgentRunResult) ───────────────────

export type { AgentRunResult };
