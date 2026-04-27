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
  ragEngine: myKnowledge,
  guardrails: myGuardrailEngine,     // GuardrailEngine | false
  maxSteps: 10,
});

const result = await myAgent.run('Hello!');
console.log(result.text);
```

### Run options

```ts
const result = await myAgent.run('Do something complex', {
  sessionId: 'user-123',
  metadata: { userId: 'user-123', plan: 'pro' },
  maxSteps: 20,
  stream: true,
  onChunk: (chunk) => process.stdout.write(chunk),
});
```

---

## 2. `defineAgent()` — composable, chainable

Use when you want a reusable agent definition you can share and extend.

```ts
import { defineAgent } from 'confused-ai';

const baseAgent = defineAgent({
  model: 'gpt-4o',
  instructions: 'You are a senior engineer.',
})
  .use(loggingPlugin)        // attach plugins
  .hooks({                   // attach lifecycle hooks
    beforeRun: async (prompt) => { console.log('Starting run:', prompt); return prompt; },
    afterRun:  async (result) => { console.log('Done. Steps:', result.steps); return result; },
  });

// Create a specialized variant
const debugAgent = defineAgent({
  ...baseAgent.config,
  instructions: 'You are a debugging expert.',
}).noDefaults();            // skip framework defaults (session, guardrails, etc.)
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
