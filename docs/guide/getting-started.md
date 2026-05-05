---
title: Getting Started
description: Install confused-ai, create your first agent, and ship to production — step by step.
outline: [2, 3]
---

# Getting Started

<p class="lead">
confused-ai is a TypeScript framework for building production-grade AI agents. You get sensible defaults out of the box — LLM provider auto-detection, in-memory session, HTTP + browser tools — and full escape hatches at every layer.
</p>

## Prerequisites

- Node.js ≥ 18 or Bun ≥ 1.0
- At least one LLM provider API key

## Installation

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
```bash [yarn]
yarn add confused-ai
```
:::

Then set your API key in the environment:

```bash [.env]
# Pick at least one
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
```

::: tip Auto-detection
`agent({ model: 'gpt-4o-mini' })` automatically reads `OPENAI_API_KEY` from `process.env`. You never need to pass the key directly.
:::

---

## Your first agent

```ts [hello-agent.ts]
import { agent } from 'confused-ai';

const ai = agent({
  model: 'gpt-4o-mini',
  instructions: 'You are a concise, helpful assistant.',
});

const result = await ai.run('What is 12 * 8?');
console.log(result.text);
// → "The answer is 96."
```

Run it:

```bash
npx tsx hello-agent.ts
```

### What `result` contains

```ts
interface AgenticRunResult {
  text: string;              // final assistant response
  markdown: {
    name: string;            // "response-<runId>.md"
    content: string;         // same as text
    mimeType: 'text/markdown';
    type: 'markdown';
  };
  structuredOutput?: unknown; // set when responseModel is used
  messages: Message[];        // full conversation history
  steps: number;              // LLM steps taken
  finishReason:
    | 'stop' | 'max_steps' | 'timeout'
    | 'error' | 'human_rejected' | 'aborted';
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  runId?: string;
  traceId?: string;
}
```

---

## Streaming responses

`stream()` returns an `AsyncIterable<string>` — chunks arrive as the model generates:

```ts [streaming.ts]
import { agent } from 'confused-ai';

const ai = agent({
  model: 'gpt-4o-mini',
  instructions: 'You are a helpful assistant.',
});

// Pipe to stdout
for await (const chunk of ai.stream('Explain TypeScript generics')) {
  process.stdout.write(chunk);
}
```

::: tip
`stream()` accepts the same options as `run()` — `sessionId`, `hooks`, `runId`, etc.
:::

---

## Add a custom tool

```ts [weather-agent.ts]
import { agent, defineTool } from 'confused-ai';
import { z } from 'zod';

const getWeather = defineTool()
  .name('getWeather')
  .description('Get current weather for a city')
  .parameters(z.object({ city: z.string().describe('City name') }))
  .execute(async ({ city }) => {
    // Replace with a real weather API
    return { city, temp: 22, condition: 'sunny' };
  })
  .build();

const weatherAgent = agent({
  model: 'gpt-4o-mini',
  instructions: 'Help with weather queries.',
  tools: [getWeather],
});

const r = await weatherAgent.run('What is the weather in Paris?');
console.log(r.text);
// → "The current weather in Paris is 22°C and sunny."
```

---

## Add session continuity

Without a session store, every `run()` starts fresh. SQLite persistence requires zero external dependencies:

```ts [session-agent.ts]
import { agent } from 'confused-ai';
import { createSqliteSessionStore } from 'confused-ai/session';

const sessions = createSqliteSessionStore('./sessions.db');

const ai = agent({
  model: 'gpt-4o-mini',
  instructions: 'You are a personal assistant with perfect memory.',
  sessionStore: sessions,
});

// Run 1 — agent learns Alice's preference
await ai.run('My favorite color is blue.', { sessionId: 'alice' });

// Run 2 — agent recalls it (even after process restart)
const r = await ai.run('What is my favorite color?', { sessionId: 'alice' });
console.log(r.text); // "Your favorite color is blue."
```

---

## Add RAG (knowledge base)

```ts [rag-agent.ts]
import { agent } from 'confused-ai';
import { KnowledgeEngine, TextLoader, InMemoryVectorStore } from 'confused-ai/knowledge';
import { OpenAIEmbeddingProvider } from 'confused-ai/memory';

// 1. Build the knowledge base
const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider({
    apiKey: process.env.OPENAI_API_KEY!,
  }),
  vectorStore: new InMemoryVectorStore(),
});

// 2. Ingest documents
const docs = await new TextLoader('./docs/').load();
await knowledge.ingest(docs);

// 3. Attach to agent — relevant chunks are injected automatically on each run
const ragAgent = agent({
  model: 'gpt-4o-mini',
  instructions: `
    You are a documentation assistant.
    Use the knowledge base to answer questions.
    Always cite the document ID when you reference content.
  `,
  knowledgebase: knowledge,
});

const r = await ragAgent.run('How do I create a custom tool?');
console.log(r.text);
```

---

## Multi-agent pipeline

`compose()` chains agents — output of the first becomes input of the next:

```ts [pipeline.ts]
import { agent, compose } from 'confused-ai';

const researcher = agent({
  model: 'gpt-4o',
  instructions: 'Research topics thoroughly. Return structured findings with sources.',
});

const writer = agent({
  model: 'gpt-4o',
  instructions: 'Write clear, engaging blog posts from research notes.',
});

// researcher runs first, writer receives its output
const pipeline = compose(researcher, writer);
const result = await pipeline.run('The future of TypeScript in AI applications');
console.log(result.text); // polished blog post
```

---

## Add production resilience

```ts [resilient-agent.ts]
import { agent } from 'confused-ai';
import { withResilience } from 'confused-ai/guard';

const base = agent({
  model: 'gpt-4o',
  instructions: 'You are a production assistant.',
});

// Wrap with circuit breaker + rate limiting + retries
const resilient = withResilience(base, {
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
  rateLimit:      { maxRpm: 60 },
  retry:          { maxRetries: 2, backoffMs: 500 },
});

const result = await resilient.run('Process this request');

// Check health
const health = resilient.health();
console.log(health.status);       // 'healthy' | 'degraded' | 'unhealthy'
console.log(health.circuitState); // 'closed' | 'open' | 'half-open'
```

---

## Choose your provider

```ts
import {
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
  createGroqProvider,
} from 'confused-ai';

// OpenAI
const openai = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o' });

// Anthropic
const claude = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-opus-4-5' });

// Google
const gemini = new GoogleProvider({ apiKey: process.env.GOOGLE_API_KEY!, model: 'gemini-2.0-flash' });

// Groq (ultra-fast inference)
const groq = createGroqProvider({ apiKey: process.env.GROQ_API_KEY!, model: 'llama-3.3-70b-versatile' });

// Use any provider with agent()
const ai = agent({ llmProvider: groq, instructions: '...' });
```

Or use the **model string shorthand** — the framework picks the right provider from env:

```ts
agent({ model: 'gpt-4o-mini' })        // → OpenAI
agent({ model: 'claude-3-5-haiku' })   // → Anthropic
agent({ model: 'gemini-2.0-flash' })   // → Google
```

::: warning Model shorthand requires matching env var
`model: 'gpt-4o-mini'` will throw at runtime if `OPENAI_API_KEY` is not set.
:::

---

## Next steps

| Topic | Guide |
|-------|-------|
| All agent creation options | [Creating Agents](/guide/agents) |
| 100+ built-in tools | [Built-in Tools](/guide/tools) |
| Custom tools | [Custom Tools](/guide/custom-tools) |
| Session persistence | [Session Management](/guide/session) |
| RAG & knowledge bases | [RAG / Knowledge](/guide/rag) |
| Multi-agent patterns | [Orchestration](/guide/orchestration) |
| Circuit breakers & resilience | [Production](/guide/production) |
| Guardrails & safety | [Guardrails](/guide/guardrails) |
| OTLP tracing & metrics | [Observability](/guide/observability) |
