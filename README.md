<div align="center">
  <img src="docs/public/logo.svg" alt="Confused-AI logo" width="96" />
  <h1>Confused-AI</h1>
  <p><strong>TypeScript AI Agent Framework — Build Production-Grade LLM Agents in Minutes</strong></p>
  <p>
    ReAct-loop agents · 50+ built-in tools · Multi-agent orchestration · RAG · MCP · Circuit breakers · Budget caps · HITL · OTLP tracing
  </p>

  [![CI](https://github.com/rvuyyuru2/agent-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/rvuyyuru2/agent-framework/actions/workflows/ci.yml)
  [![CodeQL](https://github.com/rvuyyuru2/agent-framework/actions/workflows/codeql.yml/badge.svg)](https://github.com/rvuyyuru2/agent-framework/actions/workflows/codeql.yml)
  [![npm version](https://img.shields.io/npm/v/confused-ai?color=8b5cf6&logo=npm&label=Confused-AI)](https://www.npmjs.com/package/confused-ai)
  [![npm downloads](https://img.shields.io/npm/dm/confused-ai?color=22d3ee&logo=npm)](https://www.npmjs.com/package/confused-ai)
  [![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](./LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Docs](https://img.shields.io/badge/docs-vitepress-8b5cf6?logo=vitepress)](https://rvuyyuru2.github.io/agent-framework/)
  [![GitHub Stars](https://img.shields.io/github/stars/rvuyyuru2/agent-framework?style=social)](https://github.com/rvuyyuru2/agent-framework)
  [![GitHub Issues](https://img.shields.io/github/issues/rvuyyuru2/agent-framework?color=f97316)](https://github.com/rvuyyuru2/agent-framework/issues)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/rvuyyuru2/agent-framework/blob/main/CONTRIBUTING.md)

  <p>
    <a href="https://rvuyyuru2.github.io/agent-framework/"><strong>Documentation</strong></a> ·
    <a href="https://rvuyyuru2.github.io/agent-framework/guide/getting-started">Getting Started</a> ·
    <a href="https://rvuyyuru2.github.io/agent-framework/examples/">18 Examples</a> ·
    <a href="https://www.npmjs.com/package/confused-ai">npm</a> ·
    <a href="./CHANGELOG.md">Changelog</a>
  </p>
</div>

---

> **Confused-AI** is a TypeScript-first AI agent framework designed for production. It gives you a complete stack — LLM providers, 50+ tools, multi-agent orchestration, RAG, session memory, guardrails, circuit breakers, budget enforcement, OTLP tracing, and an HTTP runtime — so you never have to stitch libraries together again.

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
- [50+ Built-in Tools](#50-built-in-tools)
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

| Capability | **confused-ai** | LangChain.js | Vercel AI SDK | Mastra |
|---|:---:|:---:|:---:|:---:|
| Zero-config quickstart | ✅ | ⚠️ | ✅ | ⚠️ |
| 50+ built-in tools | ✅ | ✅ | ❌ | ⚠️ |
| Multi-agent orchestration | ✅ | ✅ | ❌ | ✅ |
| Circuit breakers | ✅ | ❌ | ❌ | ❌ |
| USD budget enforcement | ✅ | ❌ | ❌ | ❌ |
| Human-in-the-Loop (HITL) | ✅ | ⚠️ | ❌ | ⚠️ |
| MCP client + server | ✅ | ✅ | ✅ | ✅ |
| OTLP distributed tracing | ✅ | ⚠️ | ❌ | ⚠️ |
| Multi-tenancy | ✅ | ❌ | ❌ | ❌ |
| Audit log (SOC 2 / HIPAA) | ✅ | ❌ | ❌ | ❌ |
| Idempotency keys | ✅ | ❌ | ❌ | ❌ |
| Intelligent LLM router | ✅ | ❌ | ❌ | ❌ |
| DAG graph engine + durable execution | ✅ | ⚠️ | ❌ | ❌ |
| Voice TTS + STT | ✅ | ⚠️ | ❌ | ❌ |
| TypeScript-first | ✅ | ✅ | ✅ | ✅ |

---

## Creating Agents

### Option A: `createAgent` (recommended)

```ts
import { createAgent } from 'confused-ai';
import { CalculatorAddTool, HttpClientTool } from 'confused-ai/tools';

const agent = createAgent({
  name:         'Assistant',
  instructions: 'You are a helpful assistant.',
  model:        'openai:gpt-4o-mini',
  tools:        [new CalculatorAddTool(), new HttpClientTool()],
});

const { text, steps, finishReason } = await agent.run('What is 40 + 2?');
```

### Option B: DX fluent builder

```ts
import { defineAgent } from 'confused-ai';

const agent = defineAgent()
  .name('Assistant')
  .instructions('You are concise and accurate.')
  .model('openai:gpt-4o-mini')
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
| `ragEngine` | `RAGEngine` for automatic retrieval-augmented generation |
| `maxSteps`, `timeoutMs` | Loop limits |
| `retry` | Retry policy for LLM / tool calls |
| `logger` | `ConsoleLogger` or custom |
| `dev` | `true` → dev logger + tool middleware |

---

## Tools (50+)

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

Every tool is Zod-validated, tree-shakeable, and dependency-lazy. Build custom tools with `defineTool()`:

```ts
import { defineTool } from 'confused-ai';
import { z } from 'zod';

const lookupOrder = defineTool()
  .name('lookupOrder')
  .description('Look up an order by ID')
  .parameters(z.object({ orderId: z.string() }))
  .execute(async ({ orderId }) => db.orders.findById(orderId))
  .build();
```

---

## Multi-Agent Orchestration

```ts
import { agent, compose, createSupervisor } from 'confused-ai';
import { AgentRouter } from 'confused-ai/orchestration';

// Sequential pipeline — output of researcher feeds writer
const pipeline = compose(
  agent('Research and return key facts.'),
  agent('Turn facts into polished reports.'),
);
const { text } = await pipeline.run('TypeScript 5.5 features');

// Supervisor with sub-agents
const supervisor = createSupervisor({
  agents:       [researchAgent, writeAgent, reviewAgent],
  instructions: 'Coordinate the team to produce a final deliverable.',
});

// Capability-based routing
const router = new AgentRouter({ strategy: 'capability' });
router.register(codeAgent,      ['code', 'debug']);
router.register(analyticsAgent, ['data', 'analysis']);
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

const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  vectorStore:       new InMemoryVectorStore(),
});

await knowledge.ingest([
  ...await new TextLoader('./docs/policy.md').load(),
  ...await new URLLoader('https://example.com/faq').load(),
]);

const agent = createAgent({
  instructions: 'Answer questions using the knowledge base.',
  ragEngine:    knowledge,
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

const resilient = withResilience(agent, {
  circuitBreaker: { threshold: 5, timeout: 30_000 },
  rateLimit:      { maxRequests: 100, windowMs: 60_000 },
  retry:          { maxAttempts: 3, backoff: 'exponential' },
});
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
import { requireApprovalTool, InMemoryApprovalStore } from 'confused-ai/tools';
import { createHttpService } from 'confused-ai/runtime';

const service = createHttpService({
  agents: { admin: adminAgent },
  approvalStore: new InMemoryApprovalStore(),
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
import { createHttpService, listenService } from 'confused-ai/runtime';

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
import { OTLPTraceExporter } from 'confused-ai/observability';

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
import { loadMcpToolsFromUrl } from 'confused-ai/tools';

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
| `confused-ai` | Main barrel |
| `confused-ai/create-agent` | Lean createAgent + env resolver |
| `confused-ai/llm` | Providers, model resolution, embeddings |
| `confused-ai/tools` | BaseTool, registries, 50+ built-in tools |
| `confused-ai/orchestration` | Pipelines, supervisor, swarm, router, consensus |
| `confused-ai/knowledge` | RAG engine, loaders, vector store |
| `confused-ai/session` | Session stores (in-memory, SQL, SQLite) |
| `confused-ai/memory` | Memory stores + vector-backed long-term memory |
| `confused-ai/guardrails` | Validators, rules, content safety |
| `confused-ai/production` | Circuit breaker, rate limiter, health checks |
| `confused-ai/observability` | OTLP tracer, metrics, eval store, structured logger |
| `confused-ai/runtime` | HTTP service, OpenAPI, WebSocket, admin API |
| `confused-ai/adapters` | 20-category adapter system |
| `confused-ai/plugins` | Plugin registry + built-in plugins |
| `confused-ai/graph` | DAGEngine, DurableExecutor, GraphBuilder, event stores, distributed workers |
| `confused-ai/testing` | MockLLMProvider, MockToolRegistry, fixtures, graph test runner |
| `confused-ai/contracts` | Shared interfaces — zero runtime code |

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
import { MockLLMProvider } from 'confused-ai/testing';

const mockLLM = new MockLLMProvider([{ text: 'The answer is 42', tool_calls: [] }]);
const agent = createAgenticAgent({ name: 'Test', llm: mockLLM, tools: new MockToolRegistry() });
const { text } = await agent.run({ prompt: 'What is the answer?' });
expect(text).toBe('The answer is 42');
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

232 passing tests covering circuit breakers, rate limiters, JWT RBAC, LLM caching, guardrails, graph execution, and more. See [`/tests`](./tests/).

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
```

---

## Enterprise Checklist

- [x] **Security** — Guardrails, JWT RBAC, secret-manager adapters (AWS, Azure Key Vault, HashiCorp Vault, GCP), Zod-validated tool inputs
- [x] **Reliability** — Circuit breakers, retry with backoff, Redis distributed rate limiting, graceful shutdown, checkpoint/resume
- [x] **Compliance** — Persistent audit log, idempotency keys, per-user USD budget caps, W3C trace-context
- [x] **Observability** — OTLP tracing, structured logging, eval store, health endpoints, Grafana dashboard template
- [x] **Deployment** — Docker, Compose, Kubernetes, Fly.io, Render templates with health probes
- [x] **Testing** — MockLLMProvider, MockToolRegistry, Vitest-compatible fixtures, 99 passing tests

---

## Contributing

```bash
git clone https://github.com/rvuyyuru2/agent-framework
cd agent-framework && bun install
bun test          # 99 tests
bun run build     # tsup
bun run docs:dev  # VitePress docs site
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Telemetry

**Off by default.** Set `CONFUSED_AI_TELEMETRY=1` to send a minimal framework startup event. No prompts, no PII ever.

---

## License

[MIT](./LICENSE) — Copyright © 2024-present confused-ai contributors
