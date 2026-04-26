# Confused-AI — full capability map

Use this as a checklist of what the framework can do and which import path to start from. Not every feature needs to be used in one app.

## Core agent loop

| Capability | Where | Notes |
|------------|--------|--------|
| One-call production agent | `createAgent` from `confused-ai` or `confused-ai/create-agent` | LLM from env / `model: "provider:id"`, tools, session, guardrails, hooks |
| ReAct loop without `createAgent` | `createAgenticAgent` — `confused-ai/agentic` | Bring your own `LLMProvider` + `ToolRegistry` |
| Class-based agent | `Agent` — `confused-ai` | Session lifecycle |
| DX fluent builder | `defineAgent()` chain — `confused-ai` | `.name().instructions().model().tools().build()` |
| Typed Zod agents | `defineTypedAgent` — `confused-ai` | Same name as SDK `defineAgent` in source; avoids clash with DX |

## Tools & integrations

| Capability | Where |
|------------|--------|
| Huge built-in toolset (HTTP, browser, data, finance, comms, search, …) | `confused-ai/tools` |
| Tool registry, middleware | `toToolRegistry`, `ToolRegistryImpl` |
| MCP over HTTP (consumer) | `HttpMcpClient`, `loadMcpToolsFromUrl` |
| MCP HTTP server (streamable HTTP) | `McpHttpServer`, `createMcpServer` — `confused-ai/tools` |
| MCP stdio (minimal JSON-RPC subset) | `runMcpStdioToolServer`, `handleMcpStdioLine` — `confused-ai/tools` |
| Tool gateway (JSON: list + invoke) | `handleToolGatewayRequest` — `confused-ai/tools` (mount paths `/tools`, `/invoke`) |
| Headless page title (optional peer) | `PlaywrightPageTitleTool` — `confused-ai/tools` (`npm install playwright`) |
| Optional npm deps | Install only what you use; bundlers should mark them **external** (see `tsup.config.ts`) |

## Session, memory, knowledge

| Capability | Where |
|------------|--------|
| Conversation sessions (DB or memory) | `confused-ai/session` — `InMemorySessionStore`, `SqlSessionStore`, `createSqliteSessionStore`, Bun-only `createBunSqliteSessionStore` (import from `src/session/bun-sqlite-store` in Bun apps) |
| Redis sessions + distributed LLM cache | `RedisSessionStore`, `RedisLlmCache` — `confused-ai/session` (cache keys: `RedisLlmCacheKeyInput`) |
| Long-term / semantic memory | `confused-ai/memory` — `InMemoryStore`, vector memory |
| Production vector DBs | `PineconeVectorStore`, `QdrantVectorStore`, `PgVectorStore` — `confused-ai/memory` |
| User profiles across sessions | `confused-ai/learning` — `InMemoryUserProfileStore`, `LearningMode` |
| RAG: ingest, chunk, retrieve, hybrid | `KnowledgeEngine`, `splitText` — `confused-ai/knowledge` |
| Embeddings + vector adapter | `OpenAIEmbeddingProvider`, `InMemoryVectorStore` — `confused-ai/llm`, `confused-ai/memory` |
| Document loaders | `TextLoader`, `JSONLoader`, `CSVLoader`, `URLLoader` — `confused-ai/knowledge` |

## Safety & planning

| Capability | Where |
|------------|--------|
| Guardrails (rules, validators) | `confused-ai/guardrails` |
| Moderation / PII / prompt injection | `createOpenAiModerationRule`, `createPiiDetectionRule`, `createPromptInjectionRule`, `detectPromptInjection` — `confused-ai/guardrails` |
| Planners & plans | `confused-ai/planner` |
| Execution graphs / workers | `confused-ai/execution` |

## Graph Engine

| Capability | Where |
|------------|--------|
| DAG graph execution | `createGraph`, `DAGEngine` — `confused-ai/graph` |
| Durable execution + crash resume | `DurableExecutor` — `confused-ai/graph` — `.run()` + `.resume(executionId)` with graph-version mismatch detection |
| Wave-based scheduling | `computeWaves(graph) → NodeId[][]` — `confused-ai/graph` |
| Concurrency control | `BackpressureController(maxConcurrency)` — `confused-ai/graph` — `.acquire()/.release()`, `.inflight`, `.queueDepth` |
| Graph event sourcing | `InMemoryEventStore`, `SqliteEventStore` — `confused-ai/graph` |
| Distributed graph workers | `DistributedEngine`, `InMemoryTaskQueue`, `RedisTaskQueue`, `GraphWorker` — `confused-ai/graph` |
| Multi-agent graph orchestration | `MultiAgentOrchestrator`, `agentNode(id, agent)` — `confused-ai/graph` |
| Graph telemetry plugins | `TelemetryPlugin`, `LoggingPlugin`, `AuditPlugin`, `RateLimitPlugin` — `confused-ai/graph` |
| Graph testing utilities | `createTestRunner`, `createMockLLMProvider`, `expectEventSequence`, `assertExactEventSequence` — `confused-ai/testing` |
| CLI: replay event timeline | `confused-ai replay --run-id <id> [--db path] [--json] [--from seq]` |
| CLI: per-node inspection | `confused-ai inspect --run-id <id> [--db path]` |
| CLI: export events to JSON | `confused-ai export --run-id <id> [--db path] [--out file] [--pretty]` |
| CLI: diff two runs | `confused-ai diff --run-id-a <id> --run-id-b <id> [--db path]` — exits `1` if divergent |

## Orchestration

| Capability | Where |
|------------|--------|
| Pipelines (sequential handoff) | `createPipeline` — `confused-ai/orchestration` |
| Supervisor, swarm, teams, toolkit | same module |
| SDK workflows (parallel / sequential) | `createWorkflow`, `defineTypedAgent` — `confused-ai` |
| Core `Agent` in orchestration | `asOrchestratorAgent(definedAgent)` — `confused-ai` |
| A2A types + HTTP client | `A2AMessage`, `HttpA2AClient`, `createHttpA2AClient` — `confused-ai/orchestration` |
| Agent router strategy type | `AgentRoutingStrategy` — `confused-ai/orchestration` (LLM routing uses `RoutingStrategy` in `confused-ai/llm`) |

## Observability & quality

| Capability | Where |
|------------|--------|
| Loggers, tracer, metrics | `confused-ai/observability` |
| Eval accuracy helpers | `EvalAggregator`, `ExactMatchAccuracy`, `LevenshteinAccuracy`, `wordOverlapF1`, `rougeLWords` |
| LLM-as-judge | `runLlmAsJudge` — `confused-ai/observability` |
| Langfuse / LangSmith HTTP batch helpers | `sendLangfuseBatch`, `sendLangSmithRunBatch` — `confused-ai/observability` |
| OTLP | `OTLPTraceExporter`, `OTLPMetricsExporter` |

## Production & resilience

| Capability | Where |
|------------|--------|
| Health checks (K8s-style) | `HealthCheckManager`, `createLLMHealthCheck`, `createSessionStoreHealthCheck` — `confused-ai/production` |
| Rate limiting (in-process) | `RateLimiter`, `createOpenAIRateLimiter` — `confused-ai/production` |
| Rate limiting (distributed) | **`RedisRateLimiter`** (Redis fixed window) — `confused-ai/production` |
| Circuit breaker | `CircuitBreaker`, `createLLMCircuitBreaker` — `confused-ai/production` |
| Resumable streams (SSE) | `ResumableStreamManager`, `createResumableStream`, `formatSSE` — `confused-ai/production` |
| Graceful shutdown | `GracefulShutdown`, `createGracefulShutdown`, `withShutdownGuard` — `confused-ai/production` |
| **Budget enforcement** | `BudgetEnforcer`, `BudgetExceededError`, `InMemoryBudgetStore` — `confused-ai/production` |
| **Agent checkpointing** | `InMemoryCheckpointStore`, `SqliteCheckpointStore`, `createSqliteCheckpointStore` — `confused-ai/production`. **Wired into runner** — pass `checkpointStore` + `runId` to `createAgent` to auto-resume interrupted runs. |
| **Idempotency** | `InMemoryIdempotencyStore`, `createSqliteIdempotencyStore` — `confused-ai/production`. **Wired into HTTP service** — `X-Idempotency-Key` header deduplicates retried requests. |
| **Audit log** | `InMemoryAuditStore`, `createSqliteAuditStore` — `confused-ai/production`. **Wired into HTTP service** — pass `auditStore` to persist all requests to SQLite/custom store. |
| **Human-in-the-Loop (HITL)** | `waitForApproval`, `InMemoryApprovalStore`, `createSqliteApprovalStore`, `ApprovalRejectedError` — `confused-ai/production` |
| **Multi-tenancy** | `createTenantContext`, `TenantScopedSessionStore` — `confused-ai/production` |

## Background Queues

| Capability | Where |
|------------|--------|
| In-memory (dev/test) | `InMemoryBackgroundQueue` — `confused-ai/background` |
| BullMQ (Redis, durable) | `BullMQBackgroundQueue` — `confused-ai/background` (`bun add bullmq`) |
| Kafka | `KafkaBackgroundQueue` — `confused-ai/background` (`bun add kafkajs`) |
| RabbitMQ | `RabbitMQBackgroundQueue` — `confused-ai/background` (`bun add amqplib`) |
| AWS SQS | `SQSBackgroundQueue` — `confused-ai/background` (`bun add @aws-sdk/client-sqs`) |
| Redis Pub/Sub | `RedisPubSubBackgroundQueue` — `confused-ai/background` (`bun add ioredis`) |
| Hook wrapper | `queueHook` — `confused-ai/background` |

## Voice

| Capability | Where |
|------------|--------|
| OpenAI TTS (tts-1, tts-1-hd) + Whisper STT | `OpenAIVoiceProvider` — `confused-ai/voice` |
| ElevenLabs premium voices + voice cloning | `ElevenLabsVoiceProvider` — `confused-ai/voice` (`bun add elevenlabs`) |
| Auto-select from env | `createVoiceProvider()` — `confused-ai/voice` |

## Extension Contracts

All pluggable interfaces, dependency-free, in one place — no circular imports.

| Capability | Where |
|------------|--------|
| Every pluggable interface | `confused-ai/contracts/extensions` |

## Artifacts & media

| Capability | Where |
|------------|--------|
| Versioned structured outputs | `InMemoryArtifactStorage`, `createTextArtifact`, `createMarkdownArtifact`, … — `confused-ai/artifacts` |
| Media helpers | `confused-ai/artifacts` + `media` export |

## HTTP service

| Capability | Where |
|------------|--------|
| Health, chat JSON + SSE, sessions, OpenAPI | `createHttpService`, `listenService`, `getRuntimeOpenApiJson` — `confused-ai/runtime` |
| Auth + body size limits | `auth` option (`api-key`, `bearer`, `basic`, `custom`), `maxBodyBytes` — `CreateHttpServiceOptions` |
| Approval endpoint | `POST /v1/approvals/:id` (auto-wired when `approvalStore` is passed) |
| **Idempotency** | `idempotency: { store, ttlMs }` in `CreateHttpServiceOptions` — `X-Idempotency-Key` header deduplication |
| **Persistent audit** | `auditStore` in `CreateHttpServiceOptions` — replaces 500-entry in-memory ring with durable store |
| **WebSocket transport** | `websocket: true` in `CreateHttpServiceOptions` — `ws://host/v1/ws` for real-time bidirectional streaming |
| **Admin API** | `adminApi: { enabled: true, bearerToken, auditStore, checkpointStore }` — `/admin/health`, `/admin/agents`, `/admin/audit`, `/admin/stats`, `/admin/checkpoints` |

## Config & environment

| Capability | Where |
|------------|--------|
| Load + validate env-based app config | `loadConfig`, `loadConfigWithDefaults`, `validateConfig` — `confused-ai/config` |
| **Secret managers** | `createSecretManager({ provider: 'aws' \| 'azure' \| 'vault' \| 'gcp' \| 'env' })` — `confused-ai/config`. Lazy SDK loading, zero peer deps required. |

## Evaluation

| Capability | Where |
|------------|--------|
| LLM judge (GPT-4o) | `runLlmAsJudge`, `createMultiCriteriaJudge`, `runEvalBatch` — `confused-ai/observability` |
| Exact/partial/Levenshtein/ROUGE metrics | `ExactMatchAccuracy`, `LevenshteinAccuracy`, `rougeLWords`, `wordOverlapF1` — `confused-ai/observability` |
| **Eval dataset persistence + regression detection** | `runEvalSuite({ suiteName, dataset, agent, store, regressionThreshold })`, `InMemoryEvalStore`, `createSqliteEvalStore` — `confused-ai/observability`. CI-friendly: `process.exit(1)` when score drops. |

## Deployment templates

| Platform | File |
|----------|------|
| Docker | `templates/Dockerfile` |
| Docker Compose + Redis | `templates/docker-compose.yml` |
| Fly.io | `templates/fly.toml` |
| Render | `templates/render.yaml` |
| Kubernetes (Deployment + Service + HPA) | `templates/k8s.yaml` |

## Video

| Capability | Where |
|------------|--------|
| Video / shorts pipeline (OpenAI + Pexels) | `VideoOrchestrator` — `confused-ai` (lazy clients via env vars) |

## Testing

| Capability | Where |
|------------|--------|
| Mocks & fixtures | `MockLLMProvider`, `MockSessionStore` — `confused-ai/testing` |

## LLM providers

| Capability | Where |
|------------|--------|
| OpenAI, Anthropic, Google, fallbacks, caching, cost | `confused-ai/llm` |
| Amazon Bedrock Converse (optional SDK peer) | `BedrockConverseProvider` — `confused-ai/llm` |
| Stream → text → Zod | `collectStreamText`, `collectStreamThenValidate` — `confused-ai/llm` |
| Intelligent LLM routing | `createSmartRouter` (**adaptive** score), `LLMRouter` (`strategy: 'adaptive' \| 'balanced' \| …`), `scoreTaskTypesForRouting` |
| `provider:model` resolution | `resolveLlmForCreateAgent`, `resolveModelString` |
| Context limits | `MODEL_CONTEXT_LIMITS`, `getContextLimitForModel`, `resolveModelKeyForContextLimit` |
| Vision / multimodal parts | `multiModal`, `imageUrl`, … — `confused-ai/llm` (`vision.js`) |

## Runnable examples in this repo

| Script | What it shows |
|--------|----------------|
| `bun run example:simple` | Minimal `createAgent` + `confused-ai/create-agent` import |
| `bun run example:showcase` | Sessions, tools, guardrails, metrics, health, SDK workflow, pipeline, OpenAPI, optional `--http` |
| `bun run example:potential` | Extra modules: chunking, circuit breaker, rate limiter, artifacts, profiles, eval metrics, `loadConfig` (works best with `examples/.env`) |

## Practical “use everything that matters to you”

1. **Ship an API** — `createAgent` + `createHttpService` + health + `getRuntimeOpenApiJson`.  
2. **Ship RAG** — `KnowledgeEngine` + embeddings + vector store; wire context into your agent or tools.  
3. **Ship multi-step products** — `createWorkflow` or `createPipeline` + `asOrchestratorAgent`.  
4. **Ship safely at scale** — guardrails, rate limiter, circuit breaker, session store on Redis/Postgres, OTLP.  
5. **Ship learning** — `userProfileStore` + `memoryStore` / `ragEngine` on `createAgent` (where your version wires them), or custom tools.

The framework is **modular**: import only the subpaths you need (`package.json` → `exports`).
