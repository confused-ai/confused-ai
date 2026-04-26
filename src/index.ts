/**
 * Agent Framework - A production-grade TypeScript agent framework
 *
 * @packageDocumentation
 */

import { recordFrameworkStartup, isTelemetryEnabled } from './shared/telemetry.js';
import { VERSION } from './shared/version.js';

export { isTelemetryEnabled, recordFrameworkStartup, VERSION };

// Core exports
export * from './core/index.js';

// Memory exports
// Memory: conversation history, vector memory, session stores
// Note: OpenAIEmbeddingProvider is exported from `confused-ai/llm` in this barrel.
// Import it from 'confused-ai/memory' directly if you want the memory-specific version.
export { InMemoryStore } from './memory/in-memory-store.js';
export { VectorMemoryStore } from './memory/vector-store.js';
export type { VectorMemoryStoreConfig } from './memory/vector-store.js';
export { InMemoryVectorStore } from './memory/in-memory-vector-store.js';
export * from './memory/types.js';
// Tools exports
export * from './tools/index.js';

// Planner exports
export * from './planner/index.js';

// Execution exports
export * from './execution/index.js';

// Orchestration exports
export * from './orchestration/index.js';

// Observability exports
export * from './observability/index.js';

// LLM provider abstraction (optional peer: openai for OpenAIProvider)
export * from './providers/index.js';

// Agentic loop (ReAct-style)
export * from './agentic/index.js';

// SDK exports (`defineAgent` is re-exported as `defineTypedAgent` after DX, because DX’s `defineAgent` is the public default)
export * from './sdk/index.js';
export { defineAgent as defineTypedAgent, type DefinedAgent } from './sdk/defined-agent.js';

// Session exports
export * from './session/index.js';

// Guardrails exports
export * from './guardrails/index.js';

// Learning: user profiles, memories across sessions, learning modes (always / agentic)
export * from './learning/index.js';

// Knowledge: RAG, hybrid search, reranking, persistent session/state
// Knowledge: RAG engine, document loaders (OpenAIEmbeddingProvider and InMemoryVectorStore
// are already exported from the memory module above)
export { KnowledgeEngine } from './knowledge/engine.js';
export type { KnowledgeEngineConfig, DocumentInput, TextSplitterOptions } from './knowledge/engine.js';
export { TextLoader, JSONLoader, CSVLoader, URLLoader } from './knowledge/loaders.js';
export type { DocumentLoader } from './knowledge/loaders.js';
export * from './knowledge/types.js';

// Configuration management (environment variables, validation)
export * from './config/index.js';

// Production: runtime, control plane, evals (accuracy, performance, latency)
export * from './production/index.js';

// Structured errors for production (ErrorCode, AgentError, LLMError, ToolExecutionError, etc.)
export * from './shared/errors.js';

// Testing utilities (mock providers, fixtures)
export * from './testing/index.js';

// Extensions: plug any DB, tools, cross-tool middleware; wrap agents for Orchestrator/Pipeline
export * from './extensions/index.js';

// Production agent factory (LLM, tools, session, guardrails) + LLM resolution helpers
export {
    createAgent,
    resolveLlmForCreateAgent,
    OPENROUTER_BASE_URL,
    ENV_API_KEY,
    ENV_MODEL,
    ENV_BASE_URL,
    ENV_OPENROUTER_API_KEY,
    ENV_OPENROUTER_MODEL,
    type CreateAgentOptions,
    type CreateAgentResult,
    type AgentRunOptions,
} from './create-agent.js';

/** Class-based agent: session-aware runs with a consistent lifecycle. */
export { Agent, type AgentOptions } from './agent.js';

// Best DX: minimal agent(), fluent defineAgent(), dev logging
export {
    agent,
    bare,
    defineAgent,
    compose,
    pipe,
    definePersona,
    buildPersonaInstructions,
    createDevLogger,
    createDevToolMiddleware,
} from './dx/index.js';
export type { AgentMinimalOptions, DefineAgentOptions, AgentPersona, BareAgentOptions, ComposeOptions, ComposedAgent } from './dx/index.js';

// Background Queue system (non-blocking hooks dispatched to BullMQ / Kafka / RabbitMQ / SQS / Redis Pub/Sub)
export { queueHook, InMemoryBackgroundQueue } from './background/index.js';
export type { BackgroundQueue, BackgroundTask, BackgroundTaskHandler, EnqueueOptions, WorkerOptions, QueuedHook } from './background/index.js';

// Video generation utilities
export * from './video/index.js';

// Contracts — available as `confused-ai/contracts` subpath.
// Not re-exported here to avoid name collisions with existing module exports.
// import { AgentState, LLMProvider, ... } from 'confused-ai/contracts';

// Adapters — available as `confused-ai/adapters` subpath.
// Not re-exported from main barrel to avoid name collisions (TraceSpan, etc.).
// import { createAdapterRegistry, InMemoryCacheAdapter, ... } from 'confused-ai/adapters';

// Plugin system — cross-cutting concerns (logging, rate-limiting, telemetry)
export * from './plugins/index.js';

// HTTP service runtime (stateless + session-scoped API)
export * from './runtime/index.js';

// Storage: key-value + blob with pluggable adapters (memory, file, custom S3/Redis/etc.)
export * from './storage/index.js';

// Reasoning: Chain-of-Thought step manager, ReasoningEvent streaming
export * from './reasoning/index.js';

// Compression: LLM-based tool result / message compression
export * from './compression/index.js';

// Context: ContextProvider / ContextBackend abstraction layer
export * from './context/index.js';

// Scheduler: cron-based job scheduling with in-process handler registry
export * from './scheduler/index.js';

recordFrameworkStartup({ version: VERSION, runtime: 'node' });