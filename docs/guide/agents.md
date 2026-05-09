---
title: Creating Agents
description: All options for creating agents — model, tools, sessions, guardrails, budget, streaming, and more.
outline: [2, 3]
---

# Creating Agents

The `agent()` function is the primary way to create agents.

## Basic usage

```ts
import { agent } from 'confused-ai';

const ai = agent({
  model: 'gpt-4o',
  systemPrompt: 'You are a helpful assistant.',
});

const result = await ai.run({ prompt: 'Hello!' });
console.log(result.output); // "Hello! How can I help?"
```

## Full options reference

```ts
import { agent } from 'confused-ai';

const ai = agent({
  // ── Identity ─────────────────────────────────────────────────────
  name: 'MyAgent',                    // agent name (used in logs/traces)
  systemPrompt: 'You are...',         // base instructions to the LLM

  // ── LLM provider ──────────────────────────────────────────────────
  model: 'gpt-4o',                    // shorthand — auto-detects provider
  // or pass a provider instance:
  // llmProvider: new OpenAIProvider({ apiKey: '...', model: 'gpt-4o' }),

  // ── Tools ─────────────────────────────────────────────────────────
  tools: [myTool, anotherTool],       // array of Tool instances
  // tools: 'web',                    // preset: HTTP + browser tools

  // ── Session ───────────────────────────────────────────────────────
  sessionStore: store,                // InMemorySessionStore | SqliteSessionStore | RedisSessionStore

  // ── Execution limits ──────────────────────────────────────────────
  maxSteps: 10,                       // max ReAct iterations (default: 10)
  timeoutMs: 60_000,                  // run timeout in ms (default: 60s)

  // ── Guardrails ────────────────────────────────────────────────────
  guardrails: validator,              // GuardrailValidator instance

  // ── Budget ────────────────────────────────────────────────────────
  budget: {
    maxCostUsd: 0.10,                 // hard stop at $0.10 per run
    maxTokens: 50_000,                // hard stop at 50k tokens
  },

  // ── HITL (human-in-the-loop) ──────────────────────────────────────
  humanInTheLoop: {
    beforeToolCall: async (tool, args) => {
      if (tool.id === 'send_email') return await askUser('Allow?');
      return { approved: true };
    },
  },

  // ── Lifecycle hooks ───────────────────────────────────────────────
  hooks: {
    beforeRun:      async (ctx) => { /* ... */ },
    afterRun:       async (result) => { /* ... */ },
    beforeToolCall: async (tool, args) => { /* ... */ },
    afterToolCall:  async (tool, result) => { /* ... */ },
    onError:        async (err) => { /* ... */ },
  },

  // ── Knowledge base (RAG) ──────────────────────────────────────────
  knowledgebase: ragEngine,           // auto-retrieves context each run

  // ── Reasoning ─────────────────────────────────────────────────────
  reasoning: {
    enabled: true,
    strategy: 'cot',                  // 'cot' | 'tot' | 'react'
    maxSteps: 5,
  },
});
```

## Running an agent

### `run()` — single response

```ts
const result = await ai.run({
  prompt: 'Summarise this article: ...',
  sessionId: 'user-123',             // optional: ties to a session
  userId: 'user-123',                // optional: budget tracking per user
  runId: 'run-abc',                  // optional: idempotency key
  maxSteps: 5,                       // override per run
  timeoutMs: 30_000,                 // override per run
});

console.log(result.output);          // final text response
console.log(result.steps);           // number of ReAct iterations
console.log(result.usage);           // { promptTokens, completionTokens, totalTokens }
console.log(result.finishReason);    // 'stop' | 'max_steps' | 'timeout' | 'error'
```

### `stream()` — streaming tokens

```ts
for await (const chunk of ai.stream({ prompt: 'Write a poem' })) {
  process.stdout.write(chunk);
}
```

### `resume()` — continue from checkpoint

```ts
// Resume a previous run (requires checkpointStore configured)
const result = await ai.resume('session-id-here');
```

## Structured output

Return a validated JSON object instead of text:

```ts
import { z } from 'zod';

const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  score: z.number().min(-1).max(1),
  summary: z.string(),
});

const result = await ai.run({
  prompt: 'Analyse the sentiment of: "This product is amazing!"',
  responseModel: SentimentSchema,
});

console.log(result.structuredOutput);
// { sentiment: 'positive', score: 0.95, summary: 'Very positive review' }
```

## Using `defineAgent()` (fluent builder)

The SDK package provides a fluent builder for reusable agent definitions:

```ts
import { defineAgent } from '@confused-ai/sdk';

const researchAgent = defineAgent({
  name: 'Researcher',
  instructions: 'Research topics thoroughly and return structured findings.',
  model: 'gpt-4o',
})
  .tools([webSearchTool, scraperTool])
  .budget({ maxCostUsd: 0.50 })
  .checkpoint({ store: checkpointStore });

// DefinedAgent has the same .run() / .stream() interface
const result = await researchAgent.run({ prompt: 'Latest TypeScript 5.5 features' });
```

## Skills

Skills bundle instructions + tools into reusable capability packs:

```ts
import { agent } from 'confused-ai';
import { webResearchSkill, codeReviewerSkill } from '@confused-ai/skills';

const ai = agent({
  model: 'gpt-4o',
  skills: [webResearchSkill, codeReviewerSkill],
});
```

Built-in skills:
- `webResearchSkill` — Tavily search + URL scraping
- `pdfSummarizerSkill` — PDF loading + summarisation
- `codeReviewerSkill` — file reading + security analysis

## Serving an agent as HTTP API

```ts
import { serve } from 'confused-ai';

await serve(ai, { port: 3000 });
```

Endpoints created:
- `POST /v1/run` — `{ prompt, sessionId?, userId?, runId? }` → `AgenticRunResult`
- `POST /v1/stream` — SSE streaming response
- `GET  /v1/health` — health check
- `GET  /v1/openapi.json` — OpenAPI 3.1 spec
- `GET  /v1/approvals` — pending HITL approvals
- `POST /v1/approvals/:id` — submit HITL decision
