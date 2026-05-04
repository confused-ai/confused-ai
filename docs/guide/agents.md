# Creating Agents

confused-ai provides **five ways** to create an agent — from zero-config to full control.

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
