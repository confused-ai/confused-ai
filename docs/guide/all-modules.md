---
title: All Modules
description: Complete reference for all 40 @confused-ai/* packages — what each one does and when to use it.
outline: [2, 3]
---

# All Modules

confused-ai is a monorepo of 40 focused packages. The root `confused-ai` bundle includes all of them. You can also install individual packages for smaller footprints.

## Package map

```bash
npm install confused-ai          # everything
# or install à la carte:
npm install @confused-ai/core @confused-ai/models @confused-ai/tools
```

---

## Foundation

### `@confused-ai/contracts`
Core TypeScript interfaces and types shared across the framework. Never import adapters or providers.

- `LLMProvider`, `Message`, `GenerateResult`, `StreamChunk`
- `Agent`, `AgentRunOptions`, `AgentRunResult`
- `Tool`, `ToolResult`, `EntityId`
- `tenantScopedKey()` — safe multi-tenant key construction

### `@confused-ai/shared`
Internal utilities shared across packages. Not intended for direct use.

---

## Runtime

### `@confused-ai/core`
The agent runner base. Manages the ReAct loop, tool dispatch, session loading, and hooks.

```ts
import { createAgent } from '@confused-ai/core';
```

### `@confused-ai/agentic`
The production ReAct runner with HITL, guardrails, budget enforcement, and checkpoint support.

```ts
import { createAgenticAgent, AgenticRunner } from '@confused-ai/agentic';
```

### `@confused-ai/execution`
Execution primitives — concurrency control, backpressure, task queues.

### `@confused-ai/graph`
DAG execution engine for complex multi-node workflows. Durable execution, event store, wave scheduling.

```ts
import { createGraph, DAGEngine, DurableExecutor, computeWaves } from '@confused-ai/graph';
```
→ [Graph guide](/guide/graph)

### `@confused-ai/orchestration`
Multi-agent coordination: team, pipeline, swarm, supervisor, router, consensus, A2A protocol.

```ts
import { AgentTeam, AgentPipeline, AgentSwarm, createTeam, defineRole } from '@confused-ai/orchestration';
```
→ [Orchestration guide](/guide/orchestration)

### `@confused-ai/workflow`
Workflow branching helpers: `branch`, `loopUntil`, `forEach`, `race`, `retry`.

```ts
import { branch, loopUntil, forEach, race } from '@confused-ai/workflow';
```

### `@confused-ai/planner`
Classical AI planner — breaks high-level goals into ordered task lists.

```ts
import { ClassicalPlanner, PlanValidator } from '@confused-ai/planner';
```

### `@confused-ai/reasoning`
Chain-of-Thought and Tree-of-Thought reasoning engines.

```ts
import { ReasoningManager, TreeOfThoughtEngine } from '@confused-ai/reasoning';
```
→ [Reasoning guide](/guide/reasoning)

### `@confused-ai/scheduler`
Cron-based job scheduler for periodic agent runs.

```ts
import { ScheduleManager, validateCronExpr } from '@confused-ai/scheduler';
```
→ [Scheduler guide](/guide/scheduler)

### `@confused-ai/background`
Decouple long-running hooks from the agent loop. Swap to BullMQ, Kafka, RabbitMQ, SQS, Redis.

```ts
import { queueHook, InMemoryBackgroundQueue, BullMQBackgroundQueue } from '@confused-ai/background';
```

---

## Providers

### `@confused-ai/models`
LLM provider adapters for 40+ models.

```ts
import { OpenAIProvider, AnthropicProvider, GoogleProvider, ollama, bedrock } from '@confused-ai/models';
import { createOpenAICompatibleProvider, createOpenRouterProvider } from '@confused-ai/models';
```
→ [Providers guide](/guide/providers)

### `@confused-ai/router`
Cost-optimised LLM router — routes to cheapest model meeting capability threshold.

```ts
import { createCostRouter, DEFAULT_COSTS } from '@confused-ai/router';
```
→ [LLM Router guide](/guide/llm-router)

---

## State

### `@confused-ai/memory`
Short-term and long-term agent memory. Vector stores for semantic search.

```ts
import { InMemoryStore, VectorMemoryStore, OpenAIEmbeddingProvider } from '@confused-ai/memory';
import { PineconeVectorStore, QdrantVectorStore, PgVectorStore } from '@confused-ai/memory';
import { createAgentMemoryTools, createSummaryBufferHook, MemoryDistiller } from '@confused-ai/memory';
```
→ [Memory guide](/guide/memory)

### `@confused-ai/knowledge`
RAG engine — document loaders, vector adapters, semantic retrieval.

```ts
import { KnowledgeEngine, createKnowledgeEngine, withEmbeddingCache } from '@confused-ai/knowledge';
import { loadPdf, loadCsv, loadUrl } from '@confused-ai/knowledge';
import { Neo4jKnowledgeAdapter, ChromaKnowledgeAdapter, PgvectorKnowledgeAdapter } from '@confused-ai/knowledge';
```
→ [RAG guide](/guide/rag)

### `@confused-ai/session`
Session persistence — in-memory, SQLite, Redis, Postgres.

```ts
import { InMemorySessionStore, createSqliteSessionStore, createRedisSessionStore } from '@confused-ai/session';
```
→ [Session guide](/guide/session)

### `@confused-ai/storage`
Key-value + file storage for agent state. In-memory, SQLite, S3-compatible.

```ts
import { createStorage, createKVStore, createFileStore } from '@confused-ai/storage';
```
→ [Storage guide](/guide/storage)

### `@confused-ai/artifacts`
Typed agent output artifacts — markdown, code, data, plans, reasoning traces.

```ts
import { createMarkdownArtifact, createCodeArtifact, createReasoningArtifact, createPlanArtifact } from '@confused-ai/artifacts';
```
→ [Artifacts guide](/guide/artifacts)

### `@confused-ai/learning`
Learning stores that improve from past interactions — Postgres and in-memory.

```ts
import { createPostgresLearningStore, createInMemoryLearningStore } from '@confused-ai/learning';
```

### `@confused-ai/db`
Built-in SQLite/Postgres database for the framework's internal state.

### `@confused-ai/adapter-redis`
Redis adapter for session, memory, and rate limiting.

---

## Platform

### `@confused-ai/guardrails`
Safety layer — PII detection, prompt injection defense, content rules, HITL hooks.

```ts
import { GuardrailValidator, createPiiDetectionRule, createPromptInjectionRule } from '@confused-ai/guardrails';
```
→ [Guardrails guide](/guide/guardrails)

### `@confused-ai/production`
Circuit breakers, rate limiting, health checks, graceful shutdown, checkpointing.

```ts
import { CircuitBreaker, RateLimiter, HealthCheckManager, createGracefulShutdown } from '@confused-ai/production';
```
→ [Production guide](/guide/production)

### `@confused-ai/guard`
`withResilience()` wrapper — circuit breaker + rate limit + retry in one call.

```ts
import { withResilience, retry, timeout } from '@confused-ai/guard';
```

### `@confused-ai/observe`
OTLP tracing, Prometheus metrics, structured logger, span tracking.

```ts
import { OtelTracer, PrometheusMetrics, ConsoleLogger } from '@confused-ai/observe';
```
→ [Observability guide](/guide/observability)

### `@confused-ai/eval`
Evaluation framework — LLM-as-judge, ROUGE, regression runner, dataset loader.

```ts
import { LLMJudge, runBenchmark, RegressionRunner, loadDataset } from '@confused-ai/eval';
```
→ [Eval guide](/guide/eval)

### `@confused-ai/compression`
Token budget management — Huffman codec, context budget tracking, message compression.

```ts
import { HuffmanCodec, CompressionManager, contextBudget } from '@confused-ai/compression';
```
→ [Compression guide](/guide/compression)

### `@confused-ai/config`
Environment variable loading, validation, and secret manager adapters (AWS, Azure, GCP, Vault).

```ts
import { createSecretManager, EnvSecretManagerAdapter, AwsSecretsManagerAdapter } from '@confused-ai/config';
```

### `@confused-ai/context`
Context provider / backend pattern for injecting runtime context into agent runs.

```ts
import { ContextProvider, ContextBackend } from '@confused-ai/context';
```

### `@confused-ai/serve`
HTTP server for agents — REST API, SSE streaming, OpenAPI 3.1, HITL approval endpoints, Prometheus metrics.

```ts
import { createServer } from '@confused-ai/serve';
```

---

## Tools Layer

### `@confused-ai/tools`
100+ built-in tools — search, browser, HTTP, communication, productivity, devtools, data, MCP, AI.

```ts
import { tavilySearch, httpClient, slackTool, githubTool, databaseTool } from '@confused-ai/tools';
import { createMCPClient, createMCPServer } from '@confused-ai/tools';
```
→ [Tools guide](/guide/tools)

### `@confused-ai/plugins`
Plugin registry for cross-cutting concerns (hooks, middleware) attached to agents.

```ts
import { PluginRegistry, createPlugin } from '@confused-ai/plugins';
```

---

## Developer

### `@confused-ai/sdk`
High-level SDK — `defineAgent()` fluent builder, `createWorkflow()`, orchestration adapters.

```ts
import { defineAgent, createWorkflow } from '@confused-ai/sdk';
```

### `@confused-ai/skills`
Built-in agent skill packs — web research, PDF summariser, code reviewer.

```ts
import { webResearchSkill, pdfSummarizerSkill, codeReviewerSkill } from '@confused-ai/skills';
```

### `@confused-ai/cli`
CLI tool (`confused-ai` command) — graph replay, inspect, export, diff.

```bash
npx confused-ai replay --run-id <id>
npx confused-ai inspect --run-id <id>
```

### `@confused-ai/playground`
Browser-based chat UI for testing agents locally.

```ts
import { createPlayground } from '@confused-ai/playground';
await createPlayground([{ name: 'assistant', run: (p) => ai.run(p) }], { port: 4000 });
```

### `@confused-ai/test-utils`
Testing utilities — `MockLLMProvider`, `MockAgent`, `createTestRunner`, `expectEventSequence`.

```ts
import { MockLLMProvider, createTestRunner } from '@confused-ai/test-utils';
```

---

## Extensions

### `@confused-ai/voice`
Voice agents — TTS (text-to-speech) and STT (speech-to-text) integration.

```ts
import { createVoiceAgent } from '@confused-ai/voice';
```
→ [Voice guide](/guide/voice)

### `@confused-ai/video`
Video generation integration — Fal, Replicate, RunwayML.

```ts
import { createVideoAgent } from '@confused-ai/video';
```
→ [Video guide](/guide/video)
