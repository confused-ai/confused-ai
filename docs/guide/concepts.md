---
title: Core Concepts
description: How confused-ai works — agents, tools, sessions, the ReAct loop, and the package architecture.
outline: [2, 3]
---

# Core Concepts

## Architecture overview

confused-ai is a **monorepo of 40 focused packages** published individually on npm and bundled together as `confused-ai`. Every layer is swappable.

```
confused-ai (root bundle)
├── @confused-ai/core          — Agent interface, runner base, types
├── @confused-ai/agentic       — ReAct loop, tool dispatch, HITL
├── @confused-ai/models        — 40+ LLM provider adapters
├── @confused-ai/tools         — 100+ built-in tools (HTTP, browser, Slack…)
├── @confused-ai/memory        — Short/long-term memory, vector stores
├── @confused-ai/knowledge     — RAG engine, document loaders, vector adapters
├── @confused-ai/session       — Session persistence (SQLite, Redis, Postgres)
├── @confused-ai/orchestration — Multi-agent: team, swarm, pipeline, supervisor
├── @confused-ai/graph         — DAG engine, durable execution, event store
├── @confused-ai/production    — Circuit breakers, rate limiting, health checks
├── @confused-ai/guardrails    — PII detection, prompt injection, content rules
├── @confused-ai/eval          — LLM-as-judge, ROUGE, regression runner
├── @confused-ai/observe       — OTLP tracing, Prometheus metrics, logger
└── ... 27 more packages
```

## The agent

An **agent** is the core primitive. It wraps:

1. An **LLM provider** — generates text and tool calls
2. A **tool registry** — functions the LLM can invoke
3. A **session store** — remembers conversation history
4. **Lifecycle hooks** — observe and control every step

```ts
import { agent } from 'confused-ai';

const ai = agent({
  model: 'gpt-4o',          // provider auto-detected from env
  systemPrompt: '...',      // agent persona
  tools: [...],             // what the agent can do
  sessionStore: store,      // where messages are saved
  maxSteps: 10,             // max ReAct iterations
});
```

## The ReAct loop

Every `agent.run()` call executes the **ReAct** (Reason + Act) loop:

```
User prompt
  │
  ▼
┌─────────────────────────┐
│  LLM: think + plan      │  ← systemPrompt + message history + tools
└────────┬────────────────┘
         │ tool_calls or stop
         ▼
   ┌─────────────┐
   │ Tool dispatch│  ← execute tool, apply guardrails, HITL if configured
   └──────┬──────┘
          │ tool_result
          └──── back to LLM (repeat up to maxSteps)
  │
  ▼
Final response → AgenticRunResult
```

Steps continue until the LLM emits `stop` (no more tool calls) or `maxSteps` is reached.

## Tools

A **tool** is a typed function the LLM can call. Tools have:
- An `id` — unique name the LLM uses to call it
- A `description` — what the LLM reads to decide when to use it
- A Zod `parameters` schema — validated input
- An `execute` function — the actual implementation

```ts
import { tool } from 'confused-ai';
import { z } from 'zod';

const lookupUser = tool({
  id: 'lookup_user',
  description: 'Look up a user by email address',
  parameters: z.object({ email: z.string().email() }),
  execute: async ({ email }) => db.users.findByEmail(email),
});
```

## Sessions

A **session** is a conversation thread identified by `sessionId`. Messages are stored in a session store and loaded on every `run()`:

```ts
// Messages are loaded and appended automatically
await ai.run({ prompt: 'My name is Alice', sessionId: 'user-123' });
await ai.run({ prompt: 'What is my name?',  sessionId: 'user-123' });
// → "Your name is Alice."
```

Without a `sessionStore`, every run starts fresh (in-memory only).

## Providers

A **provider** implements the `LLMProvider` interface:

```ts
interface LLMProvider {
  generateText(messages: Message[], options?: GenerateOptions): Promise<GenerateResult>;
  streamText?(messages: Message[], options?: GenerateOptions): Promise<AsyncIterable<StreamChunk>>;
}
```

40+ providers ship out of the box. The model string shorthand auto-detects which to use:

| Model prefix | Provider | Env var |
|---|---|---|
| `gpt-*` | OpenAI | `OPENAI_API_KEY` |
| `claude-*` | Anthropic | `ANTHROPIC_API_KEY` |
| `gemini-*` | Google | `GOOGLE_API_KEY` |
| `llama-*` | Groq | `GROQ_API_KEY` |
| `mistral-*` | Mistral | `MISTRAL_API_KEY` |
| `deepseek-*` | DeepSeek | `DEEPSEEK_API_KEY` |

## Hooks

Hooks let you observe and intercept the agent lifecycle:

```ts
const ai = agent({
  model: 'gpt-4o',
  hooks: {
    beforeRun:      async (ctx) => console.log('Starting', ctx.prompt),
    afterRun:       async (result) => analytics.track(result),
    beforeToolCall: async (tool, args) => audit.log(tool.id, args),
    afterToolCall:  async (tool, result) => cache.set(tool.id, result),
    onError:        async (err) => alerts.send(err),
  },
});
```

## Next steps

| | |
|---|---|
| [Creating Agents](/guide/agents) | All agent config options |
| [Built-in Tools](/guide/tools) | 100+ ready-to-use tools |
| [LLM Providers](/guide/providers) | 40+ supported models |
| [Memory](/guide/memory) | Short/long-term + vector |
| [RAG / Knowledge](/guide/rag) | Build knowledge bases |
| [Multi-Agent](/guide/orchestration) | Teams, pipelines, swarms |
