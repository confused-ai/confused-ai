---
layout: home

hero:
  name: "confused-ai"
  text: "Production AI Agents,\nShipped in TypeScript"
  tagline: "The only TypeScript AI agent framework with smart defaults AND full control. 50+ tools, multi-agent orchestration, circuit breakers, budget caps, HITL, OTLP — from prototype to enterprise in one package."
  image:
    src: /logo.svg
    alt: confused-ai
  actions:
    - theme: brand
      text: Get Started →
      link: /guide/getting-started
    - theme: alt
      text: View Examples
      link: /examples/
    - theme: alt
      text: GitHub
      link: https://github.com/rvuyyuru2/agent-framework

features:
  - icon: ⚡
    title: Zero to agent in 3 lines
    details: "<code>agent('You are helpful.')</code> → <code>.run(prompt)</code> → <code>result.text</code>. Smart defaults for LLM, session, tools, and guardrails. Override anything, keep everything else."
    link: /guide/getting-started
    linkText: Quick start
  - icon: 🔧
    title: 50+ built-in tools
    details: "HTTP, browser, email, Slack, Discord, GitHub, PostgreSQL, MySQL, SQLite, Redis, Stripe, CSV, DuckDuckGo, Wikipedia, file system, and more — every tool Zod-validated and tree-shakeable."
    link: /guide/tools
    linkText: Browse tools
  - icon: 🔀
    title: Multi-agent orchestration
    details: "<code>compose()</code>, <code>pipe()</code>, AgentRouter, HandoffProtocol, ConsensusProtocol, <code>createSupervisor()</code>, <code>createSwarm()</code>. Any topology, any strategy — no framework lock-in."
    link: /guide/orchestration
    linkText: Explore orchestration
  - icon: 🧠
    title: RAG in one call
    details: "KnowledgeEngine + TextLoader / JSONLoader / CSVLoader / URLLoader + OpenAI embeddings + InMemoryVectorStore. Full semantic retrieval baked into every agent run."
    link: /guide/rag
    linkText: RAG guide
  - icon: 🚀
    title: Enterprise production-hardened
    details: "Circuit breakers, rate limiting, Redis distributed rate limits, USD budget caps, OTLP distributed tracing, W3C trace-context, health checks, graceful shutdown — all opt-in, all composable."
    link: /guide/production
    linkText: Production guide
  - icon: 🤖
    title: Intelligent LLM router
    details: "Auto-route by task type and complexity. coding → GPT-4o, simple Q&A → GPT-4o-mini. Four built-in strategies (balanced, cost, quality, speed), custom override rules, full decision history."
    link: /examples/16-llm-router
    linkText: See LLM routing
  - icon: 🔒
    title: Human-in-the-Loop (HITL)
    details: "Pause execution at high-risk tool calls. <code>requireApprovalTool()</code> + ApprovalStore + built-in HTTP endpoints. Approve or reject from any UI — no custom wiring needed."
    link: /guide/hitl
    linkText: HITL guide
  - icon: 🔌
    title: MCP client + server
    details: "Connect to any Model Context Protocol server. MCP tools become first-class citizens of the agent loop. Or expose your own tools as an MCP server with one function call."
    link: /guide/mcp
    linkText: MCP guide
  - icon: 🏛️
    title: Multi-tenancy out of the box
    details: "<code>createTenantContext()</code> scopes sessions, rate limits, and cost tracking per tenant without separate databases or extra config. Zero boilerplate isolation."
    link: /guide/multi-tenancy
    linkText: Multi-tenancy guide
  - icon: 🪝
    title: 8 lifecycle hook points
    details: "beforeRun, afterRun, beforeStep, afterStep, beforeToolCall, afterToolCall, buildSystemPrompt, onError. Inject logging, analytics, transformations at any point without modifying agent internals."
    link: /guide/hooks
    linkText: Hooks guide
  - icon: 📋
    title: Audit log + Idempotency
    details: "SOC 2 / HIPAA-grade audit trail for every run. X-Idempotency-Key deduplication prevents duplicate charges and side effects on client retries."
    link: /guide/observability
    linkText: Observability guide
  - icon: 🎙️
    title: Voice (TTS & STT)
    details: "OpenAI and ElevenLabs voice providers out of the box. Wire text-to-speech and speech-to-text into any agent pipeline with <code>createVoiceProvider()</code>."
    link: /guide/voice
    linkText: Voice guide
---

<div class="home-content">

## Install

```bash
npm install confused-ai
# or
bun add confused-ai
# or
pnpm add confused-ai
```

Set at least one provider key in your environment:

```bash
OPENAI_API_KEY=sk-...          # OpenAI / Azure OpenAI
ANTHROPIC_API_KEY=sk-ant-...   # Anthropic Claude
GOOGLE_API_KEY=...             # Google Gemini
OPENROUTER_API_KEY=sk-or-...   # OpenRouter (100+ models)
```

## From zero to production

::: code-group

```ts [Hello World]
import { agent } from 'confused-ai';

const ai = agent('You are a helpful assistant.');
const { text } = await ai.run('What is 2 + 2?');
console.log(text); // "4"
```

```ts [Custom Tool]
import { agent, defineTool } from 'confused-ai';
import { z } from 'zod';

const getWeather = defineTool()
  .name('getWeather')
  .description('Get current weather for a city')
  .parameters(z.object({ city: z.string() }))
  .execute(async ({ city }) => ({ city, temp: 22, condition: 'sunny' }))
  .build();

const ai = agent({ instructions: 'Help with weather.', tools: [getWeather] });
const { text } = await ai.run('What is the weather in Paris?');
```

```ts [Multi-Agent Pipeline]
import { agent, compose } from 'confused-ai';

const researcher = agent('Research topics thoroughly and return key findings.');
const writer     = agent('Turn research notes into polished reports.');

const pipeline = compose(researcher, writer);
const { text } = await pipeline.run('Report on TypeScript 5.5 features');
```

```ts [LLM Router]
import { createCostOptimizedRouter } from 'confused-ai';

// Automatically sends coding tasks to GPT-4o, simple Q&A to GPT-4o-mini
const router = createCostOptimizedRouter({
  providers: { fast: gpt4oMini, smart: gpt4o },
});
const { text } = await router.run('What is 2+2?'); // → routed to fast model
```

```ts [Production Agent]
import { createAgent } from 'confused-ai';
import { createSqliteSessionStore } from 'confused-ai/session';
import { withResilience } from 'confused-ai/production';

const agent = createAgent({
  name:         'SupportBot',
  instructions: 'You are a helpful support agent.',
  model:        'openai:gpt-4o-mini',
  sessionStore: createSqliteSessionStore('./sessions.db'),
  budget:       { maxUsdPerRun: 0.05, maxUsdPerUser: 5.0 },
  guardrails:   true,
});

const resilient = withResilience(agent, {
  circuitBreaker: { threshold: 5, timeout: 30_000 },
  rateLimit:      { maxRequests: 100, windowMs: 60_000 },
  retry:          { maxAttempts: 3, backoff: 'exponential' },
});

export default resilient;
```

:::

## What production looks like

```ts
import { createAgent, defineTool } from 'confused-ai';
import { createSqliteSessionStore } from 'confused-ai/session';
import { KnowledgeEngine, TextLoader, OpenAIEmbeddingProvider, InMemoryVectorStore } from 'confused-ai/knowledge';
import { GuardrailValidator, createSensitiveDataRule } from 'confused-ai/guardrails';
import { createHttpService, listenService } from 'confused-ai/runtime';
import { z } from 'zod';

// 1. Knowledge base from your docs
const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  vectorStore: new InMemoryVectorStore(),
});
await knowledge.ingest(await new TextLoader('./docs/policy.md').load());

// 2. Sessions, guardrails, and a custom tool
const sessions  = createSqliteSessionStore('./data/sessions.db');
const guardrails = new GuardrailValidator({ rules: [createSensitiveDataRule()] });

const lookupOrder = defineTool()
  .name('lookupOrder')
  .description('Look up an order by ID')
  .parameters(z.object({ orderId: z.string() }))
  .execute(async ({ orderId }) => db.orders.findById(orderId))
  .build();

// 3. One agent — everything wired up
const support = createAgent({
  name:         'SupportBot',
  instructions: 'You are a helpful support agent. Use the knowledge base for policies.',
  model:        'openai:gpt-4o-mini',
  tools:        [lookupOrder],
  sessionStore: sessions,
  ragEngine:    knowledge,
  guardrails,
  budget:       { maxUsdPerRun: 0.10 },
  hooks: {
    afterRun: async (result) => {
      await analytics.track('support_run', { steps: result.steps });
      return result;
    },
  },
});

// 4. Serve over HTTP with OpenAPI, SSE streaming, and HITL approval endpoints
const service = createHttpService({
  agents: { support },
  openApi: { title: 'SupportBot API', version: '1.0.0' },
});

listenService(service, { port: 3000 });
// → GET  /v1/openapi.json
// → POST /v1/agents/support/run
// → GET  /v1/approvals        (pending HITL requests)
// → POST /v1/approvals/:id    (approve/reject)
```

## Why confused-ai?

<div class="comparison-table">

| Capability | confused-ai | LangChain.js | Vercel AI SDK | Mastra |
|------------|:-----------:|:------------:|:-------------:|:------:|
| Zero-config start | ✅ | ⚠️ | ✅ | ⚠️ |
| 50+ built-in tools | ✅ | ✅ | ❌ | ⚠️ |
| Multi-agent orchestration | ✅ | ✅ | ❌ | ✅ |
| Circuit breakers | ✅ | ❌ | ❌ | ❌ |
| Budget enforcement (USD caps) | ✅ | ❌ | ❌ | ❌ |
| Human-in-the-Loop (HITL) | ✅ | ⚠️ | ❌ | ⚠️ |
| MCP client + server | ✅ | ✅ | ✅ | ✅ |
| OTLP distributed tracing | ✅ | ⚠️ | ❌ | ⚠️ |
| Multi-tenancy | ✅ | ❌ | ❌ | ❌ |
| Audit log (SOC2/HIPAA) | ✅ | ❌ | ❌ | ❌ |
| Idempotency keys | ✅ | ❌ | ❌ | ❌ |
| LLM router (by task type) | ✅ | ❌ | ❌ | ❌ |
| Voice (TTS + STT) | ✅ | ⚠️ | ❌ | ❌ |
| TypeScript-first | ✅ | ✅ | ✅ | ✅ |
| MIT license | ✅ | ✅ | ✅ | ✅ |

</div>

## Enterprise checklist

Everything you need to go from prototype to production without switching frameworks:

- **Security** — Guardrails engine with sensitive-data rules, JWT RBAC on HTTP routes, secret-manager adapters (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault, GCP), content safety hooks
- **Reliability** — Circuit breakers, exponential-backoff retry, Redis distributed rate limiting, graceful shutdown, checkpoint/resume for long-running agents
- **Compliance** — Persistent audit log (SQLite / pluggable), X-Idempotency-Key deduplication, per-user and per-tenant cost caps, W3C trace-context propagation
- **Observability** — OTLP tracing (Jaeger, Datadog, Honeycomb), structured logging, eval store, health endpoints, Grafana dashboard template
- **Deployment** — Docker, docker-compose, Kubernetes, Fly.io, and Render templates in [`/templates`](https://github.com/rvuyyuru2/agent-framework/tree/main/templates)
- **Testing** — `MockLLMProvider`, `MockToolRegistry`, fixture helpers, Vitest-compatible test utilities in `confused-ai/testing`

## Subpath packages

Import only what you need — every module is independently tree-shakeable:

| Import path | Contents |
|-------------|---------|
| `confused-ai` | Main barrel: `createAgent`, `agent`, tools, session, LLM, orchestration |
| `confused-ai/create-agent` | Lean `createAgent` + env helpers |
| `confused-ai/llm` | Providers, model resolution, embeddings |
| `confused-ai/tools` | `BaseTool`, registries, 50+ built-in tools |
| `confused-ai/orchestration` | Pipelines, supervisor, swarm, team, router |
| `confused-ai/knowledge` | RAG engine, loaders, vector store |
| `confused-ai/session` | Session stores (in-memory, SQL, SQLite) |
| `confused-ai/memory` | Memory stores + vector-backed memory |
| `confused-ai/guardrails` | Validators, rules, content safety |
| `confused-ai/production` | Circuit breaker, rate limiter, resilience wrappers |
| `confused-ai/observability` | OTLP tracer, logger, metrics, eval store |
| `confused-ai/runtime` | HTTP service, OpenAPI, WebSocket, HITL endpoints |
| `confused-ai/adapters` | 20-category adapter system (SQL, Redis, S3, …) |
| `confused-ai/plugins` | Plugin registry + built-in logging/rate-limit/telemetry |
| `confused-ai/testing` | Mock LLM, mock tools, test fixtures |
| `confused-ai/contracts` | Shared interfaces (no runtime code) |

## Supported LLM providers

| Provider | Import / env var |
|----------|-----------------|
| OpenAI (GPT-4o, GPT-4o-mini, o1, …) | `OPENAI_API_KEY` |
| Anthropic Claude (3.5 Sonnet, Haiku, Opus) | `ANTHROPIC_API_KEY` |
| Google Gemini (1.5 Pro, Flash) | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| OpenRouter (100+ models) | `OPENROUTER_API_KEY` |
| Azure OpenAI | `OPENAI_API_KEY` + `OPENAI_BASE_URL` |
| AWS Bedrock | `@aws-sdk/client-bedrock-runtime` peer dep |
| Any OpenAI-compatible API | `apiKey` + `baseURL` in `createAgent` options |

## Deployment

One-command deploys with the included templates:

::: code-group

```bash [Docker]
# Build and run
docker build -t myagent .
docker run -e OPENAI_API_KEY=$OPENAI_API_KEY -p 3000:3000 myagent
```

```bash [Fly.io]
fly launch --copy-config --name myagent
fly secrets set OPENAI_API_KEY=sk-...
fly deploy
```

```bash [Render]
# render.yaml included — just connect your GitHub repo in the Render dashboard
```

```bash [Kubernetes]
kubectl apply -f templates/k8s.yaml
kubectl set env deployment/agent OPENAI_API_KEY=sk-...
```

:::

Templates are in [`/templates`](https://github.com/rvuyyuru2/agent-framework/tree/main/templates) — includes Dockerfile, docker-compose.yml, fly.toml, render.yaml, and k8s.yaml with resource limits, health checks, and rolling update config.

</div>

<style>
.home-content {
  max-width: 960px;
  margin: 0 auto;
  padding: 48px 24px;
}

.home-content h2 {
  font-size: 1.75rem;
  font-weight: 700;
  margin-top: 48px;
  margin-bottom: 16px;
  color: var(--vp-c-text-1);
}

.comparison-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.comparison-table th,
.comparison-table td {
  padding: 10px 14px;
  border: 1px solid var(--vp-c-divider);
  text-align: left;
}

.comparison-table th {
  background: var(--vp-c-bg-soft);
  font-weight: 600;
}

.comparison-table td:nth-child(n+2) {
  text-align: center;
  font-size: 1.1rem;
}
</style>

## From zero to production

::: code-group

```ts [Hello World]
import { agent } from 'confused-ai';

const ai = agent('You are a helpful assistant.');
const { text } = await ai.run('What is 2 + 2?');
console.log(text); // "4"
```

```ts [Custom Tool]
import { agent, defineTool } from 'confused-ai';
import { z } from 'zod';

const getWeather = defineTool()
  .name('getWeather')
  .description('Get current weather for a city')
  .parameters(z.object({ city: z.string() }))
  .execute(async ({ city }) => ({ city, temp: 22, condition: 'sunny' }))
  .build();

const ai = agent({ instructions: 'Help with weather.', tools: [getWeather] });
const { text } = await ai.run('What is the weather in Paris?');
```

```ts [Multi-Agent Pipeline]
import { agent, compose } from 'confused-ai';

const researcher = agent('Research topics thoroughly and return key findings.');
const writer     = agent('Turn research notes into polished, engaging reports.');

const pipeline = compose(researcher, writer);
const { text } = await pipeline.run('Report on TypeScript 5.5 features');
```

```ts [Lifecycle Hooks]
import { agent } from 'confused-ai';

const ai = agent({
  instructions: 'You are a helpful assistant.',
  hooks: {
    beforeRun:      async (prompt) => `Today is ${new Date().toDateString()}\n\n${prompt}`,
    beforeToolCall: async (name, args, step) => { console.log(`→ ${name}`, args); return args; },
    onError:        async (error, step) => console.error(`Step ${step} failed:`, error.message),
  },
});
```

```ts [LLM Router]
import { createCostOptimizedRouter } from 'confused-ai';

// Automatically sends coding tasks to GPT-4o, simple Q&A to GPT-4o-mini
const router = createCostOptimizedRouter({
  providers: { fast: gpt4oMini, smart: gpt4o },
});
const { text } = await router.run('What is 2+2?'); // → routed to fast
```

:::

## What it looks like in production

```ts
import { agent, defineTool } from 'confused-ai';
import { createSqliteSessionStore } from 'confused-ai/session';
import { KnowledgeEngine, TextLoader, OpenAIEmbeddingProvider, InMemoryVectorStore } from 'confused-ai/knowledge';
import { GuardrailValidator, createSensitiveDataRule } from 'confused-ai/guardrails';
import { z } from 'zod';

// 1. Knowledge base from your docs
const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  vectorStore: new InMemoryVectorStore(),
});
await knowledge.ingest(await new TextLoader('./docs/policy.md').load());

// 2. Sessions, guardrails, and a custom tool
const sessions = createSqliteSessionStore('./data/sessions.db');

const guardrails = new GuardrailValidator({ rules: [createSensitiveDataRule()] });

const lookupOrder = defineTool()
  .name('lookupOrder')
  .description('Look up an order by ID')
  .parameters(z.object({ orderId: z.string() }))
  .execute(async ({ orderId }) => db.orders.findById(orderId))
  .build();

// 3. One agent — everything wired up
const support = agent({
  name:         'SupportBot',
  instructions: 'You are a helpful support agent. Use the knowledge base for policies.',
  model:        'gpt-4o-mini',
  tools:        [lookupOrder],
  sessionStore: sessions,
  ragEngine:    knowledge,
  guardrails,
  hooks: {
    afterRun: async (result) => { await analytics.track('support_run', { steps: result.steps }); return result; },
  },
});

// 4. Run with session continuity
const sessionId = await support.createSession('user-42');
const { text } = await support.run('What is your return policy?', { sessionId });
```
