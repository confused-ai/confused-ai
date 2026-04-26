# API Reference

Full API reference for all fluxion modules.

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
import { agent } from 'fluxion';
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
| `KnowledgeEngine` | `fluxion/knowledge` | RAG engine |
| `TextLoader` | `fluxion/knowledge` | Load .txt / .md files |
| `JSONLoader` | `fluxion/knowledge` | Load .json files |
| `CSVLoader` | `fluxion/knowledge` | Load .csv files |
| `URLLoader` | `fluxion/knowledge` | Load web pages |
| `OpenAIEmbeddingProvider` | `fluxion/memory` | Text embeddings via OpenAI |
| `InMemoryVectorStore` | `fluxion/memory` | In-process vector store |
| `DocumentLoader` | `fluxion/knowledge` | Loader interface |
| `KnowledgeEngineConfig` | `fluxion/knowledge` | Engine config type |

## Memory

| Export | From | Description |
|--------|------|-------------|
| `InMemoryStore` | `fluxion/memory` | In-memory conversation history |
| `VectorMemoryStore` | `fluxion/memory` | Semantic long-term memory |
| `OpenAIEmbeddingProvider` | `fluxion/memory` | Text embeddings |
| `InMemoryVectorStore` | `fluxion/memory` | In-process vector store |

## Storage

| Export | From | Description |
|--------|------|-------------|
| `createStorage(options?)` | `fluxion/storage` | Create a storage instance |
| `MemoryStorageAdapter` | `fluxion/storage` | In-memory adapter |
| `FileStorageAdapter` | `fluxion/storage` | File-system adapter |
| `Storage` | `fluxion/storage` | High-level storage interface |
| `StorageAdapter` | `fluxion/storage` | Low-level adapter interface |
| `StorageOptions` | `fluxion/storage` | `createStorage()` options type |

## Session

| Export | From | Description |
|--------|------|-------------|
| `InMemorySessionStore` | `fluxion/session` | In-memory sessions |
| `SqlSessionStore` | `fluxion/session` | SQL-backed sessions |
| `createSqliteSessionStore` | `fluxion/session` | SQLite session factory |
| `SessionDbDriver` | `fluxion/session` | DB driver interface |

## Orchestration

| Export | From | Description |
|--------|------|-------------|
| `AgentRouter` | `fluxion/orchestration` | Route to matching agent |
| `createHandoff` | `fluxion/orchestration` | Create handoff protocol |
| `ConsensusProtocol` | `fluxion/orchestration` | Multi-agent voting |
| `Supervisor` | `fluxion/orchestration` | Supervisor + workers |
| `Swarm` | `fluxion/orchestration` | Peer-to-peer agent swarm |
| `Pipeline` | `fluxion/orchestration` | Sequential agent pipeline |
| `MessageBus` | `fluxion/orchestration` | Pub/sub message bus |
| `LoadBalancer` | `fluxion/orchestration` | Distribute across agent pool |
| `McpClient` | `fluxion/orchestration` | MCP server client |
| `HttpA2AClient` | `fluxion/orchestration` | Outbound A2A message client (POST to broker) |
| `createHttpA2AClient` | `fluxion/orchestration` | Factory for `HttpA2AClient` |
| `A2AClient` | `fluxion/orchestration` | A2A client interface |
| `A2AMessage` | `fluxion/orchestration` | A2A message shape |
| `team` | `fluxion` | Parallel agent team |

## Production

| Export | From | Description |
|--------|------|-------------|
| `ResilientAgent` | `fluxion/production` | Retries + circuit breaker |
| `HealthMonitor` | `fluxion/production` | Agent health checks |
| `createFallbackChain` | `fluxion/llm` | LLM failover chain |
| `CostTracker` | `fluxion/llm` | Track LLM spending |
| `ContextWindowManager` | `fluxion/llm` | Token limit management |
| `LLMRouter` | `fluxion/llm` | Intelligent model router (task-aware, strategy-based) |
| `createSmartRouter` | `fluxion/llm` | **Adaptive** multi-criteria routing (recommended) |
| `scoreTaskTypesForRouting` | `fluxion/llm` | Inspect / reuse built-in task scores |
| `createBalancedRouter` | `fluxion/llm` | Balanced routing factory |
| `createCostOptimizedRouter` | `fluxion/llm` | Cost-first routing factory |
| `createQualityFirstRouter` | `fluxion/llm` | Quality-first routing factory |
| `createSpeedOptimizedRouter` | `fluxion/llm` | Speed-first routing factory |

## Observability

| Export | From | Description |
|--------|------|-------------|
| `ConsoleLogger` | `fluxion/observability` | Structured console logging |
| `OtlpExporter` | `fluxion/observability` | OTLP trace exporter |
| `Metrics` | `fluxion/observability` | Metrics collection |
| `evaluate` | `fluxion/observability` | Agent evaluation runner |

## Guardrails

| Export | From | Description |
|--------|------|-------------|
| `createGuardrails` | `fluxion/guardrails` | Create guardrail config |
| `GuardrailValidator` | `fluxion/guardrails` | Custom validator interface |

## Adapters

All adapter interfaces and built-in implementations. Import from `fluxion/adapters`.

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
| `loggingPlugin` | `fluxion/plugins` | Structured logging |
| `rateLimitPlugin` | `fluxion/plugins` | Rate limiting |
| `telemetryPlugin` | `fluxion/plugins` | OpenTelemetry integration |
| `AgentPlugin` | `fluxion/plugins` | Plugin type |

## Background Queues

| Export | From | Description |
|--------|------|-------------|
| `queueHook` | `fluxion/background` | Wrap a hook to dispatch tasks to a queue |
| `InMemoryBackgroundQueue` | `fluxion/background` | In-process queue (dev/test) |
| `BullMQBackgroundQueue` | `fluxion/background` | Redis-backed durable queue |
| `KafkaBackgroundQueue` | `fluxion/background` | Kafka high-throughput queue |
| `RabbitMQBackgroundQueue` | `fluxion/background` | AMQP queue |
| `SQSBackgroundQueue` | `fluxion/background` | AWS SQS queue |
| `RedisPubSubBackgroundQueue` | `fluxion/background` | Redis Pub/Sub fanout queue |
| `BackgroundQueue` | `fluxion/background` | Interface — bring any backend |
| `BackgroundTask` | `fluxion/background` | Task shape (type) |
| `BackgroundTaskHandler` | `fluxion/background` | Worker handler type |
| `EnqueueOptions` | `fluxion/background` | Enqueue options type |
| `QueuedHook` | `fluxion/background` | Hook wrapper return type |

## Voice

| Export | From | Description |
|--------|------|-------------|
| `createVoiceProvider` | `fluxion/voice` | Factory — auto-selects provider from env |
| `OpenAIVoiceProvider` | `fluxion/voice` | OpenAI TTS-1 / Whisper |
| `ElevenLabsVoiceProvider` | `fluxion/voice` | ElevenLabs premium voices |
| `VoiceProvider` | `fluxion/voice` | Interface — bring any provider |
| `VoiceConfig` | `fluxion/voice` | Configuration type |
| `TTSResult` | `fluxion/voice` | TTS result shape |
| `STTResult` | `fluxion/voice` | STT result shape |
| `OpenAIVoice` | `fluxion/voice` | Union of OpenAI voice names |

## Budget Enforcement

| Export | From | Description |
|--------|------|-------------|
| `BudgetEnforcer` | `fluxion/production` | Enforces budget caps on agent runs |
| `BudgetExceededError` | `fluxion/production` | Thrown when a cap is exceeded |
| `InMemoryBudgetStore` | `fluxion/production` | In-memory budget store |
| `BudgetConfig` | `fluxion/production` | Budget configuration type |
| `BudgetStore` | `fluxion/production` | Interface — bring any backend |
| `estimateCostUsdFromBudget` | `fluxion/production` | Estimate cost from token counts |

## Agent Checkpointing

| Export | From | Description |
|--------|------|-------------|
| `InMemoryCheckpointStore` | `fluxion/production` | In-memory checkpoint store (dev/test) |
| `SqliteCheckpointStore` | `fluxion/production` | SQLite-backed checkpoint store |
| `createSqliteCheckpointStore` | `fluxion/production` | SQLite checkpoint factory |
| `AgentCheckpointStore` | `fluxion/production` | Interface — bring any backend |
| `AgentRunState` | `fluxion/production` | Checkpoint snapshot shape |

## Idempotency

| Export | From | Description |
|--------|------|-------------|
| `InMemoryIdempotencyStore` | `fluxion/production` | In-memory idempotency store |
| `IdempotencyStore` | `fluxion/production` | Interface — bring any backend |
| `IdempotencyOptions` | `fluxion/production` | Config type for `createHttpService` |
| `IdempotencyEntry` | `fluxion/production` | Cached response entry type |

## Audit Log

| Export | From | Description |
|--------|------|-------------|
| `InMemoryAuditStore` | `fluxion/production` | In-memory audit store (dev/test) |
| `createSqliteAuditStore` | `fluxion/production` | SQLite audit store factory |
| `AuditStore` | `fluxion/production` | Interface — bring any backend |
| `AuditEntry` | `fluxion/production` | Audit log entry shape |
| `AuditFilter` | `fluxion/production` | Query filter type |

## Human-in-the-Loop (HITL)

| Export | From | Description |
|--------|------|-------------|
| `waitForApproval` | `fluxion/production` | Poll store until human decides (or times out) |
| `createSqliteApprovalStore` | `fluxion/production` | SQLite-backed approval store |
| `InMemoryApprovalStore` | `fluxion/production` | In-memory approval store (tests) |
| `SqliteApprovalStore` | `fluxion/production` | Class-based SQLite approval store |
| `ApprovalRejectedError` | `fluxion/production` | Thrown when approval is rejected or times out |
| `ApprovalStore` | `fluxion/production` | Interface — bring any backend |
| `HitlRequest` | `fluxion/production` | Pending approval request shape |
| `ApprovalDecision` | `fluxion/production` | Decision shape |
| `ApprovalStatus` | `fluxion/production` | `'pending' \| 'approved' \| 'rejected' \| 'expired'` |

## Multi-Tenancy

| Export | From | Description |
|--------|------|-------------|
| `createTenantContext` | `fluxion/production` | Create a tenant-scoped context |
| `TenantScopedSessionStore` | `fluxion/production` | Prefix-wrapping session store |
| `TenantContext` | `fluxion/production` | Context shape (type) |
| `TenantContextOptions` | `fluxion/production` | Config type |

## Redis Rate Limiter

| Export | From | Description |
|--------|------|-------------|
| `RedisRateLimiter` | `fluxion/production` | Distributed fixed-window rate limiter |
| `RedisRateLimiterConfig` | `fluxion/production` | Config type |

## Extension Contracts

All pluggable interfaces, in one place. Import from `fluxion/contracts/extensions`.

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
import type { BudgetStore } from 'fluxion/contracts/extensions';
import type { SessionStore } from 'fluxion/contracts/extensions';
import type { LLMProvider } from 'fluxion/contracts/extensions';
```

## Subpath imports

All modules are available as top-level exports from `fluxion` and as dedicated subpath imports:

```ts
// Top-level (everything)
import { agent, defineTool, KnowledgeEngine, createStorage } from 'fluxion';

// Subpath (tree-shakeable, faster)
import { defineTool } from 'fluxion/tools';
import { KnowledgeEngine } from 'fluxion/knowledge';
import { createStorage } from 'fluxion/storage';
import { InMemorySessionStore } from 'fluxion/session';
import { AgentRouter } from 'fluxion/orchestration';
import { ResilientAgent } from 'fluxion/production';
import { LLMRouter, createSmartRouter, createBalancedRouter } from 'fluxion/llm';
import { ConsoleLogger } from 'fluxion/observability';
import { queueHook, InMemoryBackgroundQueue, BullMQBackgroundQueue } from 'fluxion/background';
import { createVoiceProvider, OpenAIVoiceProvider } from 'fluxion/voice';
import {
  BudgetEnforcer, BudgetExceededError,
  createSqliteCheckpointStore,
  createSqliteIdempotencyStore,
  createSqliteAuditStore,
  createSqliteApprovalStore,
  waitForApproval,
  createTenantContext,
  RedisRateLimiter,
} from 'fluxion/production';
import {
  createAdapterRegistry,
  createProductionSetup,
  InMemoryCacheAdapter,
  InMemorySessionStoreAdapter,
  InMemoryRateLimitAdapter,
  InMemoryAuditLogAdapter,
} from 'fluxion/adapters';

// Extension interfaces — bring-your-own implementations
import type { BudgetStore, SessionStore, LLMProvider, Tool } from 'fluxion/contracts/extensions';
```
