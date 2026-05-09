# confused-ai

> TypeScript framework for building production-grade AI agents.  
> 40+ LLM providers · 100+ built-in tools · Multi-agent orchestration · Circuit breakers · RAG · HITL · Budget enforcement

[![npm](https://img.shields.io/npm/v/confused-ai?label=npm&color=6366f1)](https://www.npmjs.com/package/confused-ai)
[![Version](https://img.shields.io/badge/version-2.1.0-6366f1)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

---

## Install

```bash
npm install confused-ai        # npm
bun add confused-ai            # bun
pnpm add confused-ai           # pnpm
```

Set at least one provider key:

```bash
OPENAI_API_KEY=sk-...
# or ANTHROPIC_API_KEY / GOOGLE_API_KEY / GROQ_API_KEY / MISTRAL_API_KEY / …
```

---

## Quick start

```ts
import { agent } from 'confused-ai';

const ai = agent({ model: 'gpt-4o' });
const result = await ai.run({ prompt: 'What is 2 + 2?' });
console.log(result.output); // "4"
```

The model string auto-detects the provider from environment variables.

---

## Add tools

```ts
import { agent, tool } from 'confused-ai';
import { tavilySearch, httpClient, slackTool } from 'confused-ai/tools';
import { z } from 'zod';

// Custom tool
const getPrice = tool({
  id: 'get_price',
  description: 'Get the current price of a stock by ticker',
  parameters: z.object({ ticker: z.string() }),
  execute: async ({ ticker }) => fetch(`/api/price/${ticker}`).then(r => r.json()),
});

const ai = agent({
  model: 'gpt-4o',
  tools: [tavilySearch, httpClient, slackTool, getPrice],
});
```

---

## Session memory

```ts
import { createSqliteSessionStore } from 'confused-ai/session';

const ai = agent({
  model: 'gpt-4o',
  sessionStore: createSqliteSessionStore('./sessions.db'),
});

await ai.run({ prompt: 'My name is Alice', sessionId: 'alice' });
const r = await ai.run({ prompt: 'What is my name?', sessionId: 'alice' });
// → "Your name is Alice."
```

---

## RAG / Knowledge base

```ts
import { KnowledgeEngine, loadPdf, loadUrl } from 'confused-ai/knowledge';
import { OpenAIEmbeddingProvider, InMemoryVectorStore } from 'confused-ai/memory';

const knowledge = new KnowledgeEngine({
  embedding: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  vectorStore: new InMemoryVectorStore(),
});

await knowledge.ingest(await loadPdf('./docs/manual.pdf'));
await knowledge.ingest(await loadUrl('https://docs.myapp.com'));

const ai = agent({
  model: 'gpt-4o',
  knowledgebase: knowledge,       // auto-retrieves relevant chunks
});
```

---

## Multi-agent teams

```ts
import { createTeam, defineRole } from 'confused-ai/orchestration';

const researcher = defineRole({ role: 'Researcher', goal: 'Find facts', llm: myProvider });
const writer     = defineRole({ role: 'Writer',     goal: 'Write clearly', llm: myProvider });
const reviewer   = defineRole({ role: 'Reviewer',   goal: 'Improve quality', llm: myProvider });

const team = createTeam({
  name: 'ContentTeam',
  mode: 'pipeline',    // sequential: researcher → writer → reviewer
  agents: [researcher, writer, reviewer],
});

const result = await team.run('Write a post about the future of TypeScript');
```

Other modes: `coordinate` (parallel), `route` (smart routing), `collaborate` (sequential).

---

## Production resilience

```ts
import { withResilience } from 'confused-ai/guard';

const ai = withResilience(baseAgent, {
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
  rateLimit:      { maxRpm: 60 },
  retry:          { maxRetries: 3, backoffMs: 1_000, exponential: true },
});
```

---

## Guardrails & safety

```ts
import { GuardrailValidator, createPiiDetectionRule, createPromptInjectionRule } from 'confused-ai/guardrails';

const guardrails = new GuardrailValidator({
  rules: [
    createPromptInjectionRule({ threshold: 0.7 }),
    createPiiDetectionRule({ redact: true }),          // replaces PII with [REDACTED]
  ],
});

const ai = agent({ model: 'gpt-4o', guardrails });
```

---

## Budget enforcement

```ts
const ai = agent({
  model: 'gpt-4o',
  budget: {
    maxCostUsd: 0.10,    // hard stop at $0.10 per run
    maxTokens: 50_000,   // or 50k tokens — whichever comes first
  },
});
```

---

## Observability

```ts
import { OtelTracer, PrometheusMetrics } from 'confused-ai/observe';
import { serve } from 'confused-ai';

await serve(ai, {
  port: 3000,
  tracer: new OtelTracer({ endpoint: 'http://tempo:4318/v1/traces' }),
  metrics: new PrometheusMetrics(),   // GET /metrics → Prometheus text
});
// Every run, tool call, and LLM request is traced automatically
```

---

## Streaming

```ts
for await (const chunk of ai.stream({ prompt: 'Write a blog post' })) {
  process.stdout.write(chunk);
}
```

---

## Serve as HTTP API

```ts
import { serve } from 'confused-ai';

await serve(ai, { port: 3000 });
// POST /v1/run          { prompt, sessionId?, userId? }
// POST /v1/stream       SSE
// GET  /v1/health
// GET  /v1/openapi.json
// GET  /v1/approvals    HITL pending list
// POST /v1/approvals/:id submit decision
```

---

## Graph / DAG engine

```ts
import { createGraph, DAGEngine, DurableExecutor, NodeKind } from 'confused-ai/graph';

const graph = createGraph({
  nodes: [
    { id: 'fetch',   kind: NodeKind.Agent, config: { agent: fetchAgent } },
    { id: 'analyse', kind: NodeKind.Agent, config: { agent: analyseAgent } },
    { id: 'report',  kind: NodeKind.Agent, config: { agent: reportAgent } },
  ],
  edges: [
    { from: 'fetch', to: 'analyse' },
    { from: 'analyse', to: 'report' },
  ],
});

// Durable — survives process crashes
const executor = new DurableExecutor(graph, eventStore);
const id = await executor.run({ input: 'Q3 analysis' });
// If crash: await executor.resume(id);
```

---

## LLM Router (cost-optimised)

```ts
import { createCostRouter } from 'confused-ai/router';

const router = createCostRouter({
  providers: new Map([
    ['gpt-4o',      openaiGPT4o],
    ['gpt-4o-mini', openaiMini],
    ['gemini-2.0-flash', gemini],
  ]),
  minCapability: 7,
  maxInputCostPerMillion: 1.00,
});
```

---

## Cron scheduler

```ts
import { ScheduleManager } from 'confused-ai/scheduler';

const scheduler = new ScheduleManager();

await scheduler.add({
  id: 'daily-report',
  cron: '0 9 * * 1-5',    // weekdays at 9am
  handler: async () => {
    const r = await reportAgent.run({ prompt: 'Generate daily report' });
    await emailTool.execute({ to: 'team@company.com', body: r.output });
  },
});

await scheduler.start();
```

---

## All supported LLM providers (40+)

OpenAI · Anthropic · Google Gemini · AWS Bedrock · Azure OpenAI · Groq · Mistral · DeepSeek · Cohere · Fireworks · Together AI · OpenRouter · Ollama · vLLM · LM Studio · Cerebras · SambaNova · Hyperbolic · AI21 Labs · Perplexity · Alibaba DashScope (Qwen) · Zhipu AI (GLM) · Moonshot (Kimi) · 01.AI (Yi) · Baichuan · MiniMax · Volcengine · HunYuan · StepFun · InternLM · Upstage (Solar) · Replicate · Lambda Labs · Novita AI · Cloudflare Workers AI · Writer (Palmyra) · Snowflake Cortex · Lepton AI · Featherless AI · LocalAI · KoboldCpp · Text-Generation-WebUI · Jan

---

## All 40 packages

| Package | What it does |
|---------|-------------|
| `@confused-ai/core` | Agent runner base, types |
| `@confused-ai/agentic` | ReAct loop, HITL, guardrails, budget |
| `@confused-ai/models` | 40+ LLM adapters |
| `@confused-ai/router` | Cost-optimised LLM routing |
| `@confused-ai/tools` | 100+ built-in tools |
| `@confused-ai/plugins` | Plugin registry |
| `@confused-ai/memory` | Short/long-term memory, vector stores |
| `@confused-ai/knowledge` | RAG engine, loaders, vector adapters |
| `@confused-ai/session` | Session persistence |
| `@confused-ai/storage` | KV + file storage |
| `@confused-ai/artifacts` | Typed output artifacts |
| `@confused-ai/learning` | Learning from past interactions |
| `@confused-ai/db` | Internal SQLite/Postgres store |
| `@confused-ai/adapter-redis` | Redis adapter |
| `@confused-ai/guardrails` | PII, injection, moderation |
| `@confused-ai/production` | Circuit breaker, rate limit, health |
| `@confused-ai/guard` | `withResilience()` wrapper |
| `@confused-ai/observe` | OTLP tracing, Prometheus, logger |
| `@confused-ai/eval` | Evaluation, benchmarking, regression |
| `@confused-ai/compression` | Token budget, Huffman codec |
| `@confused-ai/config` | Env vars, secret managers |
| `@confused-ai/context` | Context provider/backend |
| `@confused-ai/serve` | HTTP server, SSE, OpenAPI |
| `@confused-ai/graph` | DAG engine, durable execution |
| `@confused-ai/orchestration` | Teams, pipelines, swarms, A2A |
| `@confused-ai/workflow` | Branching helpers |
| `@confused-ai/planner` | Classical AI planner |
| `@confused-ai/reasoning` | CoT, Tree-of-Thought |
| `@confused-ai/scheduler` | Cron scheduler |
| `@confused-ai/background` | Background queues (BullMQ, Kafka…) |
| `@confused-ai/execution` | Concurrency, backpressure |
| `@confused-ai/sdk` | High-level SDK, `defineAgent`, workflows |
| `@confused-ai/skills` | Built-in skill packs |
| `@confused-ai/cli` | CLI: replay, inspect, export |
| `@confused-ai/playground` | Browser chat UI |
| `@confused-ai/test-utils` | MockLLMProvider, test runners |
| `@confused-ai/voice` | TTS/STT voice agents |
| `@confused-ai/video` | Video generation |
| `@confused-ai/contracts` | Shared interfaces |
| `@confused-ai/shared` | Internal utilities |

---

## Documentation

**[confused-ai.github.io/confused-ai](https://confused-ai.github.io/confused-ai)**

- [Getting Started](https://confused-ai.github.io/confused-ai/guide/getting-started)
- [Core Concepts](https://confused-ai.github.io/confused-ai/guide/concepts)
- [All Modules](https://confused-ai.github.io/confused-ai/guide/all-modules)
- [Providers (40+)](https://confused-ai.github.io/confused-ai/guide/providers)
- [Tools (100+)](https://confused-ai.github.io/confused-ai/guide/tools)
- [Multi-Agent](https://confused-ai.github.io/confused-ai/guide/orchestration)
- [RAG / Knowledge](https://confused-ai.github.io/confused-ai/guide/rag)
- [Production](https://confused-ai.github.io/confused-ai/guide/production)
- [Guardrails](https://confused-ai.github.io/confused-ai/guide/guardrails)
- [Observability](https://confused-ai.github.io/confused-ai/guide/observability)
- [Evaluation](https://confused-ai.github.io/confused-ai/guide/eval)
- [Examples](https://confused-ai.github.io/confused-ai/examples/)

---

## License

MIT © Raja Shekar Reddy Vuyyuru
