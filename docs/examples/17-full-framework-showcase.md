# 17 · Full framework showcase (real-world map)

This page is a **single narrative** that touches **every major capability** in fluxion: one fictional product, with imports you can copy into your own app. Deep dives live in the numbered examples and guides linked throughout.

---

## The story: NorthPeak StoreOps Copilot

**NorthPeak Retail** ships an internal assistant for store managers:

- Answers **policy and procedure** questions from uploaded PDFs (RAG).
- Runs **safe tools** (calculator, HTTP lookups, optional MCP integrations).
- **Remembers** the conversation per store via sessions; **profiles** repeat users.
- Uses **workflows** (plan → compose), **pipelines** for handoffs, and optional **supervisor / team** patterns for escalation.
- Ships behind **HTTP + OpenAPI**, with **health checks**, **rate limits**, **circuit breakers**, **guardrails**, and **observability** (logs, metrics, evals, optional Langfuse/LangSmith batches).

You do not need one monolith file in production—this page shows **how each concern maps to a module** so you can adopt pieces incrementally.

---

## Architecture (how the pieces fit)

```mermaid
flowchart TB
    subgraph client [Clients]
        Web[Web / mobile]
        Curl[API clients]
    end

    subgraph runtime [HTTP runtime]
        API[createHttpService]
        OAI[OpenAPI /health]
    end

    subgraph agent [Agent layer]
        CA[createAgent]
        AA[Agent / AgenticRunner]
        DA[defineAgent + workflows]
    end

    subgraph data [Data plane]
        Sess[SessionStore]
        Mem[Memory / profiles]
        RAG[KnowledgeEngine + vector store]
        Art[Artifacts]
    end

    subgraph safety [Safety and ops]
        GR[Guardrails]
        RL[RateLimiter / RedisRateLimiter]
        CB[CircuitBreaker]
        Obs[Metrics / tracing / eval]
    end

    Web --> API
    Curl --> API
    API --> CA
    CA --> Sess
    CA --> RAG
    CA --> GR
    CA --> Obs
    DA --> Mem
    CA --> Art
    API --> OAI
    RL --> API
```

---

## Runnable scripts in this repo

Run these from the **repository root** (they import `src/` paths; published apps use `fluxion` imports instead).

| Script | Command | What it demonstrates |
|--------|---------|----------------------|
| **Full LLM tour** | `bun run example:showcase` | `createAgent`, sessions, tools, guardrails, logger, streaming hooks, `defineAgent` + `createWorkflow` (sequential + parallel), `createPipeline` + `asOrchestratorAgent`, planner + memory, health, metrics, OpenAPI; add `--http` for `createHttpService` |
| **Module sampler (no LLM)** | `bun run example:potential` | `splitText`, circuit breaker, rate limiter, artifacts, learning profiles, eval metrics, `loadConfig` |
| **Minimal agent** | `bun run example:simple` | Smallest `createAgent` setup |

---

## Capability checklist → imports

Use this as a **coverage map** against **`CAPABILITIES.md`** at the repository root (same checklist the maintainers update with each release).

### Core agent loop

| Capability | Example import |
|------------|----------------|
| Opinionated agent | `import { createAgent } from 'fluxion'` |
| ReAct / tool loop (bring your own LLM) | `import { createAgenticAgent } from 'fluxion/agentic'` |
| Class-based `Agent` | `import { Agent } from 'fluxion'` |
| Fluent DX builder | `import { defineAgent } from 'fluxion'` (DX chain under `fluxion` — see [Creating Agents](/guide/agents)) |
| Typed Zod agents (SDK) | `import { defineAgent, createWorkflow, asOrchestratorAgent } from 'fluxion'` |

```ts
import { createAgent, resolveLlmForCreateAgent } from 'fluxion';
import { CalculatorAddTool } from 'fluxion/tools';
import { InMemorySessionStore } from 'fluxion/session';

const agent = createAgent({
  name: 'StoreOps',
  instructions: 'Help store managers with policy and math. Use calculator_add when adding numbers.',
  sessionStore: new InMemorySessionStore(),
  tools: [new CalculatorAddTool()],
  llm: resolveLlmForCreateAgent(
    { name: 'StoreOps', instructions: '_' },
    { model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY! }
  ),
});
```

### Tools & integrations

| Capability | Example import |
|------------|----------------|
| Built-in tools | `import { … } from 'fluxion/tools'` |
| Registry | `import { ToolRegistryImpl, toToolRegistry } from 'fluxion/tools'` |
| MCP HTTP client | `import { HttpMcpClient, loadMcpToolsFromUrl } from 'fluxion/tools'` |
| MCP HTTP server | `import { McpHttpServer, createMcpServer } from 'fluxion/tools'` |
| MCP stdio (minimal) | `import { runMcpStdioToolServer, handleMcpStdioLine } from 'fluxion/tools'` |
| JSON tool gateway | `import { handleToolGatewayRequest } from 'fluxion/tools'` |
| Playwright (optional peer) | `import { PlaywrightPageTitleTool } from 'fluxion/tools'` |

```ts
import { createWorkflow, defineAgent } from 'fluxion';
import { CalculatorAddTool } from 'fluxion/tools';
import { z } from 'zod';

const analyst = defineAgent({
  name: 'analyst',
  inputSchema: z.object({ question: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
  tools: [new CalculatorAddTool()],
  handler: async (input) => ({ answer: `Thought about: ${input.question}` }),
});

const wf = createWorkflow();
const out = await wf.task('analyst', analyst).sequential().execute({ question: 'Q4 foot traffic?' });
```

### Session, memory, knowledge

| Capability | Example import |
|------------|----------------|
| Sessions (memory / SQL / SQLite / Redis) | `import { InMemorySessionStore, RedisSessionStore, createSqliteSessionStore } from 'fluxion/session'` |
| Redis LLM cache | `import { RedisLlmCache } from 'fluxion/session'` |
| Semantic / episodic memory | `import { InMemoryStore, MemoryType } from 'fluxion'` |
| Vector stores | `import { PineconeVectorStore, QdrantVectorStore, PgVectorStore, InMemoryVectorStore } from 'fluxion/memory'` |
| User profiles | `import { InMemoryUserProfileStore } from 'fluxion/learning'` |
| RAG | `import { KnowledgeEngine, TextLoader, splitText } from 'fluxion/knowledge'` |

```ts
import { KnowledgeEngine, splitText } from 'fluxion/knowledge';
import { InMemoryVectorStore } from 'fluxion/memory';
import { OpenAIEmbeddingProvider } from 'fluxion/memory';

const chunks = splitText('Return policy: 30 days. Receipt required.', { chunkSize: 40, chunkOverlap: 8 });

const rag = new KnowledgeEngine({
  vectorStore: new InMemoryVectorStore(),
  embeddingProvider: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
});

await rag.ingest([
  {
    content: chunks.join('\n'),
    metadata: { store: 'northpeak' },
    source: 'return-policy-v3',
  },
]);
```

### Safety & planning

| Capability | Example import |
|------------|----------------|
| Guardrails | `import { GuardrailValidator, createSensitiveDataRule, createPiiDetectionRule } from 'fluxion/guardrails'` |
| Planners | `import { ClassicalPlanner, PlanningAlgorithm } from 'fluxion/planner'` |
| Execution graphs | `import { … } from 'fluxion/execution'` |

```ts
import { GuardrailValidator, createSensitiveDataRule } from 'fluxion/guardrails';

const guardrails = new GuardrailValidator({
  rules: [createSensitiveDataRule()],
});
```

### Orchestration

| Capability | Example import |
|------------|----------------|
| Pipeline | `import { createPipeline } from 'fluxion/orchestration'` |
| Supervisor, swarm, team, toolkit | `import { … } from 'fluxion/orchestration'` |
| Agent router (**orchestration** strategy type) | `import type { AgentRoutingStrategy } from 'fluxion/orchestration'` |
| A2A client | `import { HttpA2AClient, createHttpA2AClient } from 'fluxion/orchestration'` |

::: tip
The **LLM** router uses `RoutingStrategy` from `fluxion/llm`. The **multi-agent** router uses `AgentRoutingStrategy` from `fluxion/orchestration`—do not confuse the two.
:::

### Observability & quality

| Capability | Example import |
|------------|----------------|
| Logging / metrics / tracer | `import { ConsoleLogger, MetricsCollectorImpl, InMemoryTracer } from 'fluxion/observability'` |
| Eval metrics | `import { wordOverlapF1, rougeLWords, ExactMatchAccuracy } from 'fluxion/observability'` |
| LLM-as-judge | `import { runLlmAsJudge } from 'fluxion/observability'` |
| Langfuse / LangSmith (HTTP helpers) | `import { sendLangfuseBatch, sendLangSmithRunBatch } from 'fluxion/observability'` |
| OTLP | `import { OTLPTraceExporter, OTLPMetricsExporter } from 'fluxion/observability'` |

```ts
import { MetricsCollectorImpl } from 'fluxion/observability';

const metrics = new MetricsCollectorImpl();
metrics.counter('northpeak_queries', 1, { region: 'us-west' });
```

### Production & resilience

| Capability | Example import |
|------------|----------------|
| Health | `import { HealthCheckManager, createSessionStoreHealthCheck } from 'fluxion/production'` |
| Rate limiting (process) | `import { RateLimiter, createOpenAIRateLimiter } from 'fluxion/production'` |
| Rate limiting (Redis) | `import { RedisRateLimiter } from 'fluxion/production'` |
| Circuit breaker | `import { CircuitBreaker, createLLMCircuitBreaker } from 'fluxion/production'` |
| Streams / shutdown | `import { ResumableStreamManager, GracefulShutdown } from 'fluxion/production'` |

### Artifacts & media

| Capability | Example import |
|------------|----------------|
| Versioned outputs | `import { InMemoryArtifactStorage, createTextArtifact } from 'fluxion/artifacts'` |
| Media / video helpers | `import { … } from 'fluxion'` (video module) |

### HTTP service

| Capability | Example import |
|------------|----------------|
| API + SSE + OpenAPI | `import { createHttpService, listenService, getRuntimeOpenApiJson } from 'fluxion/runtime'` |

```ts
import { createHttpService, listenService } from 'fluxion/runtime';

const service = createHttpService(
  { agents: { storeops: agent }, tracing: true, cors: '*' },
  8787
);
await listenService(service, 8787);
```

### Config

| Capability | Example import |
|------------|----------------|
| Env-based config | `import { loadConfig, validateConfig } from 'fluxion/config'` |

### LLM providers & structured streaming

| Capability | Example import |
|------------|----------------|
| OpenAI / Anthropic / Google / compat | `import { OpenAIProvider, AnthropicProvider, GoogleProvider, … } from 'fluxion/llm'` |
| Bedrock (optional SDK) | `import { BedrockConverseProvider } from 'fluxion/llm'` |
| Smart model routing (no extra LLM call) | `import { createSmartRouter, scoreTaskTypesForRouting } from 'fluxion/llm'` |
| Stream → Zod | `import { collectStreamText, collectStreamThenValidate } from 'fluxion/llm'` |
| Context limits | `import { getContextLimitForModel, ContextWindowManager } from 'fluxion/llm'` |

```ts
import { z } from 'zod';
import { collectStreamThenValidate, type StreamDelta } from 'fluxion/llm';

async function structuredFromStream(stream: AsyncIterable<StreamDelta>) {
  const schema = z.object({ summary: z.string(), risk: z.enum(['low', 'medium', 'high']) });
  return collectStreamThenValidate(stream, { schema });
}
```

---

## Where to go next

| Topic | Doc |
|-------|-----|
| Step-by-step tutorials | [Examples index](./index.md) · [Getting Started](/guide/getting-started) |
| RAG details | [RAG guide](/guide/rag) · [Example 05 · RAG](./05-rag) |
| Multi-agent | [Orchestration](/guide/orchestration) · [Example 08](./08-team) · [09](./09-supervisor) |
| Production | [Resilience](/guide/production) · [Example 13](./13-production) |
| MCP | [MCP guide](/guide/mcp) · [Example 14](./14-mcp) |
| Full-stack shape | [Example 15](./15-full-stack) |
| Model routing | [Example 16](./16-llm-router) |

---

## NorthPeak “minimum viable” stack (opinionated)

If you only wire **one** path first:

1. **`createAgent`** + **`InMemorySessionStore`** (or Redis in production).
2. **`KnowledgeEngine`** + a real **vector store** for policy docs.
3. **`GuardrailValidator`** + at least one **PII or sensitive-data** rule.
4. **`createHttpService`** + **`HealthCheckManager`** for deploys.
5. **`RateLimiter`** or **`RedisRateLimiter`** on hot routes.
6. **`MetricsCollectorImpl`** (or OTLP) for dashboards.

Then add **workflows**, **MCP**, **A2A**, and **Bedrock** when a concrete integration requires them.

The runnable **`examples/framework-showcase.ts`** file in the repo is the closest **end-to-end code** counterpart to this page; diff it against your app’s `package.json` imports when you migrate from repo-relative paths to `fluxion`.
