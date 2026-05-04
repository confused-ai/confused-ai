# confused-ai — Monorepo Package Map

> Every package is independently publishable, tree-shakeable, and follows SOLID principles with O(1) data structures where applicable.

## Package Overview

| Package | Purpose | Key APIs |
|---|---|---|
| [`@confused-ai/contracts`](#contracts) | Shared error types, interfaces | `ConfusedAIError`, `BudgetExceededError` |
| [`@confused-ai/core`](#core) | Agent factory, ReAct runner | `createAgent`, `MapToolRegistry` |
| [`@confused-ai/models`](#models) | LLM adapters (lazy-loaded) | `openai()`, `anthropic()`, `google()` |
| [`@confused-ai/session`](#session) | Session persistence | `InMemorySessionStore`, `createSqliteStore` |
| [`@confused-ai/tools`](#tools) | Built-in tools | `httpClient`, `fileSystem`, `shell` |
| [`@confused-ai/workflow`](#workflow) | Multi-agent patterns | `compose()`, `createSupervisor()`, `createSwarm()` |
| [`@confused-ai/knowledge`](#knowledge) | RAG engine | `KnowledgeEngine`, `createKnowledgeEngine()` |
| [`@confused-ai/router`](#router) | Cost-optimized routing | `createCostOptimizedRouter()` |
| [`@confused-ai/guard`](#guard) | Resilience | `withRetry()`, `CircuitBreaker` |
| [`@confused-ai/observe`](#observe) | Observability | `withSpan()`, `recordMetric()` |
| [`@confused-ai/serve`](#serve) | HTTP adapter | `createServer()` |
| [`@confused-ai/test-utils`](#test-utils) | Testing | `createMockLLM()`, `createMockAgent()`, `runScenario()` |
| [`@confused-ai/adapter-redis`](#adapter-redis) | Redis adapter | `createRedisSessionStore()` |
| [`@confused-ai/providers`](#providers) | Full LLM provider layer | `OpenAIProvider`, `AnthropicProvider` |
| [`@confused-ai/agentic`](#agentic) | AgenticRunner (ReAct loop) | `AgenticRunner`, `createAgenticAgent()` |
| [`@confused-ai/dx`](#dx) | Developer experience | `agent()`, `defineAgent()`, `compose()` |
| [`@confused-ai/sdk`](#sdk) | High-level SDK | `defineAgent()`, `createWorkflow()` |
| [`@confused-ai/shared`](#shared) | Shared utils | `VERSION`, telemetry, debug logger |
| [`@confused-ai/adapters`](#adapters) | Adapter registry | `BuiltInAdapterRegistry` |
| [`@confused-ai/artifacts`](#artifacts) | Artifact handling | `Artifact`, `MediaArtifact` |
| [`@confused-ai/compression`](#compression) | Message compression | `CompressionManager` |
| [`@confused-ai/storage`](#storage) | Key-value storage | `createStorage()` |
| [`@confused-ai/background`](#background) | Job queues | BullMQ, Kafka, SQS, Redis, RabbitMQ |
| [`@confused-ai/config`](#config) | Config management | `loadConfig()`, `SecretManager` |
| [`@confused-ai/context`](#context) | Request context | `ContextProvider` |
| [`@confused-ai/graph`](#graph) | Agent graph/DAG | `GraphBuilder`, `StateGraph` |
| [`@confused-ai/guardrails`](#guardrails) | Content safety | `GuardrailEngine` |
| [`@confused-ai/learning`](#learning) | Adaptation | Online learning, user profiles |
| [`@confused-ai/memory`](#memory) | Long-term memory | `InMemoryStore`, `VectorMemoryStore` |
| [`@confused-ai/observability`](#observability) | Advanced observability | Tracing, metrics, structured logs |
| [`@confused-ai/orchestration`](#orchestration) | Orchestration | Multi-agent coordination, A2A |
| [`@confused-ai/planner`](#planner) | Task planning | Task decomposition |
| [`@confused-ai/plugins`](#plugins) | Plugin system | Plugin registry |
| [`@confused-ai/production`](#production) | Production readiness | Health checks, readiness probes |
| [`@confused-ai/reasoning`](#reasoning) | Reasoning | Chain-of-thought modules |
| [`@confused-ai/runtime`](#runtime) | Runtime manager | Agent lifecycle |
| [`@confused-ai/scheduler`](#scheduler) | Scheduling | Cron, task scheduling |
| [`@confused-ai/voice`](#voice) | Voice I/O | Voice provider abstraction |
| [`@confused-ai/video`](#video) | Video generation | YouTube Shorts orchestrator |
| [`@confused-ai/cli`](#cli) | CLI | `confused-ai create/run/eval/serve` |

## Domain Tool Packages

| Package | Tools |
|---|---|
| `@confused-ai/tools-search` | Tavily, Brave, Exa, Perplexity, Serper, ArXiv, PubMed, YouTube, Reddit |
| `@confused-ai/tools-scraping` | Playwright, Apify, Crawl4AI, Browserbase, Spider, Wikipedia |
| `@confused-ai/tools-productivity` | Notion, Jira, Linear, Google Calendar, Drive, Sheets, ClickUp, Trello |
| `@confused-ai/tools-communication` | Slack, Gmail, Discord, Telegram, Twilio, Zoom, Webex, Resend |
| `@confused-ai/tools-media` | ElevenLabs, FAL, Replicate, Unsplash, Giphy |
| `@confused-ai/tools-finance` | Stripe, yFinance, OpenBB |
| `@confused-ai/tools-devtools` | GitHub, GitLab, Bitbucket, Docker, E2B, AWS Lambda, Code Exec |

---

## Quick Start

```ts
// Minimum viable agent
import { createAgent } from '@confused-ai/core';
import { openai }      from '@confused-ai/models/openai';

const agent = createAgent({
  name:         'assistant',
  instructions: 'You are a helpful assistant.',
  llm:          openai({ model: 'gpt-4o-mini' }),
});

const { text } = await agent.run('What is the capital of France?');
console.log(text); // Paris
```

```ts
// Multi-agent workflow
import { createSwarm }   from '@confused-ai/workflow';
import { createAgent }   from '@confused-ai/core';
import { openai }        from '@confused-ai/models/openai';
import { KnowledgeEngine } from '@confused-ai/knowledge';

const llm = openai({ model: 'gpt-4o-mini' });

const swarm = createSwarm({
  agents: [
    createAgent({ name: 'researcher', instructions: 'Research topics.', llm }),
    createAgent({ name: 'writer',     instructions: 'Write content.',   llm }),
  ],
});

const result = await swarm.run('Research and write about quantum computing.');
```

```ts
// Cost-optimized routing
import { createCostOptimizedRouter } from '@confused-ai/router';
import { openai }    from '@confused-ai/models/openai';
import { anthropic } from '@confused-ai/models/anthropic';

const router = createCostOptimizedRouter({
  providers: new Map([
    ['gpt-4o-mini',           openai({ model: 'gpt-4o-mini' })],
    ['gpt-4o',                openai({ model: 'gpt-4o' })],
    ['claude-3-haiku-20240307', anthropic({ model: 'claude-3-haiku-20240307' })],
  ]),
  minCapability: 6,
});

const { provider } = router.select('Write a poem');
```

---

## Architecture Principles

### SOLID
| Principle | How |
|---|---|
| **SRP** | One concern per file. Runners don't own sessions. Adapters don't own routing. |
| **OCP** | All extension via interfaces (`LLMProvider`, `SessionStore`, `VectorStore`, `Tool`) |
| **LSP** | Every adapter is substitutable. `WorkflowAgent` and `TestAgent` are drop-in. |
| **ISP** | Minimal interfaces: `SessionStore` = 5 methods, `VectorStore` = 2 methods |
| **DIP** | Core depends on `LLMProvider` interface; concrete providers inject at the edges |

### Data Structures & Algorithms
| Operation | DS | Complexity |
|---|---|---|
| Tool lookup | `Map<string, Tool>` | O(1) |
| Message append | `Array.push()` | O(1) amortised |
| Stream chunks | SPSC `AsyncQueue` | O(1) enqueue/dequeue |
| Session get/set | `Map` / B-tree / Redis | O(1) / O(log n) |
| Vector search | Cosine + partial sort | O(n log k) |
| LLM routing | Pre-sorted array | O(1) cheapest, O(n) budget |
| Tool-call streaming | `Map<index, accum>` | O(1) per chunk |

### Lazy Loading
All heavy SDKs (`openai`, `@anthropic-ai/sdk`, `playwright`, `better-sqlite3`, etc.) are `peerDependencies` and loaded via dynamic `import()` only when the specific adapter is used. Zero cost if unused.

---

## CI/CD

```
push/PR → typecheck → lint → test (Node 18/20/22) → build all packages
```

All jobs run in parallel. Build is gated on typecheck + lint passing.
