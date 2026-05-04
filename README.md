<div align="center">
  <img src="docs/public/logo.svg" alt="Confused-AI logo" width="96" />
  <h1>Confused-AI</h1>
  <p><strong>TypeScript AI Agent Framework — Build Production-Grade LLM Agents in Minutes</strong></p>
  <p>
    ReAct-loop agents · 100+ built-in tools · Multi-agent orchestration · RAG · MCP · Circuit breakers · Budget caps · HITL · OTLP tracing
  </p>

  [![CI](https://github.com/confused-ai/confused-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/confused-ai/confused-ai/actions/workflows/ci.yml)
  [![CodeQL](https://github.com/confused-ai/confused-ai/actions/workflows/codeql.yml/badge.svg)](https://github.com/confused-ai/confused-ai/actions/workflows/codeql.yml)
  [![npm version](https://img.shields.io/npm/v/confused-ai?color=8b5cf6&logo=npm&label=Confused-AI)](https://www.npmjs.com/package/confused-ai)
  [![npm downloads](https://img.shields.io/npm/dm/confused-ai?color=22d3ee&logo=npm)](https://www.npmjs.com/package/confused-ai)
  [![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](./LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Docs](https://img.shields.io/badge/docs-vitepress-8b5cf6?logo=vitepress)](https://confused-ai.github.io/confused-ai/)
  [![GitHub Stars](https://img.shields.io/github/stars/confused-ai/confused-ai?style=social)](https://github.com/confused-ai/confused-ai)
  [![GitHub Issues](https://img.shields.io/github/issues/confused-ai/confused-ai?color=f97316)](https://github.com/confused-ai/confused-ai/issues)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/confused-ai/confused-ai/blob/main/CONTRIBUTING.md)

  <p>
    <a href="https://confused-ai.github.io/confused-ai/"><strong>Documentation</strong></a> ·
    <a href="https://confused-ai.github.io/confused-ai/guide/getting-started">Getting Started</a> ·
    <a href="https://confused-ai.github.io/confused-ai/examples/">18 Examples</a> ·
    <a href="https://www.npmjs.com/package/confused-ai">npm</a> ·
    <a href="./CHANGELOG.md">Changelog</a>
  </p>
</div>

---

> **Confused-AI** is a TypeScript-first AI agent framework designed for production. It gives you a complete stack — LLM providers, 100+ tools, multi-agent orchestration, RAG, session memory, guardrails, circuit breakers, budget enforcement, OTLP tracing, and an HTTP runtime — so you never have to stitch libraries together again.

---

## Install

```bash
npm install confused-ai        # npm
bun add confused-ai            # bun
pnpm add confused-ai           # pnpm
yarn add confused-ai           # yarn
```

> **Node.js ≥ 18 required.** Set at least one LLM provider key — that's the only required config.

```bash
# .env
OPENAI_API_KEY=sk-...           # OpenAI GPT-4o, GPT-4o-mini, o1, o3-mini
ANTHROPIC_API_KEY=sk-ant-...    # Anthropic Claude 3.5 Sonnet / Haiku
GOOGLE_API_KEY=...              # Google Gemini 1.5 Pro / Flash
OPENROUTER_API_KEY=sk-or-...    # OpenRouter — 100+ models in one key
```

---

## Quickstart — AI Agent in 3 Lines

```ts
import { agent } from 'confused-ai';

const ai = agent('You are a helpful assistant.');
const { text } = await ai.run('Summarise the key points of the React 19 release.');
console.log(text);
```

No config files. No wiring. No boilerplate. Add tools, sessions, RAG, guardrails, and observability only when you need them.

---

## Table of Contents

- [Install](#install)
- [Quickstart](#quickstart--ai-agent-in-3-lines)
- [What You Can Build](#what-you-can-build)
- [Why confused-ai](#why-confused-ai--feature-comparison)
- [Creating Agents](#creating-agents)
- [100+ Built-in Tools](#50-built-in-tools)
- [Custom Tools](#custom-tools)
- [Multi-Agent Orchestration](#multi-agent-orchestration)
- [Intelligent LLM Router](#intelligent-llm-router)
- [RAG — Retrieval-Augmented Generation](#rag--retrieval-augmented-generation)
- [Session Memory & Chat History](#session-memory--chat-history)
- [Guardrails & Content Safety](#guardrails--content-safety)
- [Production Hardening](#production-hardening)
  - [Circuit Breakers & Rate Limiting](#circuit-breakers--rate-limiting)
  - [Budget Enforcement (USD Caps)](#budget-enforcement-usd-caps)
  - [Human-in-the-Loop (HITL)](#human-in-the-loop-hitl)
  - [Multi-Tenancy](#multi-tenancy)
  - [Audit Log & Idempotency](#audit-log--idempotency)
- [HTTP Runtime & REST API](#http-runtime--rest-api)
- [Observability — OTLP, Tracing & Metrics](#observability--otlp-tracing--metrics)
- [MCP — Model Context Protocol](#mcp--model-context-protocol)
- [Voice — TTS & STT](#voice--tts--stt)
- [Deployment](#deployment)
- [All Subpath Packages](#all-subpath-packages)
- [Supported LLM Providers](#supported-llm-providers)
- [Testing Utilities](#testing-utilities)
- [CLI](#cli)
- [Enterprise Checklist](#enterprise-checklist)
- [Contributing](#contributing)
- [License](#license)

---

## What You Can Build

confused-ai covers the entire spectrum of LLM-powered applications:

| Use Case | What you use |
|----------|-------------|
| **AI chatbot with memory** | `createAgent` + `SessionStore` + `createHttpService` |
| **Customer support bot** | + `KnowledgeEngine` (RAG) + `GuardrailValidator` |
| **Code review / coding agent** | + `ShellTool`, `FileReadTool`, `GitHubTool` |
| **Data analysis pipeline** | + `PostgreSQLTool`, `CSVTool`, `defineTool` |
| **Multi-agent research team** | `compose()` / `createSupervisor()` / `createSwarm()` |
| **AI-powered REST API** | `createHttpService` + OpenAPI + SSE streaming |
| **Cost-controlled LLM gateway** | `LLMRouter` + `budget` caps + `RateLimiter` |
| **Voice assistant** | `createVoiceProvider` (OpenAI / ElevenLabs TTS + STT) |
| **MCP-connected agent** | `loadMcpToolsFromUrl` + any MCP server |
| **Multi-tenant SaaS AI feature** | `createTenantContext` + per-tenant rate limits & budgets |

---

## Why confused-ai — Feature Comparison

Most AI agent frameworks stop at the prototype. confused-ai ships production infrastructure out of the box:

| Enterprise Capability | **Confused-AI** | LangChain.js | Vercel AI SDK | Mastra |
|-----------------------|:---:|:---:|:---:|:---:|
| **Zero-Config Progressive DX** | ✅ | ⚠️ | ✅ | ⚠️ |
| **First-Class TypeScript** | ✅ | ⚠️ | ✅ | ✅ |
| **100+ Built-In Tools** | ✅ | ✅ | ❌ | ⚠️ |
| **Multi-Agent Orchestration** | ✅ | ✅ | ❌ | ✅ |
| **Durable DAG Graph Engine** | ✅ | ⚠️ *(LangGraph)* | ❌ | ❌ |
| **Native MCP Support** | ✅ | ⚠️ | ❌ | ✅ |
| **OTLP Distributed Tracing** | ✅ | ⚠️ *(LangSmith)* | ⚠️ | ⚠️ |
| **Circuit Breakers & Retries** | ✅ | ❌ | ❌ | ❌ |
| **USD Budget Enforcement** | ✅ | ❌ | ❌ | ❌ |
| **Multi-Tenancy Context** | ✅ | ❌ | ❌ | ❌ |
| **Persistent Audit Logging** | ✅ | ❌ | ❌ | ❌ |
| **Idempotency Keys** | ✅ | ❌ | ❌ | ❌ |
| **Human-in-the-Loop (HITL)** | ✅ | ⚠️ | ❌ | ⚠️ |
| **Intelligent LLM Router** | ✅ | ❌ | ❌ | ❌ |
| **Automatic REST API** | ✅ | ❌ | ❌ | ⚠️ |
| **Background Job Queues** | ✅ | ❌ | ❌ | ❌ |
| **Voice (TTS/STT) & Video** | ✅ | ⚠️ | ❌ | ❌ |

> **Note on audit logging:** Persistent audit logging provides an event trail suitable as one input to a compliance programme. It does not constitute SOC2 or HIPAA certification on its own. Achieving those certifications requires infrastructure controls, access policies, and third-party audits beyond what any logging library provides.

---

## Creating Agents

### Option A: `createAgent` (recommended)

```ts
import { createAgent } from 'confused-ai';
import { openai } from 'confused-ai/model';
import { CalculatorAddTool, HttpClientTool } from 'confused-ai/tools';

const agent = createAgent({
  name:         'Assistant',
  instructions: 'You are a helpful assistant.',
  model:        openai('gpt-4o-mini'),
  tools:        [new CalculatorAddTool(), new HttpClientTool()],
});

const { text, steps, finishReason } = await agent.run('What is 40 + 2?');
```

### Option B: DX fluent builder

```ts
import { defineAgent } from 'confused-ai';
import { anthropic } from 'confused-ai/model';

const agent = defineAgent()
  .name('Assistant')
  .instructions('You are concise and accurate.')
  .model(anthropic('claude-3-5-sonnet-20241022'))
  .tools([new CalculatorAddTool()])
  .withSession()
  .build();
```

### Option C: Typed agents with Zod I/O

```ts
import { defineTypedAgent, createWorkflow } from 'confused-ai';
import { z } from 'zod';

const planner = defineTypedAgent({
  name:         'plan',
  inputSchema:  z.object({ goal: z.string() }),
  outputSchema: z.object({ bullets: z.array(z.string()) }),
  handler:      async (i) => ({ bullets: [i.goal, 'execute', 'verify'] }),
});

const { results } = await createWorkflow().task('plan', planner).execute({ goal: 'Ship v1' });
```

### `createAgent` options

| Option | Description |
|--------|-------------|
| `name`, `instructions` | **Required.** Agent identity and system behavior |
| `model` | `openai:gpt-4o`, `anthropic:claude-3-5-sonnet-20241022`, `google:gemini-1.5-pro`, … |
| `llm` | Custom `LLMProvider` (overrides `model`) |
| `tools` | `Tool[]` or `ToolRegistry` |
| `sessionStore` | In-memory default; plug in SQLite/Redis/Postgres for production |
| `guardrails` | `true` (sensitive-data rule), `false`, or a `GuardrailEngine` |
| `budget` | `{ maxUsdPerRun?, maxUsdPerUser? }` — hard USD caps |
| `knowledgebase` | `RAGEngine` for automatic retrieval-augmented generation |
| `maxSteps`, `timeoutMs` | Loop limits |
| `retry` | Retry policy for LLM / tool calls |
| `logger` | `ConsoleLogger` or custom |
| `dev` | `true` → dev logger + tool middleware |

---

## Tools (100+)

```ts
import {
  HttpClientTool, BrowserTool,           // Web
  EmailTool, SlackTool, DiscordTool,     // Communication
  PostgreSQLTool, MySQLTool, SQLiteTool, // Databases
  RedisTool, CSVTool,                    // Data
  DuckDuckGoTool, WikipediaTool,         // Search
  FileReadTool, FileWriteTool, ShellTool, // File system
  StripeTool, YahooFinanceTool,          // Finance
  GitHubTool, CalculatorAddTool,         // Dev / Utilities
} from 'confused-ai/tools';
```

Every tool is Zod-validated, tree-shakeable, and dependency-lazy. Build custom tools with `defineTool()` or `tool()`:

```ts
import { tool } from 'confused-ai/tool';
import { z } from 'zod';

const lookupOrder = tool({
  name: 'lookupOrder',
  description: 'Look up an order by ID',
  parameters: z.object({ orderId: z.string() }),
  execute: async ({ orderId }) => db.orders.findById(orderId)
});
```

---

## Multi-Agent Orchestration

```ts
import { agent, compose } from 'confused-ai';
import { MultiAgentOrchestrator } from 'confused-ai/workflow';

// Sequential pipeline — output of researcher feeds writer
const pipeline = compose(
  agent('Research and return key facts.'),
  agent('Turn facts into polished reports.'),
);
const { text } = await pipeline.run('TypeScript 5.5 features');

// Orchestrator with sub-agents
const orchestrator = new MultiAgentOrchestrator()
  .addAgent({ name: 'Researcher', instructions: 'Find info' })
  .addAgent({ name: 'Writer', instructions: 'Draft report' });

const result = await orchestrator.runConsensus({
  agents: ['Researcher', 'Writer'],
  task: 'Coordinate to produce a final deliverable.',
  strategy: 'best'
});
```

---

## LLM Router

```ts
import { createCostOptimizedRouter } from 'confused-ai';

const router = createCostOptimizedRouter({
  providers: { fast: gpt4oMini, smart: gpt4o },
});

// Task type auto-detected: simple → fast, coding → smart
const { text } = await router.run('Explain async/await in JavaScript');
```

Four built-in strategies: `balanced`, `cost`, `quality`, `speed`. Custom override rules supported.

---

## RAG & Knowledge

```ts
import { KnowledgeEngine, TextLoader, URLLoader, OpenAIEmbeddingProvider, InMemoryVectorStore } from 'confused-ai/knowledge';

// ⚠️ InMemoryVectorStore — for development and testing only. Data is lost on restart.
const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  vectorStore:       new InMemoryVectorStore(), // swap for PgVectorStore in production
});

// Production: persistent vector store (PostgreSQL + pgvector)
// import { PgVectorStore } from 'confused-ai/knowledge';
// const knowledge = new KnowledgeEngine({
//   embeddingProvider: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
//   vectorStore: new PgVectorStore({ connectionString: process.env.DATABASE_URL! }),
// });

await knowledge.ingest([
  ...await new TextLoader('./docs/policy.md').load(),
  ...await new URLLoader('https://example.com/faq').load(),
]);

const agent = createAgent({
  instructions: 'Answer questions using the knowledge base.',
  knowledgebase: knowledge,
});
```

---

## Sessions & Memory

```ts
import { createSqliteSessionStore } from 'confused-ai/session';

const agent = createAgent({
  instructions: 'You are a helpful assistant.',
  sessionStore: createSqliteSessionStore('./sessions.db'),
});

const sessionId = await agent.createSession('user-123');
const r1 = await agent.run('My name is Alice.', { sessionId });
const r2 = await agent.run('What is my name?', { sessionId }); // → "Alice"
```

---

## Guardrails

```ts
import { GuardrailValidator, createSensitiveDataRule } from 'confused-ai/guardrails';
import { createAgent } from 'confused-ai';

const agent = createAgent({
  instructions: 'You are a support agent.',
  guardrails:   new GuardrailValidator({ rules: [createSensitiveDataRule()] }),
});
```

---

## Graph Engine — Durable DAG Execution

Build complex multi-agent workflows as a directed acyclic graph (DAG). Nodes run in topological order, independent nodes run in parallel, and every event is persisted to an event store for deterministic replay and crash recovery.

```ts
import { createGraph, DurableExecutor, SqliteEventStore, NodeKind } from 'confused-ai/graph';

const graph = createGraph('research-pipeline')
  .addNode({ id: 'search',    kind: NodeKind.TASK, execute: async (ctx) => ({ results: await search(ctx.state.query as string) }) })
  .addNode({ id: 'summarise', kind: NodeKind.TASK, execute: async (ctx) => ({ summary: await summarise((ctx.state['search'] as { results: string[] }).results) }) })
  .chain('search', 'summarise')
  .build();

const store    = SqliteEventStore.create('./runs.db');
const executor = new DurableExecutor(graph, store);

const result = await executor.run({ variables: { query: 'latest AI research' } });

// If the process crashes and restarts, resume where it left off:
const resumed = await executor.resume(result.executionId);
```

Includes: `computeWaves()` for wave-based scheduling, `BackpressureController` for concurrency limiting, `DistributedEngine` + `GraphWorker` for multi-process execution, and a full OTEL telemetry plugin.

---

## Production Hardening

### Circuit Breakers & Rate Limits

```ts
import { withResilience } from 'confused-ai/production';
import { RedisRateLimiter } from '@confused-ai/adapter-redis';

const resilient = withResilience(agent, {
  circuitBreaker: { threshold: 5, timeout: 30_000 },
  rateLimit:      { maxRequests: 100, windowMs: 60_000 },
  retry:          { maxAttempts: 3, backoff: 'exponential' },
});

// Multi-instance deployments: use RedisRateLimiter to enforce limits across all replicas
// const redisLimiter = new RedisRateLimiter({ client: redisClient, maxRequests: 100, windowMs: 60_000 });
// ⚠️  Default RateLimiter is in-process only — two replicas means double the effective limit.
```

### Budget Enforcement

```ts
const agent = createAgent({
  instructions: 'You are a helpful assistant.',
  budget: {
    maxUsdPerRun:  0.10,   // $0.10 per run hard cap
    maxUsdPerUser: 5.00,   // $5.00 per user per month
  },
});
// Throws BudgetExceededError before limit is crossed
```

### Human-in-the-Loop (HITL)

```ts
import { requireApprovalTool, SqliteApprovalStore } from 'confused-ai/production';
import { createHttpService } from 'confused-ai/runtime';

// SqliteApprovalStore — durable, survives process restarts
// ⚠️  InMemoryApprovalStore is available for tests only — approvals are lost on restart.
const service = createHttpService({
  agents:        { admin: adminAgent },
  approvalStore: new SqliteApprovalStore('./approvals.db'),
  // GET  /v1/approvals        — list pending
  // POST /v1/approvals/:id    — { approved: true, decidedBy: 'admin' }
});
```

### Multi-Tenancy

```ts
import { createTenantContext } from 'confused-ai';

const ctx = createTenantContext({ tenantId: 'acme-corp', ... });
await agent.run(prompt, { context: ctx });
```

### Audit Log & Idempotency

```ts
import { createHttpService } from 'confused-ai/runtime';
import { SqliteAuditStore } from 'confused-ai/observability';

const service = createHttpService({
  agents:     { support: supportAgent },
  auditStore: new SqliteAuditStore('./audit.db'),
  // X-Idempotency-Key header → deduplicates retries automatically
});
```

---

## HTTP Runtime

```ts
import { createAgent } from 'confused-ai';
import { createAgentRouter, createHttpService, listenService } from 'confused-ai/serve';

const service = createHttpService({
  agents:   { support: supportAgent },
  cors:     '*',
  openApi:  { title: 'My Agent API', version: '1.0.0' },
  adminApi: true,
  websocket: true,
});

listenService(service, { port: 3000 });
```

Routes: `GET /v1/health` · `GET /v1/agents` · `POST /v1/sessions` · `POST /v1/chat` (JSON + SSE stream) · `GET /v1/openapi.json` · `GET /v1/approvals` · `POST /v1/approvals/:id` · `/admin/*`

---

## Observability & Tracing

```ts
import { OTLPTraceExporter, OTLPMetricsExporter } from 'confused-ai/observe';
import { createHttpService } from 'confused-ai/serve';

const service = createHttpService({
  agents:  { support: supportAgent },
  tracer:  new OTLPTraceExporter({ endpoint: 'http://jaeger:4318/v1/traces' }),
  metrics: new OTLPMetricsExporter({ endpoint: 'http://prometheus:4318/v1/metrics' }),
});
// W3C traceparent propagated across all agent-to-agent HTTP calls automatically
// Grafana dashboard: /templates/grafana-dashboard.json
```

---

## MCP Client & Server

```ts
import { loadMcpToolsFromUrl } from 'confused-ai/tool';
import { createAgent } from 'confused-ai';

const mcpTools = await loadMcpToolsFromUrl('http://mcp-server:3001');
const agent = createAgent({ tools: mcpTools, instructions: 'Use MCP filesystem tools.' });
```

---

## Voice (TTS & STT)

```ts
import { createVoiceProvider, OpenAIVoiceAdapter } from 'confused-ai/voice';

const voice = createVoiceProvider(new OpenAIVoiceAdapter({ apiKey: process.env.OPENAI_API_KEY! }));
const audio = await voice.textToSpeech('Hello, how can I help you?');
const text  = await voice.speechToText(audio);
```

---

## Deployment

Production-ready templates in [`/templates`](./templates/):

```bash
# Docker
docker build -t my-agent . && docker run -e OPENAI_API_KEY=$KEY -p 3000:3000 my-agent

# Fly.io
fly launch && fly secrets set OPENAI_API_KEY=sk-... && fly deploy

# Kubernetes
kubectl apply -f templates/k8s.yaml
```

Includes: `Dockerfile`, `docker-compose.yml`, `fly.toml`, `render.yaml`, `k8s.yaml` with health probes, resource limits, and rolling updates.

---

## Subpath Packages

| Import | Contents |
|--------|---------|
| `confused-ai` | Main barrel (`agent`, `createAgent`) |
| `confused-ai/model` | Provider classes + factory shorthands (`openai()`, `anthropic()`, `ollama()`) |
| `confused-ai/tool` | `tool()`, `defineTool()`, MCP client/server |
| `confused-ai/workflow` | Pipelines, graph engine, multi-agent orchestrator |
| `confused-ai/guard` | Circuit breakers, rate limits, budgets, HITL |
| `confused-ai/serve` | HTTP runtime, OpenAPI, WebSocket |
| `confused-ai/observe` | OTLP tracing, metrics, structured logger |
| `confused-ai/test` | Mocking utilities (`mockAgent()`, `scenario()`) |
| `confused-ai/graph` | Advanced graph builder, durable execution, event stores |
| `confused-ai/adapters` | 20-category adapter registry |
| `confused-ai/contracts` | Dependency-free shared interfaces |

*(Legacy paths like `confused-ai/tools`, `confused-ai/production`, `confused-ai/runtime` are preserved for backward compatibility).*

---

## LLM Providers

| Provider | Environment variable |
|----------|---------------------|
| OpenAI (GPT-4o, o1, …) | `OPENAI_API_KEY` |
| Anthropic Claude | `ANTHROPIC_API_KEY` |
| Google Gemini | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| OpenRouter (100+ models) | `OPENROUTER_API_KEY` |
| Azure OpenAI | `OPENAI_API_KEY` + `OPENAI_BASE_URL` |
| AWS Bedrock | `@aws-sdk/client-bedrock-runtime` peer dep |
| Any OpenAI-compatible | Pass `apiKey` + `baseURL` to `createAgent` |

---

## Testing

```ts
import { mockAgent, scenario } from 'confused-ai/test';

const agent = mockAgent({ responses: ['The answer is 42'] });

await scenario(agent)
  .send('What is the answer?')
  .expectText('42')
  .run();
```

### Graph testing utilities

```ts
import { createTestRunner, createMockLLMProvider, expectEventSequence } from 'confused-ai/testing';
import { GraphEventType } from 'confused-ai/graph';

const runner = createTestRunner();
const result = await runner.run(myGraph);

// assert event sequence (allows gaps)
expectEventSequence(result.eventTypes, [
  GraphEventType.EXECUTION_STARTED,
  GraphEventType.EXECUTION_COMPLETED,
]);
```

515 passing tests covering circuit breakers, rate limiters, JWT RBAC, LLM caching, guardrails, graph execution, and more. See [`/packages`](./packages/).

> Test count is verified on every CI run across Node 18, 20, and 22.

---

## CLI

```bash
npx confused-ai --help   # after npm install or npm run build
```

### Graph run debugging

After executing a graph with `DurableExecutor` (backed by `SqliteEventStore`), use the built-in CLI to inspect, replay, export, and diff past runs:

```bash
# Replay event timeline for a run
confused-ai replay --run-id <executionId> --db ./graph-events.db

# Per-node summary (status, retries, duration, errors)
confused-ai inspect --run-id <executionId>

# Export all events to JSON
confused-ai export --run-id <executionId> --out events.json --pretty

# Compare two runs — exits 1 if any nodes diverged (CI-friendly)
confused-ai diff --run-id-a <baseline> --run-id-b <new>

# Validate env vars, API keys, and config before deploy
confused-ai doctor
```

> `confused-ai doctor` checks Node.js version, all LLM provider API keys, optional packages, and network connectivity. Use it in CI pre-deploy checks.

---

## Enterprise Checklist

- [x] **Security** — Guardrails, JWT RBAC, secret-manager adapters (AWS, Azure Key Vault, HashiCorp Vault, GCP), Zod-validated tool inputs
- [x] **Reliability** — Circuit breakers, retry with backoff, Redis distributed rate limiting, graceful shutdown, checkpoint/resume
- [x] **Compliance** — Persistent audit log, idempotency keys, per-user USD budget caps, W3C trace-context
- [x] **Observability** — OTLP tracing, structured logging, eval store, health endpoints, Grafana dashboard template
- [x] **Deployment** — Docker, Compose, Kubernetes, Fly.io, Render templates with health probes
- [x] **Testing** — MockLLMProvider, MockToolRegistry, Vitest-compatible fixtures, 515 passing tests

---

## Contributing

```bash
git clone https://github.com/confused-ai/confused-ai.git
cd confused-ai && bun install
bun test          # 515 tests — run with Node 18, 20, and 22 in CI
bun run build     # tsup
bun run docs:dev  # VitePress docs site
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Telemetry

**Off by default.** Set `CONFUSED_AI_TELEMETRY=1` to send a minimal framework startup event. No prompts, no PII ever.

---

## License

[MIT](./LICENSE) — Copyright © 2024-present Raja Shekar Reddy Vuyyuru
