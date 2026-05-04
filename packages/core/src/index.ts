/**
 * @confused-ai/core — package barrel.
 *
 * Public API surface — nothing else is exported.
 * Internal helpers (queue, loop, retry fallback) stay private (ISP).
 *
 * Import paths:
 *   import { createAgent }    from '@confused-ai/core';
 *   import { AgentRunner }    from '@confused-ai/core/runner';
 *   import type { Agent }     from '@confused-ai/core/types';
 *   import { ConfigError }    from '@confused-ai/core/errors';
 */

// ── Primary API ───────────────────────────────────────────────────────────────
export { createAgent }         from './agent.js';
export type { CreateAgentOptions, SessionStore } from './agent.js';

// ── Registry ──────────────────────────────────────────────────────────────────
export { MapToolRegistry, createToolRegistry } from './tool-registry.js';

// ── Public types ──────────────────────────────────────────────────────────────
export { generateEntityId } from './types.js';
// AgentState is an enum — must be a value export (not type-only)
export { AgentState } from './types.js';
export type {
    EntityId,
    Agent,
    AgentRunOptions,
    AgentRunResult,
    AgentLifecycleHooks,
    StreamChunk,
    Message,
    MultiModalInput,
    MessageContent,
    OpenAIToolCall,
    // Agent execution contracts (used by orchestration, plugins, contracts packages)
    AgentInput,
    AgentOutput,
    AgentContext,
    AgentIdentity,
    AgentHooks,
    AgentConfig,
    ExecutionMetadata,
} from './types.js';

// ── Canonical LLM provider types (single source of truth for providers) ──────
export type {
    ToolCall,
    ToolCallResult,
    MessageRole,
    ContentPart,
    MessageWithToolId,
    AssistantMessage,
    ToolResultMessage,
    LLMToolDefinition,
    TextStreamChunk,
    StreamToolCallChunk,
    StreamDelta,
    StreamOptions,
    GenerateOptions,
    GenerateResult,
    LLMProvider,
} from './llm-types.js';

// ── Errors ────────────────────────────────────────────────────────────────────
export { ConfusedAIError, ConfigError, LLMError, BudgetExceededError } from './errors.js';

// ── Runner (advanced usage) ───────────────────────────────────────────────────
export { AgentRunner } from './runner/agent-runner.js';
export type {
    RunnerConfig,
    RetryPolicy,
    Tool,
    ToolRegistry,
} from './runner/types.js';
// ISP sub-interfaces for fine-grained provider typing
export type {
    ITextGenerator,
    IStreamingProvider,
    IToolCallProvider,
    IEmbeddingProvider,
    IFullLLMProvider,
} from './runner/types.js';
