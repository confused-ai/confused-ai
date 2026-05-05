---
title: Creating Agents
description: Five APIs for creating agents — from zero-config agent() to full-control bare(). Every option documented with real examples.
outline: [2, 3]
---

# Creating Agents

confused-ai provides **five APIs** for creating agents — from zero-config convenience to bare-metal control. All five implement the same `run()` / `stream()` interface so they're interchangeable.

| API | Best for |
|-----|---------|
| `agent()` | Default — auto-resolves LLM from env, safe defaults |
| `defineAgent()` | Composable fluent builder — reusable, chainable |
| `createAgent()` | Explicit factory — same as `agent()`, no magic |
| `bare()` | Zero defaults — you supply everything |
| `class Agent` | Advanced subclassing |

---

## 1. `agent()` — recommended

The highest-level API. Reads LLM from env, wires defaults (session, tools, guardrails), returns a fully configured agent.

```ts
import { agent } from 'confused-ai';

const ai = agent({
  name:         'SupportBot',
  model:        'gpt-4o-mini',   // OPENAI_API_KEY read from env
  instructions: 'You are a helpful support agent.',

  // Tools (optional — defaults to [HttpClientTool, BrowserTool])
  tools: [myTool, anotherTool],  // or: tools: false for no tools

  // Data
  sessionStore:  createSqliteSessionStore('./sessions.db'),
  knowledgebase: myKnowledgeEngine,
  memoryStore:   new VectorMemoryStore({ ... }),

  // Safety
  guardrails: myGuardrailEngine,   // or: guardrails: false

  // Limits
  maxSteps:  15,
  timeoutMs: 90_000,
});

// Basic run
const result = await ai.run('How do I reset my password?');
console.log(result.text);

// Streaming
for await (const chunk of ai.stream('Walk me through the setup steps')) {
  process.stdout.write(chunk);
}

// With session continuity
await ai.run('My account email is alice@example.com', { sessionId: 'alice-42' });
const r2 = await ai.run('What is my email?', { sessionId: 'alice-42' });
// r2.text → "Your email is alice@example.com."
```

### `run()` options

```ts
await ai.run('prompt', {
  sessionId:  'user-42',          // session persistence key
  runId:      'run-abc123',       // idempotency / tracing
  onChunk:    (chunk) => { ... }, // streaming callback
  signal:     abortController.signal, // cancellation
});
```

---

## 2. `defineAgent()` — fluent builder

Composable, chainable. Ideal for reusable agent definitions shared across a codebase.

```ts
import { defineAgent } from 'confused-ai';
import { createSqliteCheckpointStore } from 'confused-ai/guard';
import { createAdapterRegistry } from 'confused-ai/adapters';

const reviewBot = defineAgent()
  .name('ReviewBot')
  .instructions('You are a senior TypeScript engineer. Review code for correctness, performance, and security.')
  .model('gpt-4o')
  .tools([fetchFileTool, postCommentTool])
  .withSession()                        // in-memory; pass store for SQLite/Redis
  .withGuardrails(contentGuardrails)
  .hooks({
    beforeRun: async (prompt) => {
      console.log('[ReviewBot] Starting review:', prompt.slice(0, 80));
      return prompt;
    },
    afterRun: async (result) => {
      await metrics.record('review.completed', { steps: result.steps });
      return result;
    },
  })
  .budget({
    maxUsdPerRun:   0.50,   // hard limit per single run
    maxUsdPerUser:  10.00,  // cumulative per user
    onExceeded:     'throw',
  })
  .checkpoint(createSqliteCheckpointStore('./checkpoints.db'))
  .adapters(createAdapterRegistry())
  .use(loggingPlugin)                   // tool middleware, stackable
  .dev()                                // console logging in development
  .build();

const result = await reviewBot.run('Review PR #456', { runId: 'pr-456' });
```

### Full builder reference

| Method | Type | Description |
|--------|------|-------------|
| `.name(s)` | `string` | Agent name |
| `.instructions(s)` | `string` | System prompt (required) |
| `.model(s)` | `string \| string[]` | Model ID, shorthand, or fallback chain |
| `.apiKey(s)` | `string` | Override provider API key |
| `.baseURL(s)` | `string` | Override base URL (e.g. Ollama, Azure) |
| `.tools(arr)` | `Tool[] \| false` | Tools list or `false` to disable |
| `.withSession(store?)` | `SessionStore?` | Enable session; omit for in-memory |
| `.withGuardrails(g)` | `GuardrailEngine` | Attach guardrail engine |
| `.hooks(hooks)` | `AgentHooks` | Lifecycle hooks |
| `.budget(cfg)` | `BudgetConfig` | USD spend caps |
| `.checkpoint(store)` | `CheckpointStore` | Crash-recovery checkpoints |
| `.adapters(registry)` | `AdapterRegistry` | Infrastructure adapters |
| `.use(middleware)` | `ToolMiddleware` | Add tool middleware (stackable) |
| `.noDefaults()` | — | Skip all framework defaults |
| `.dev()` | — | Verbose console logging |
| `.build()` | — | Returns `Agent` instance |

---

## 3. `createAgent()` — explicit factory

Same as `agent()` but with a more explicit name — useful when `agent` conflicts with a local variable.

```ts
import { createAgent } from 'confused-ai';

const myAgent = createAgent({
  name:         'Analyst',
  model:        'gpt-4o',
  instructions: 'Analyse financial data and produce structured reports.',
  tools:        [fetchDataTool, chartTool],
});

const result = await myAgent.run('Analyse Q1 2026 revenue trends');
```

---

## 4. `bare()` — zero defaults

No env auto-detection, no default tools, no session, no memory. You wire everything explicitly. Use when you need complete control — or when embedding the agent in a framework with its own lifecycle.

```ts
import { bare } from 'confused-ai';
import { OpenAIProvider } from 'confused-ai/model';

const llm = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model:  'gpt-4o',
});

const rawAgent = bare({
  llm,
  instructions: 'You are a raw agent.',
  // tools, session, memory — all opt-in from here
});
```

---

## 5. Extend `Agent`

For advanced use cases — custom pre/post-processing, domain-specific `run()` overrides:

```ts
import { Agent } from 'confused-ai';

class AuditedAgent extends Agent {
  async run(input: string, opts = {}) {
    await auditLog.record({ agentName: this.name, input });
    const result = await super.run(input, opts);
    await auditLog.record({ agentName: this.name, output: result.text });
    return result;
  }
}
```

---

## Disable subsystems

Escape hatch any default with `false`:

```ts
const ai = agent({
  model:        'gpt-4o',
  instructions: '...',
  tools:        false,         // pure LLM, no tool loop
  sessionStore: false,         // stateless
  guardrails:   false,         // no guardrails
  memory:       false,         // no memory injection
});
```

---

## Model shorthand reference

```ts
// OpenAI
model: 'gpt-4o'                         // reads OPENAI_API_KEY
model: 'gpt-4o-mini'
model: 'o1-mini'
model: 'o3-mini'

// Anthropic
model: 'claude-opus-4-5'                // reads ANTHROPIC_API_KEY
model: 'claude-3-5-haiku'

// Google
model: 'gemini-2.0-flash'               // reads GOOGLE_API_KEY
model: 'gemini-1.5-pro'

// OpenRouter (gateway to 100+ models)
model: 'openrouter/meta-llama/llama-3.3-70b-instruct'

// Fallback chain — tries left to right on failure
model: ['gpt-4o', 'claude-opus-4-5', 'gemini-2.0-flash']
```

---

## `AgenticRunResult` shape

Every `run()` returns the same interface regardless of which API you used:

```ts
interface AgenticRunResult {
  text:    string;              // final assistant response
  markdown: {
    name:     string;           // "response-<runId>.md"
    content:  string;
    mimeType: 'text/markdown';
    type:     'markdown';
  };
  structuredOutput?: unknown;   // set when responseModel is used
  messages:     Message[];      // full conversation
  steps:        number;         // LLM steps taken
  finishReason: 'stop' | 'max_steps' | 'timeout' | 'error'
                | 'human_rejected' | 'aborted';
  usage?: {
    promptTokens?:     number;
    completionTokens?: number;
    totalTokens?:      number;
  };
  runId?:   string;
  traceId?: string;
}
```

---

## 1. `agent()` — recommended default

The highest-level API. Sane defaults, full option surface.

```ts
import { agent } from 'confused-ai';

const myAgent = agent({
  name: 'MyAssistant',
  model: 'gpt-4o-mini',                         // or 'claude-3-haiku', 'gemini-flash'
  instructions: 'You are a helpful assistant.',
  tools: [...],
  memoryStore: myMemoryStore,
  sessionStore: mySessionStore,
  knowledgebase: myKnowledge,
  guardrails: myGuardrailEngine,     // GuardrailEngine | false
  maxSteps: 10,
});

const result = await myAgent.run('Hello!');
console.log(result.text);

// Stream chunks as they arrive
for await (const chunk of myAgent.stream('Hello!')) {
  process.stdout.write(chunk);
}
```

### Run options

```ts
const result = await myAgent.run('Do something complex', {
  sessionId: 'user-123',
  onChunk: (chunk) => process.stdout.write(chunk),
});

// Or use stream() for the same effect as an async iterable
for await (const chunk of myAgent.stream('Do something complex', { sessionId: 'user-123' })) {
  process.stdout.write(chunk);
}
```
```

---

## 2. `defineAgent()` — composable, chainable

Use when you want a reusable agent definition you can share and extend.
The fluent builder exposes every option as a chainable method.

```ts
import { defineAgent } from 'confused-ai';
import { createSqliteCheckpointStore } from 'confused-ai/production';
import { createAdapterRegistry, RedisAdapter } from 'confused-ai/adapters';

const myAgent = defineAgent()
  .name('MyAssistant')
  .instructions('You are a senior engineer.')
  .model('gpt-4o')
  .tools([myTool])
  .withSession()               // in-memory session (pass a store for SQLite/Redis)
  .withGuardrails(guardrails)  // optional
  .hooks({
    beforeRun: async (prompt) => { console.log('Starting run:', prompt); return prompt; },
    afterRun:  async (result) => { console.log('Done. Steps:', result.steps); return result; },
  })
  .budget({ maxUsdPerRun: 0.50, maxUsdPerUser: 10.00, onExceeded: 'throw' })
  .checkpoint(createSqliteCheckpointStore('./agent.db'))
  .adapters(createAdapterRegistry().register(new RedisAdapter({ url: process.env.REDIS_URL! })))
  .use(loggingMiddleware)      // tool middleware
  .dev()                       // console logging + tool visibility
  .build();

const result = await myAgent.run('Review this PR', { runId: 'pr-456' });
```

### Available builder methods

| Method | Description |
|--------|-------------|
| `.name(s)` | Agent name |
| `.instructions(s)` | System prompt (required) |
| `.model(s)` | Model id or `"provider:model"` |
| `.apiKey(s)` | Override API key |
| `.baseURL(s)` | Override base URL (e.g. Ollama) |
| `.tools(arr)` | Tools array, registry, or `false` for no tools |
| `.withSession(store?)` | Enable session; pass store or omit for in-memory |
| `.withGuardrails(engine)` | Attach guardrails |
| `.hooks(hooks)` | Lifecycle hooks |
| `.budget(config)` | USD spend caps per run / user / month |
| `.checkpoint(store)` | Durable checkpoint store for crash recovery |
| `.adapters(registry)` | Adapter registry or explicit bindings |
| `.use(middleware)` | Add tool middleware (stackable) |
| `.noDefaults()` | Skip all framework defaults |
| `.dev()` | Console + tool logging |
```

---

## 3. `createAgent()` — factory API

```ts
import { createAgent } from 'confused-ai';

const myAgent = createAgent({
  model: 'gpt-4o',
  instructions: '...',
  tools: [...],
});
```

---

## 4. `bare()` — zero defaults

Full control, zero magic. You're responsible for everything.

```ts
import { bare } from 'confused-ai';
import { OpenAIProvider } from 'confused-ai/model';

// bare() requires an explicit LLMProvider — it never auto-resolves from env
const llm = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o' });

const rawAgent = bare({
  llm,
  instructions: 'You are a raw agent.',
  // No memory, no session, no guardrails, no telemetry
  // Everything is opt-in
});
```

---

## 5. Extending `Agent`

For advanced cases, extend the base class directly:

```ts
import { Agent } from 'confused-ai';

class MyCustomAgent extends Agent {
  async run(input: string, opts = {}) {
    // pre-processing
    const result = await super.run(input, opts);
    // post-processing
    return result;
  }
}
```

---

## Escape hatches

Disable any subsystem you don't need:

```ts
const agent = defineAgent({
  model: 'gpt-4o',
  instructions: '...',
  tools: false,         // no tool loop
  sessionStore: false,  // no session persistence
  guardrails: false,    // no guardrails
  memory: false,        // no memory
});
```

---

## Model shortcuts

Any LLM provider, no config changes:

```ts
// OpenAI
model: 'gpt-4o'
model: 'gpt-4o-mini'
model: 'o1-mini'

// Anthropic
model: 'claude-3-5-sonnet-latest'
model: 'claude-3-haiku-20240307'

// Google
model: 'gemini-2.0-flash-exp'
model: 'gemini-1.5-pro'

// OpenRouter (any model via a single API)
model: 'openrouter/meta-llama/llama-3.3-70b-instruct'

// Fallback chain — auto-failover
model: ['gpt-4o', 'claude-3-5-sonnet-latest', 'gemini-2.0-flash-exp']
```

---

## Parallel tool execution

When an LLM step requests multiple tools at once, the runner dispatches all of them **in parallel** via `Promise.all`. This means a step with 4 tool calls takes as long as the slowest single tool — not the sum.

```ts
// Agent with 3 tools — if the LLM asks for all 3 in one step,
// they run concurrently with no extra configuration
const ai = agent({
  model: 'gpt-4o',
  instructions: 'Research assistant.',
  tools: [new TavilySearchTool({ apiKey }), new HttpClientTool(), new WikipediaSearchTool()],
});

// If the LLM emits:
//   tool_call: tavilySearch("TypeScript 5.7")
//   tool_call: httpGet("https://devblogs.microsoft.com/typescript")
//   tool_call: wikipediaSearch("TypeScript")
// …all three fire in parallel. Wall-clock = max(t₁, t₂, t₃)
const result = await ai.run('Compare TypeScript 5.7 with the Wikipedia summary');
```

::: tip
Parallel dispatch happens automatically — no `parallel: true` flag needed. Each tool call still runs through its own guardrail checks, HITL approval, and lifecycle hooks before and after execution.
:::
