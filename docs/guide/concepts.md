---
title: Core Concepts
description: The mental model behind confused-ai — agents, tools, memory, sessions, and how they fit together.
outline: [2, 3]
---

# Core Concepts

This page explains the mental model. Understanding these primitives makes every other guide click immediately.

---

## The agent run loop

An agent is an LLM plus a set of capabilities (tools, memory, knowledge). Each `run()` call executes a **ReAct loop** — it keeps calling the LLM and executing tool calls until the model emits a final answer or hits `maxSteps`:

```
agent.run(prompt)
 │
 ├─ 1. Build context
 │      • load session history
 │      • inject long-term memory (top-K vector recall)
 │      • retrieve relevant knowledge chunks (RAG)
 │
 ├─ 2. LLM call → response
 │      ├─ tool_call  → execute tool → append result → loop
 │      └─ final text → return AgenticRunResult
 │
 ├─ 3. Repeat up to maxSteps (default 15)
 │
 └─ 4. Return { text, messages, steps, usage, finishReason, … }
```

---

## Tools

Tools are typed functions the LLM can invoke. confused-ai handles everything automatically:

1. Converts your Zod schema to JSON Schema and sends it to the LLM
2. Parses and validates the LLM's tool-call arguments
3. Executes your `execute()` function
4. Appends the result to the conversation and continues the loop

```ts
import { defineTool } from 'confused-ai';
import { z } from 'zod';

const lookup = defineTool()
  .name('lookup')
  .description('Look up a product by SKU')
  .parameters(z.object({ sku: z.string() }))
  .execute(async ({ sku }) => db.products.findOne({ sku }))
  .build();
```

→ [Custom Tools guide](/guide/custom-tools) · [100+ built-in tools](/guide/tools)

---

## Session

A **session** gives an agent conversation memory across multiple `run()` calls. Without a session store, every call starts fresh.

```ts
// Same sessionId = continuous conversation
await agent.run('My name is Alice.', { sessionId: 'user-42' });
await agent.run('What is my name?',  { sessionId: 'user-42' });
// → "Your name is Alice."
```

Sessions are backed by a **SessionStore** — in-memory, SQLite, Redis, or any SQL database.

→ [Session guide](/guide/session)

---

## Memory

Memory is distinct from session. Session tracks *this conversation*. Memory tracks *knowledge across all conversations*.

| Type | Class | What it stores |
|------|-------|---------------|
| Short-term | `InMemoryStore` | Current conversation turns |
| Long-term (semantic) | `VectorMemoryStore` | Embedded facts recalled by similarity |
| Structured | `LearningMachine` | User profiles, entity facts, learned insights |

→ [Memory guide](/guide/memory) · [Learning Machine guide](/guide/learning-machine)

---

## Knowledge (RAG)

A `KnowledgeEngine` lets agents answer questions from your documents. Before each LLM call, the most relevant chunks are retrieved and injected as context — invisible to you, automatic:

```ts
const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider({ apiKey: '...' }),
  vectorStore: new InMemoryVectorStore(),
});
await knowledge.ingest(docs);

const ragAgent = agent({ knowledgebase: knowledge, ... });
// On every run() → top-K chunks auto-injected
```

→ [RAG / Knowledge guide](/guide/rag)

---

## Lifecycle Hooks

Hooks let you intercept the run at well-defined points without modifying the agent:

| Hook | Fires when |
|------|-----------|
| `beforeRun` | Before the first LLM call |
| `afterRun` | After the final response |
| `beforeStep` | Before each LLM step |
| `afterStep` | After each LLM step |
| `beforeToolCall` | Before a tool executes |
| `afterToolCall` | After a tool returns |
| `onError` | On any unhandled error |

```ts
const ai = agent({
  hooks: {
    afterRun: async (result) => {
      await analytics.track('agent.run', {
        steps: result.steps,
        tokens: result.usage?.totalTokens,
      });
      return result; // hooks must return the value
    },
  },
});
```

→ [Lifecycle Hooks guide](/guide/hooks)

---

## Guardrails

Guardrails validate inputs and outputs. They run synchronously in the loop — a blocked result stops execution and returns a rejection to the caller.

```ts
import { createGuardrails } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  validateInput:  async (input) => /DROP TABLE/i.test(input)
    ? { blocked: true, reason: 'SQL injection detected' }
    : { blocked: false },
  validateOutput: async (output) => output.includes('SECRET')
    ? { blocked: true, reason: 'Leaked credential' }
    : { blocked: false },
});
```

→ [Guardrails guide](/guide/guardrails)

---

## Orchestration

Multiple agents working together. The key patterns:

| Pattern | API | Use case |
|---------|-----|---------|
| **Pipeline** | `compose(a, b, c)` | Serial — output flows through each agent |
| **Router** | `AgentRouter` | One of N agents handles the request |
| **Handoff** | `createHandoff` | Agent A delegates to specialist mid-conversation |
| **Supervisor** | `createSupervisor` | Coordinator manages a worker team |
| **Swarm** | `createSwarm` | Peer-to-peer handoffs |
| **Consensus** | `ConsensusProtocol` | Multiple agents vote on a response |

→ [Orchestration guide](/guide/orchestration)

---

## Adapters

Adapters are the plug points between confused-ai and your infrastructure. There are 20 adapter categories covering databases, vector stores, caches, queues, auth, rate-limiting, and more. Every adapter has a zero-config in-memory default and a drop-in production replacement.

```ts
import { createProductionSetup } from 'confused-ai/adapters';

// Opinionated default production wiring
const setup = createProductionSetup({
  redisUrl:    process.env.REDIS_URL,
  postgresUrl: process.env.DATABASE_URL,
  pineconeKey: process.env.PINECONE_API_KEY,
});
```

→ [Adapters guide](/guide/adapters)

---

## Plugins

Plugins are reusable middleware attached to an agent via `.use()`. They wrap every tool call with cross-cutting logic (logging, caching, rate-limiting, telemetry) without modifying the tool itself:

```ts
import { loggingPlugin } from 'confused-ai/plugins';

const ai = defineAgent().instructions('...').use(loggingPlugin({ level: 'debug' })).build();
```

→ [Plugins guide](/guide/plugins)
