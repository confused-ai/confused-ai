---
layout: home

hero:
  name: "confused-ai"
  text: "Build AI agents in TypeScript"
  tagline: "40+ LLM providers. 100+ tools. Multi-agent teams. Circuit breakers. HITL. RAG. All production-ready, zero magic."
  actions:
    - theme: brand
      text: Get Started →
      link: /guide/getting-started
    - theme: alt
      text: All 40 Modules
      link: /guide/all-modules
    - theme: alt
      text: GitHub
      link: https://github.com/confused-ai/confused-ai

features:
  - icon: ⚡
    title: 3 lines to a working agent
    details: Auto-detects your LLM provider from env vars. In-memory session and tools included. Override anything.
    link: /guide/getting-started
    linkText: Quick start

  - icon: 🏗️
    title: 40+ LLM providers
    details: OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, Ollama, vLLM, Bedrock, 30+ more — auto-detected from env.
    link: /guide/providers
    linkText: All providers

  - icon: 🔧
    title: 100+ built-in tools
    details: Search, browser, Slack, GitHub, PostgreSQL, Redis, Stripe, Gmail, Jira, Notion, and more — all Zod-validated.
    link: /guide/tools
    linkText: Browse tools

  - icon: 🔀
    title: Multi-agent orchestration
    details: Teams, pipelines, swarms, supervisors, routers, consensus — any topology in a few lines of code.
    link: /guide/orchestration
    linkText: Orchestration

  - icon: 🛡️
    title: Guardrails & safety
    details: PII detection, prompt injection defense, content moderation, tool allowlists, HITL approval flows.
    link: /guide/guardrails
    linkText: Guardrails

  - icon: 📊
    title: Production observability
    details: OTLP tracing, Prometheus metrics, structured logging, circuit breakers, health checks, graceful shutdown.
    link: /guide/production
    linkText: Production

  - icon: 🧠
    title: RAG & knowledge bases
    details: PDF, CSV, URL loaders. Pinecone, Qdrant, pgvector, ChromaDB, Neo4j adapters. Semantic retrieval built in.
    link: /guide/rag
    linkText: Knowledge base

  - icon: 🔁
    title: DAG graph engine
    details: Build complex agent workflows as directed acyclic graphs. Durable execution, event replay, backpressure.
    link: /guide/graph
    linkText: Graph engine

  - icon: 💰
    title: Budget enforcement
    details: Hard-stop agents at a cost or token budget per run or per user. No surprise bills.
    link: /guide/production
    linkText: Budget control

  - icon: 📏
    title: Evaluation
    details: LLM-as-judge, ROUGE, word overlap, regression CI, dataset loading, fine-tuning export.
    link: /guide/eval
    linkText: Eval framework

  - icon: 🗓️
    title: Cron scheduler
    details: Run agents on a schedule. Cron expressions, timezone support, persistent store, trigger on demand.
    link: /guide/scheduler
    linkText: Scheduler

  - icon: 🎙️
    title: Voice & Video
    details: TTS, STT, and video generation integrations. Fal, ElevenLabs, Replicate, RunwayML.
    link: /guide/voice
    linkText: Voice & Video
---

<div class="vp-doc" style="max-width:900px;margin:3rem auto;padding:0 1.5rem">

## Get started in 60 seconds

::: code-group
```bash [npm]
npm install confused-ai
```
```bash [bun]
bun add confused-ai
```
```bash [pnpm]
pnpm add confused-ai
```
:::

```bash
# Set at least one provider key
echo "OPENAI_API_KEY=sk-..." >> .env
```

```ts
import { agent } from 'confused-ai';

const ai = agent({ model: 'gpt-4o' });
const result = await ai.run({ prompt: 'What is 2 + 2?' });
console.log(result.output); // "4"
```

## Build something real

```ts
import { agent, tool } from 'confused-ai';
import { tavilySearch, githubTool } from 'confused-ai/tools';
import { createSqliteSessionStore } from 'confused-ai/session';
import { GuardrailValidator, createPiiDetectionRule } from 'confused-ai/guardrails';
import { withResilience } from 'confused-ai/guard';
import { serve } from 'confused-ai';
import { z } from 'zod';

// 1. Build an agent with tools, session, and guardrails
const base = agent({
  model: 'gpt-4o',
  systemPrompt: 'You are a helpful developer assistant.',
  tools: [tavilySearch, githubTool],
  sessionStore: createSqliteSessionStore('./sessions.db'),
  guardrails: new GuardrailValidator({
    rules: [createPiiDetectionRule({ redact: true })],
  }),
  budget: { maxCostUsd: 0.10 },
});

// 2. Add production resilience
const ai = withResilience(base, {
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
  rateLimit: { maxRpm: 60 },
  retry: { maxRetries: 3, backoffMs: 1_000 },
});

// 3. Serve as HTTP API
await serve(ai, { port: 3000 });
// POST /v1/run   → { prompt, sessionId? }
// POST /v1/stream → SSE
// GET  /v1/health
```

## 40-package ecosystem

| Category | Packages |
|---|---|
| **Runtime** | `core`, `agentic`, `graph`, `orchestration`, `workflow`, `planner`, `reasoning`, `scheduler`, `background`, `execution` |
| **Providers** | `models` (40+ LLMs), `router` (cost-optimised routing) |
| **State** | `memory`, `knowledge`, `session`, `storage`, `artifacts`, `learning`, `db` |
| **Platform** | `guardrails`, `production`, `guard`, `observe`, `eval`, `compression`, `config`, `context`, `serve` |
| **Tools** | `tools` (100+), `plugins` |
| **Developer** | `sdk`, `skills`, `cli`, `playground`, `test-utils` |
| **Extensions** | `voice`, `video` |

[→ Full module reference](/guide/all-modules)

</div>
