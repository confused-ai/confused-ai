# API Reference

Full API reference for all confused-ai modules.

## Run result (`AgenticRunResult`)

Every `agent.run()` call returns this object:

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Final assistant text response |
| `markdown` | `{ name, content, mimeType, type }` | Response as a ready-to-save markdown artifact |
| `structuredOutput` | `unknown?` | Parsed output when `responseModel` was provided |
| `messages` | `Message[]` | Full conversation including tool calls / results |
| `steps` | `number` | Number of LLM steps taken |
| `finishReason` | `string` | `'stop'` \| `'max_steps'` \| `'timeout'` \| `'error'` |
| `usage` | `{ promptTokens?, completionTokens?, totalTokens? }?` | Token counts |
| `runId` | `string?` | Run ID when provided in config |
| `traceId` | `string?` | Trace ID for distributed tracing |

### Using `result.markdown`

```ts
import { agent } from 'confused-ai';
import { writeFile } from 'node:fs/promises';

const ai = agent({ instructions: 'You write technical docs.' });
const result = await ai.run('Explain async/await in TypeScript');

// Use text directly
console.log(result.text);

// Save as a .md file
await writeFile('response.md', result.markdown.content);

// The artifact shape
console.log(result.markdown.name);      // e.g. "response-1234567890.md"
console.log(result.markdown.mimeType);  // "text/markdown"
console.log(result.markdown.type);      // "markdown"
```

## Core

| Export | Type | Description |
|--------|------|-------------|
| `agent(config)` | Function | Create an agent — recommended default |
| `defineAgent(config)` | Function | Chainable agent builder with `.use()`, `.hooks()`, `.noDefaults()` |
| `createAgent(config)` | Function | Factory-style agent creation |
| `bare(config)` | Function | Zero-defaults raw agent |
| `compose(...hookSets)` | Function | Merge multiple hook sets |
| `pipe(...hookSets)` | Function | Chain hook transformations sequentially |
| `Agent` | Class | Base agent class for extension |

## Tools

| Export | Type | Description |
|--------|------|-------------|
| `defineTool()` | Function → ToolBuilder | Fluent tool builder |
| `tool(config)` | Function | Config-object tool definition |
| `createTool(config)` | Alias | Same as `tool()`, Mastra-compatible |
| `createTools(defs)` | Function | Batch tool factory |
| `ToolBuilder` | Class | Fluent builder class (from `defineTool()`) |
| `LightweightTool` | Interface | Return type of all tool factories |

## Knowledge

| Export | From | Description |
|--------|------|-------------|
| `KnowledgeEngine` | `confused-ai/knowledge` | RAG engine |
| `TextLoader` | `confused-ai/knowledge` | Load .txt / .md files |
| `JSONLoader` | `confused-ai/knowledge` | Load .json files |
| `CSVLoader` | `confused-ai/knowledge` | Load .csv files |
| `URLLoader` | `confused-ai/knowledge` | Load web pages |
| `OpenAIEmbeddingProvider` | `confused-ai/memory` | Text embeddings via OpenAI |
| `InMemoryVectorStore` | `confused-ai/memory` | In-process vector store |
| `DocumentLoader` | `confused-ai/knowledge` | Loader interface |
| `KnowledgeEngineConfig` | `confused-ai/knowledge` | Engine config type |

## Memory

| Export | From | Description |
|--------|------|-------------|
| `InMemoryStore` | `confused-ai/memory` | In-memory conversation history |
| `VectorMemoryStore` | `confused-ai/memory` | Semantic long-term memory |
| `OpenAIEmbeddingProvider` | `confused-ai/memory` | Text embeddings |
| `InMemoryVectorStore` | `confused-ai/memory` | In-process vector store |

## Storage

| Export | From | Description |
|--------|------|-------------|
| `createStorage(options?)` | `confused-ai/storage` | Create a storage instance |
| `MemoryStorageAdapter` | `confused-ai/storage` | In-memory adapter |
| `FileStorageAdapter` | `confused-ai/storage` | File-system adapter |
| `Storage` | `confused-ai/storage` | High-level storage interface |
| `StorageAdapter` | `confused-ai/storage` | Low-level adapter interface |
| `StorageOptions` | `confused-ai/storage` | `createStorage()` options type |

## Session

| Export | From | Description |
|--------|------|-------------|
| `InMemorySessionStore` | `confused-ai/session` | In-memory sessions |
| `SqlSessionStore` | `confused-ai/session` | SQL-backed sessions |
| `createSqliteSessionStore` | `confused-ai/session` | SQLite session factory |
| `SessionDbDriver` | `confused-ai/session` | DB driver interface |

## Orchestration

| Export | From | Description |
|--------|------|-------------|
| `AgentRouter` | `confused-ai/orchestration` | Route to matching agent |
| `createHandoff` | `confused-ai/orchestration` | Create handoff protocol |
| `ConsensusProtocol` | `confused-ai/orchestration` | Multi-agent voting |
| `Supervisor` | `confused-ai/orchestration` | Supervisor + workers |
| `Swarm` | `confused-ai/orchestration` | Peer-to-peer agent swarm |
| `Pipeline` | `confused-ai/orchestration` | Sequential agent pipeline |
| `MessageBus` | `confused-ai/orchestration` | Pub/sub message bus |
| `LoadBalancer` | `confused-ai/orchestration` | Distribute across agent pool |
| `McpClient` | `confused-ai/orchestration` | MCP server client |
| `HttpA2AClient` | `confused-ai/orchestration` | Outbound A2A message client (POST to broker) |
| `createHttpA2AClient` | `confused-ai/orchestration` | Factory for `HttpA2AClient` |
| `A2AClient` | `confused-ai/orchestration` | A2A client interface |
| `A2AMessage` | `confused-ai/orchestration` | A2A message shape |
| `team` | `confused-ai` | Parallel agent team |

## Production

| Export | From | Description |
|--------|------|-------------|
| `ResilientAgent` | `confused-ai/production` | Retries + circuit breaker |
| `HealthMonitor` | `confused-ai/production` | Agent health checks |
| `createFallbackChain` | `confused-ai/llm` | LLM failover chain |
| `CostTracker` | `confused-ai/llm` | Track LLM spending |
| `ContextWindowManager` | `confused-ai/llm` | Token limit management |
| `LLMRouter` | `confused-ai/llm` | Intelligent model router (task-aware, strategy-based) |
| `createSmartRouter` | `confused-ai/llm` | **Adaptive** multi-criteria routing (recommended) |
| `scoreTaskTypesForRouting` | `confused-ai/llm` | Inspect / reuse built-in task scores |
| `createBalancedRouter` | `confused-ai/llm` | Balanced routing factory |
| `createCostOptimizedRouter` | `confused-ai/llm` | Cost-first routing factory |
| `createQualityFirstRouter` | `confused-ai/llm` | Quality-first routing factory |
| `createSpeedOptimizedRouter` | `confused-ai/llm` | Speed-first routing factory |

## Observability

| Export | From | Description |
|--------|------|-------------|
| `ConsoleLogger` | `confused-ai/observability` | Structured console logging |
| `OtlpExporter` | `confused-ai/observability` | OTLP trace exporter |
| `Metrics` | `confused-ai/observability` | Metrics collection |
| `evaluate` | `confused-ai/observability` | Agent evaluation runner |

## Guardrails

| Export | From | Description |
|--------|------|-------------|
| `createGuardrails` | `confused-ai/guardrails` | Create guardrail config |
| `GuardrailValidator` | `confused-ai/guardrails` | Custom validator interface |

## Adapters

All adapter interfaces and built-in implementations. Import from `confused-ai/adapters`.

| Export | Description |
|--------|-------------|
| `createAdapterRegistry()` | Create a central adapter registry |
| `createProductionSetup(opts?)` | Opinionated full-stack production wiring |
| **Built-in adapters** | |
| `InMemorySqlAdapter` | SQL (in-memory) |
| `InMemoryNoSqlAdapter` | NoSQL (in-memory) |
| `InMemoryVectorAdapter` | Vector store (in-memory) |
| `InMemoryAnalyticsAdapter` | Analytics (in-memory) |
| `InMemorySearchAdapter` | Search (in-memory) |
| `InMemoryCacheAdapter` | Cache (in-memory) |
| `InMemoryObjectStorageAdapter` | Object storage (in-memory) |
| `InMemoryTimeSeriesAdapter` | Time-series (in-memory) |
| `InMemoryGraphAdapter` | Graph (in-memory) |
| `InMemoryMessageQueueAdapter` | Message queue (in-memory) |
| `ConsoleObservabilityAdapter` | Observability (console) |
| `NullObservabilityAdapter` | Observability (no-op) |
| `InMemoryEmbeddingAdapter` | Embedding (in-memory) |
| `InMemorySessionStoreAdapter` | Session store (in-memory) |
| `InMemoryMemoryStoreAdapter` | Memory store (in-memory) |
| `PassThroughGuardrailAdapter` | Guardrail (pass-through, dev only) |
| `InMemoryRagAdapter` | RAG pipeline (in-memory, keyword) |
| `InMemoryToolRegistryAdapter` | Tool registry (in-memory) |
| `NoOpAuthAdapter` | Auth (no-op, dev only) |
| `InMemoryRateLimitAdapter` | Rate limiter (token-bucket, in-memory) |
| `InMemoryAuditLogAdapter` | Audit log (ring-buffer, in-memory) |
| **Interfaces** | |
| `SessionStoreAdapter` | Session store contract |
| `MemoryStoreAdapter` | Memory store contract |
| `GuardrailAdapter` | Guardrail contract |
| `RagAdapter` | RAG pipeline contract |
| `ToolRegistryAdapter` | Tool registry contract |
| `AuthAdapter` | Auth contract |
| `RateLimitAdapter` | Rate-limit contract |
| `AuditLogAdapter` | Audit log contract |
| `AdapterBindings` | Per-module binding map |
| `AdapterRegistry` | Central registry interface |

## Plugins

| Export | From | Description |
|--------|------|-------------|
| `loggingPlugin` | `confused-ai/plugins` | Structured logging |
| `rateLimitPlugin` | `confused-ai/plugins` | Rate limiting |
| `telemetryPlugin` | `confused-ai/plugins` | OpenTelemetry integration |
| `AgentPlugin` | `confused-ai/plugins` | Plugin type |

## Background Queues

| Export | From | Description |
|--------|------|-------------|
| `queueHook` | `confused-ai/background` | Wrap a hook to dispatch tasks to a queue |
| `InMemoryBackgroundQueue` | `confused-ai/background` | In-process queue (dev/test) |
| `BullMQBackgroundQueue` | `confused-ai/background` | Redis-backed durable queue |
| `KafkaBackgroundQueue` | `confused-ai/background` | Kafka high-throughput queue |
| `RabbitMQBackgroundQueue` | `confused-ai/background` | AMQP queue |
| `SQSBackgroundQueue` | `confused-ai/background` | AWS SQS queue |
| `RedisPubSubBackgroundQueue` | `confused-ai/background` | Redis Pub/Sub fanout queue |
| `BackgroundQueue` | `confused-ai/background` | Interface — bring any backend |
| `BackgroundTask` | `confused-ai/background` | Task shape (type) |
| `BackgroundTaskHandler` | `confused-ai/background` | Worker handler type |
| `EnqueueOptions` | `confused-ai/background` | Enqueue options type |
| `QueuedHook` | `confused-ai/background` | Hook wrapper return type |

## Voice

| Export | From | Description |
|--------|------|-------------|
| `createVoiceProvider` | `confused-ai/voice` | Factory — auto-selects provider from env |
| `OpenAIVoiceProvider` | `confused-ai/voice` | OpenAI TTS-1 / Whisper |
| `ElevenLabsVoiceProvider` | `confused-ai/voice` | ElevenLabs premium voices |
| `VoiceProvider` | `confused-ai/voice` | Interface — bring any provider |
| `VoiceConfig` | `confused-ai/voice` | Configuration type |
| `TTSResult` | `confused-ai/voice` | TTS result shape |
| `STTResult` | `confused-ai/voice` | STT result shape |
| `OpenAIVoice` | `confused-ai/voice` | Union of OpenAI voice names |

## Budget Enforcement

| Export | From | Description |
|--------|------|-------------|
| `BudgetEnforcer` | `confused-ai/production` | Enforces budget caps on agent runs |
| `BudgetExceededError` | `confused-ai/production` | Thrown when a cap is exceeded |
| `InMemoryBudgetStore` | `confused-ai/production` | In-memory budget store |
| `BudgetConfig` | `confused-ai/production` | Budget configuration type |
| `BudgetStore` | `confused-ai/production` | Interface — bring any backend |
| `estimateCostUsdFromBudget` | `confused-ai/production` | Estimate cost from token counts |

## Agent Checkpointing

| Export | From | Description |
|--------|------|-------------|
| `InMemoryCheckpointStore` | `confused-ai/production` | In-memory checkpoint store (dev/test) |
| `SqliteCheckpointStore` | `confused-ai/production` | SQLite-backed checkpoint store |
| `createSqliteCheckpointStore` | `confused-ai/production` | SQLite checkpoint factory |
| `AgentCheckpointStore` | `confused-ai/production` | Interface — bring any backend |
| `AgentRunState` | `confused-ai/production` | Checkpoint snapshot shape |

## Idempotency

| Export | From | Description |
|--------|------|-------------|
| `InMemoryIdempotencyStore` | `confused-ai/production` | In-memory idempotency store |
| `IdempotencyStore` | `confused-ai/production` | Interface — bring any backend |
| `IdempotencyOptions` | `confused-ai/production` | Config type for `createHttpService` |
| `IdempotencyEntry` | `confused-ai/production` | Cached response entry type |

## Audit Log

| Export | From | Description |
|--------|------|-------------|
| `InMemoryAuditStore` | `confused-ai/production` | In-memory audit store (dev/test) |
| `createSqliteAuditStore` | `confused-ai/production` | SQLite audit store factory |
| `AuditStore` | `confused-ai/production` | Interface — bring any backend |
| `AuditEntry` | `confused-ai/production` | Audit log entry shape |
| `AuditFilter` | `confused-ai/production` | Query filter type |

## Human-in-the-Loop (HITL)

| Export | From | Description |
|--------|------|-------------|
| `waitForApproval` | `confused-ai/production` | Poll store until human decides (or times out) |
| `createSqliteApprovalStore` | `confused-ai/production` | SQLite-backed approval store |
| `InMemoryApprovalStore` | `confused-ai/production` | In-memory approval store (tests) |
| `SqliteApprovalStore` | `confused-ai/production` | Class-based SQLite approval store |
| `ApprovalRejectedError` | `confused-ai/production` | Thrown when approval is rejected or times out |
| `ApprovalStore` | `confused-ai/production` | Interface — bring any backend |
| `HitlRequest` | `confused-ai/production` | Pending approval request shape |
| `ApprovalDecision` | `confused-ai/production` | Decision shape |
| `ApprovalStatus` | `confused-ai/production` | `'pending' \| 'approved' \| 'rejected' \| 'expired'` |

## Multi-Tenancy

| Export | From | Description |
|--------|------|-------------|
| `createTenantContext` | `confused-ai/production` | Create a tenant-scoped context |
| `TenantScopedSessionStore` | `confused-ai/production` | Prefix-wrapping session store |
| `TenantContext` | `confused-ai/production` | Context shape (type) |
| `TenantContextOptions` | `confused-ai/production` | Config type |

## Redis Rate Limiter

| Export | From | Description |
|--------|------|-------------|
| `RedisRateLimiter` | `confused-ai/production` | Distributed fixed-window rate limiter |
| `RedisRateLimiterConfig` | `confused-ai/production` | Config type |

## Extension Contracts

All pluggable interfaces, in one place. Import from `confused-ai/contracts/extensions`.

| Interface | Description |
|-----------|-------------|
| `SessionStore` | Session persistence |
| `StorageAdapter` | Key-value storage |
| `UserProfileStore` | Long-term user profiles |
| `MemoryStore` | Agent memory (short + long-term) |
| `BudgetStore` | USD spend tracking |
| `AgentCheckpointStore` | Durable step-level state |
| `IdempotencyStore` | Request deduplication |
| `AuditStore` | Structured audit trail |
| `ApprovalStore` | HITL approval queue |
| `TenantContext` | Per-tenant isolation |
| `RateLimiterConfig` | Rate limiter config |
| `CircuitBreakerConfig` | Circuit breaker config |
| `Tracer` | Distributed tracing |
| `MetricsCollector` | Metrics collection |
| `TraceContext` | W3C Trace Context |
| `AuthMiddlewareOptions` | Auth middleware |
| `Tool` | Tool definition |
| `RAGEngine` | RAG / knowledge engine |
| `LLMProvider` | LLM provider |

```ts
// Import any extension interface:
import type { BudgetStore } from 'confused-ai/contracts/extensions';
import type { SessionStore } from 'confused-ai/contracts/extensions';
import type { LLMProvider } from 'confused-ai/contracts/extensions';
```

## Subpath imports

All modules are available as top-level exports from `confused-ai` and as dedicated subpath imports:

```ts
// Top-level (everything)
import { agent, defineTool, KnowledgeEngine, createStorage } from 'confused-ai';

// Subpath (tree-shakeable, faster)
import { defineTool } from 'confused-ai/tool';
import { KnowledgeEngine } from 'confused-ai/knowledge';
import { createStorage } from 'confused-ai/storage';
import { InMemorySessionStore } from 'confused-ai/session';
import { AgentRouter } from 'confused-ai/workflow';
import { ResilientAgent } from 'confused-ai/guard';
import { LLMRouter, createSmartRouter, createBalancedRouter } from 'confused-ai/model';
import { ConsoleLogger } from 'confused-ai/observe';
import { queueHook, InMemoryBackgroundQueue, BullMQBackgroundQueue } from 'confused-ai/background';
import { createVoiceProvider, OpenAIVoiceProvider } from 'confused-ai/voice';
import {
  BudgetEnforcer, BudgetExceededError,
  createSqliteCheckpointStore,
  createSqliteIdempotencyStore,
  createSqliteAuditStore,
  createSqliteApprovalStore,
  waitForApproval,
  createTenantContext,
  RedisRateLimiter,
} from 'confused-ai/guard';
import {
  createAdapterRegistry,
  createProductionSetup,
  InMemoryCacheAdapter,
  InMemorySessionStoreAdapter,
  InMemoryRateLimitAdapter,
  InMemoryAuditLogAdapter,
} from 'confused-ai/adapters';

// Extension interfaces — bring-your-own implementations
import type { BudgetStore, SessionStore, LLMProvider, Tool } from 'confused-ai/contracts/extensions';
```
