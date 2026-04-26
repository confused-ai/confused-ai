# Fluxion — full capability map

Use this as a checklist of what the framework can do and which import path to start from. Not every feature needs to be used in one app.

## Core agent loop

| Capability | Where | Notes |
|------------|--------|--------|
| One-call production agent | `createAgent` from `fluxion` or `fluxion/create-agent` | LLM from env / `model: "provider:id"`, tools, session, guardrails, hooks |
| ReAct loop without `createAgent` | `createAgenticAgent` — `fluxion/agentic` | Bring your own `LLMProvider` + `ToolRegistry` |
| Class-based agent | `Agent` — `fluxion` | Session lifecycle |
| DX fluent builder | `defineAgent()` chain — `fluxion` | `.name().instructions().model().tools().build()` |
| Typed Zod agents | `defineTypedAgent` — `fluxion` | Same name as SDK `defineAgent` in source; avoids clash with DX |

## Tools & integrations

| Capability | Where |
|------------|--------|
| Huge built-in toolset (HTTP, browser, data, finance, comms, search, …) | `fluxion/tools` |
| Tool registry, middleware | `toToolRegistry`, `ToolRegistryImpl` |
| MCP over HTTP (consumer) | `HttpMcpClient`, `loadMcpToolsFromUrl` |
| MCP HTTP server (streamable HTTP) | `McpHttpServer`, `createMcpServer` — `fluxion/tools` |
| MCP stdio (minimal JSON-RPC subset) | `runMcpStdioToolServer`, `handleMcpStdioLine` — `fluxion/tools` |
| Tool gateway (JSON: list + invoke) | `handleToolGatewayRequest` — `fluxion/tools` (mount paths `/tools`, `/invoke`) |
| Headless page title (optional peer) | `PlaywrightPageTitleTool` — `fluxion/tools` (`npm install playwright`) |
| Optional npm deps | Install only what you use; bundlers should mark them **external** (see `tsup.config.ts`) |

## Session, memory, knowledge

| Capability | Where |
|------------|--------|
| Conversation sessions (DB or memory) | `fluxion/session` — `InMemorySessionStore`, `SqlSessionStore`, `createSqliteSessionStore`, Bun-only `createBunSqliteSessionStore` (import from `src/session/bun-sqlite-store` in Bun apps) |
| Redis sessions + distributed LLM cache | `RedisSessionStore`, `RedisLlmCache` — `fluxion/session` (cache keys: `RedisLlmCacheKeyInput`) |
| Long-term / semantic memory | `fluxion/memory` — `InMemoryStore`, vector memory |
| Production vector DBs | `PineconeVectorStore`, `QdrantVectorStore`, `PgVectorStore` — `fluxion/memory` |
| User profiles across sessions | `fluxion/learning` — `InMemoryUserProfileStore`, `LearningMode` |
| RAG: ingest, chunk, retrieve, hybrid | `KnowledgeEngine`, `splitText` — `fluxion/knowledge` |
| Embeddings + vector adapter | `OpenAIEmbeddingProvider`, `InMemoryVectorStore` — `fluxion/llm`, `fluxion/memory` |
| Document loaders | `TextLoader`, `JSONLoader`, `CSVLoader`, `URLLoader` — `fluxion/knowledge` |

## Safety & planning

| Capability | Where |
|------------|--------|
| Guardrails (rules, validators) | `fluxion/guardrails` |
| Moderation / PII / prompt injection | `createOpenAiModerationRule`, `createPiiDetectionRule`, `createPromptInjectionRule`, `detectPromptInjection` — `fluxion/guardrails` |
| Planners & plans | `fluxion/planner` |
| Execution graphs / workers | `fluxion/execution` |

## Orchestration

| Capability | Where |
|------------|--------|
| Pipelines (sequential handoff) | `createPipeline` — `fluxion/orchestration` |
| Supervisor, swarm, teams, toolkit | same module |
| SDK workflows (parallel / sequential) | `createWorkflow`, `defineTypedAgent` — `fluxion` |
| Core `Agent` in orchestration | `asOrchestratorAgent(definedAgent)` — `fluxion` |
| A2A types + HTTP client | `A2AMessage`, `HttpA2AClient`, `createHttpA2AClient` — `fluxion/orchestration` |
| Agent router strategy type | `AgentRoutingStrategy` — `fluxion/orchestration` (LLM routing uses `RoutingStrategy` in `fluxion/llm`) |

## Observability & quality

| Capability | Where |
|------------|--------|
| Loggers, tracer, metrics | `fluxion/observability` |
| Eval accuracy helpers | `EvalAggregator`, `ExactMatchAccuracy`, `LevenshteinAccuracy`, `wordOverlapF1`, `rougeLWords` |
| LLM-as-judge | `runLlmAsJudge` — `fluxion/observability` |
| Langfuse / LangSmith HTTP batch helpers | `sendLangfuseBatch`, `sendLangSmithRunBatch` — `fluxion/observability` |
| OTLP | `OTLPTraceExporter`, `OTLPMetricsExporter` |

## Production & resilience

| Capability | Where |
|------------|--------|
| Health checks (K8s-style) | `HealthCheckManager`, `createLLMHealthCheck`, `createSessionStoreHealthCheck` — `fluxion/production` |
| Rate limiting (in-process) | `RateLimiter`, `createOpenAIRateLimiter` — `fluxion/production` |
| Rate limiting (distributed) | **`RedisRateLimiter`** (Redis fixed window) — `fluxion/production` |
| Circuit breaker | `CircuitBreaker`, `createLLMCircuitBreaker` — `fluxion/production` |
| Resumable streams (SSE) | `ResumableStreamManager`, `createResumableStream`, `formatSSE` — `fluxion/production` |
| Graceful shutdown | `GracefulShutdown`, `createGracefulShutdown`, `withShutdownGuard` — `fluxion/production` |
| **Budget enforcement** | `BudgetEnforcer`, `BudgetExceededError`, `InMemoryBudgetStore` — `fluxion/production` |
| **Agent checkpointing** | `InMemoryCheckpointStore`, `SqliteCheckpointStore`, `createSqliteCheckpointStore` — `fluxion/production`. **Wired into runner** — pass `checkpointStore` + `runId` to `createAgent` to auto-resume interrupted runs. |
| **Idempotency** | `InMemoryIdempotencyStore`, `createSqliteIdempotencyStore` — `fluxion/production`. **Wired into HTTP service** — `X-Idempotency-Key` header deduplicates retried requests. |
| **Audit log** | `InMemoryAuditStore`, `createSqliteAuditStore` — `fluxion/production`. **Wired into HTTP service** — pass `auditStore` to persist all requests to SQLite/custom store. |
| **Human-in-the-Loop (HITL)** | `waitForApproval`, `InMemoryApprovalStore`, `createSqliteApprovalStore`, `ApprovalRejectedError` — `fluxion/production` |
| **Multi-tenancy** | `createTenantContext`, `TenantScopedSessionStore` — `fluxion/production` |

## Background Queues

| Capability | Where |
|------------|--------|
| In-memory (dev/test) | `InMemoryBackgroundQueue` — `fluxion/background` |
| BullMQ (Redis, durable) | `BullMQBackgroundQueue` — `fluxion/background` (`bun add bullmq`) |
| Kafka | `KafkaBackgroundQueue` — `fluxion/background` (`bun add kafkajs`) |
| RabbitMQ | `RabbitMQBackgroundQueue` — `fluxion/background` (`bun add amqplib`) |
| AWS SQS | `SQSBackgroundQueue` — `fluxion/background` (`bun add @aws-sdk/client-sqs`) |
| Redis Pub/Sub | `RedisPubSubBackgroundQueue` — `fluxion/background` (`bun add ioredis`) |
| Hook wrapper | `queueHook` — `fluxion/background` |

## Voice

| Capability | Where |
|------------|--------|
| OpenAI TTS (tts-1, tts-1-hd) + Whisper STT | `OpenAIVoiceProvider` — `fluxion/voice` |
| ElevenLabs premium voices + voice cloning | `ElevenLabsVoiceProvider` — `fluxion/voice` (`bun add elevenlabs`) |
| Auto-select from env | `createVoiceProvider()` — `fluxion/voice` |

## Extension Contracts

All pluggable interfaces, dependency-free, in one place — no circular imports.

| Capability | Where |
|------------|--------|
| Every pluggable interface | `fluxion/contracts/extensions` |

## Artifacts & media

| Capability | Where |
|------------|--------|
| Versioned structured outputs | `InMemoryArtifactStorage`, `createTextArtifact`, `createMarkdownArtifact`, … — `fluxion/artifacts` |
| Media helpers | `fluxion/artifacts` + `media` export |

## HTTP service

| Capability | Where |
|------------|--------|
| Health, chat JSON + SSE, sessions, OpenAPI | `createHttpService`, `listenService`, `getRuntimeOpenApiJson` — `fluxion/runtime` |
| Auth + body size limits | `auth` option (`api-key`, `bearer`, `basic`, `custom`), `maxBodyBytes` — `CreateHttpServiceOptions` |
| Approval endpoint | `POST /v1/approvals/:id` (auto-wired when `approvalStore` is passed) |
| **Idempotency** | `idempotency: { store, ttlMs }` in `CreateHttpServiceOptions` — `X-Idempotency-Key` header deduplication |
| **Persistent audit** | `auditStore` in `CreateHttpServiceOptions` — replaces 500-entry in-memory ring with durable store |
| **WebSocket transport** | `websocket: true` in `CreateHttpServiceOptions` — `ws://host/v1/ws` for real-time bidirectional streaming |
| **Admin API** | `adminApi: { enabled: true, bearerToken, auditStore, checkpointStore }` — `/admin/health`, `/admin/agents`, `/admin/audit`, `/admin/stats`, `/admin/checkpoints` |

## Config & environment

| Capability | Where |
|------------|--------|
| Load + validate env-based app config | `loadConfig`, `loadConfigWithDefaults`, `validateConfig` — `fluxion/config` |
| **Secret managers** | `createSecretManager({ provider: 'aws' \| 'azure' \| 'vault' \| 'gcp' \| 'env' })` — `fluxion/config`. Lazy SDK loading, zero peer deps required. |

## Evaluation

| Capability | Where |
|------------|--------|
| LLM judge (GPT-4o) | `runLlmAsJudge`, `createMultiCriteriaJudge`, `runEvalBatch` — `fluxion/observability` |
| Exact/partial/Levenshtein/ROUGE metrics | `ExactMatchAccuracy`, `LevenshteinAccuracy`, `rougeLWords`, `wordOverlapF1` — `fluxion/observability` |
| **Eval dataset persistence + regression detection** | `runEvalSuite({ suiteName, dataset, agent, store, regressionThreshold })`, `InMemoryEvalStore`, `createSqliteEvalStore` — `fluxion/observability`. CI-friendly: `process.exit(1)` when score drops. |

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
| Video / shorts pipeline (OpenAI + Pexels) | `VideoOrchestrator` — `fluxion` (lazy clients via env vars) |

## Testing

| Capability | Where |
|------------|--------|
| Mocks & fixtures | `MockLLMProvider`, `MockSessionStore` — `fluxion/testing` |

## LLM providers

| Capability | Where |
|------------|--------|
| OpenAI, Anthropic, Google, fallbacks, caching, cost | `fluxion/llm` |
| Amazon Bedrock Converse (optional SDK peer) | `BedrockConverseProvider` — `fluxion/llm` |
| Stream → text → Zod | `collectStreamText`, `collectStreamThenValidate` — `fluxion/llm` |
| Intelligent LLM routing | `createSmartRouter` (**adaptive** score), `LLMRouter` (`strategy: 'adaptive' \| 'balanced' \| …`), `scoreTaskTypesForRouting` |
| `provider:model` resolution | `resolveLlmForCreateAgent`, `resolveModelString` |
| Context limits | `MODEL_CONTEXT_LIMITS`, `getContextLimitForModel`, `resolveModelKeyForContextLimit` |
| Vision / multimodal parts | `multiModal`, `imageUrl`, … — `fluxion/llm` (`vision.js`) |

## Runnable examples in this repo

| Script | What it shows |
|--------|----------------|
| `bun run example:simple` | Minimal `createAgent` + `fluxion/create-agent` import |
| `bun run example:showcase` | Sessions, tools, guardrails, metrics, health, SDK workflow, pipeline, OpenAPI, optional `--http` |
| `bun run example:potential` | Extra modules: chunking, circuit breaker, rate limiter, artifacts, profiles, eval metrics, `loadConfig` (works best with `examples/.env`) |

## Practical “use everything that matters to you”

1. **Ship an API** — `createAgent` + `createHttpService` + health + `getRuntimeOpenApiJson`.  
2. **Ship RAG** — `KnowledgeEngine` + embeddings + vector store; wire context into your agent or tools.  
3. **Ship multi-step products** — `createWorkflow` or `createPipeline` + `asOrchestratorAgent`.  
4. **Ship safely at scale** — guardrails, rate limiter, circuit breaker, session store on Redis/Postgres, OTLP.  
5. **Ship learning** — `userProfileStore` + `memoryStore` / `ragEngine` on `createAgent` (where your version wires them), or custom tools.

The framework is **modular**: import only the subpaths you need (`package.json` → `exports`).
