/**
 * LLM provider type definitions — canonical source moved to @confused-ai/core.
 *
 * This file is now a compatibility re-export barrel.
 * Import from '@confused-ai/core' directly in new code.
 *
 * NOTE: LLMProvider and StreamOptions are kept local for backward compatibility —
 * the src/ legacy providers use StreamDelta-based onChunk. Once Wave 2 (provider
 * migration to @confused-ai/models) is complete, these will be removed.
 */

// Re-export all canonical LLM types from the package
export type {
    MessageRole,
    ContentPart,
    Message,
    MessageWithToolId,
    AssistantMessage,
    ToolResultMessage,
    ToolCall,
    ToolCallResult,
    LLMToolDefinition,
    GenerateOptions,
    TextStreamChunk,
    StreamToolCallChunk,
    StreamDelta,
    // ISP sub-interfaces
    ITextGenerator,
    IStreamingProvider,
    IToolCallProvider,
    IEmbeddingProvider,
    IFullLLMProvider,
} from '@confused-ai/core';

// Backward compat alias: StreamChunk was the text-delta type (now TextStreamChunk)
export type { TextStreamChunk as StreamChunk } from '@confused-ai/core';

// ── Legacy-compatible types kept local until Wave 2 completes ─────────────────

import type { GenerateOptions, Message, LLMToolDefinition, StreamDelta, ToolCall } from '@confused-ai/core';

/** Streaming options — legacy variant where onChunk receives typed StreamDelta objects. */
export interface StreamOptions {
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly tools?: LLMToolDefinition[];
    readonly toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
    readonly stop?: string[];
    readonly onChunk?: (delta: StreamDelta) => void;
}

/**
 * Legacy GenerateResult — allows any string for finishReason for backward compat
 * with src/ providers. Packages use the stricter literal union from @confused-ai/core.
 */
export interface GenerateResult {
    readonly text: string;
    readonly toolCalls?: ToolCall[];
    readonly finishReason?: string;
    readonly usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

/**
 * LLM provider interface (legacy src/ variant).
 * streamText uses StreamOptions (StreamDelta-based onChunk) for backward compat.
 * The packages/core LLMProvider uses string-based onChunk in GenerateOptions.
 */
export interface LLMProvider {
    generateText(messages: Message[], options?: GenerateOptions): Promise<GenerateResult>;
    streamText?(messages: Message[], options?: StreamOptions): Promise<GenerateResult>;
}

