# 06 · Persistent Memory 🟡

By default agents are stateless — each `.run()` call starts fresh. Memory lets
agents remember users, past conversations, and learned facts — even across
server restarts.

## What you'll learn

- Short-term (session) memory — remember the current conversation
- Long-term memory — remember facts across sessions
- How to scope memory per user

## The two types of memory

| Type | Lives | Use for |
|---|---|---|
| **Session** | Current conversation | Multi-turn chat, context tracking |
| **Long-term** | Forever (persisted) | User preferences, past interactions |

## Code

```ts
// memory-agent.ts
import { createAgent } from 'fluxion';
import { InMemoryStore } from 'fluxion/memory';
import { createStorage } from 'fluxion/storage';

// ── Long-term memory store ─────────────────────────────────────────────────
// Use FileStorageAdapter to persist across restarts
const storage = createStorage({
  type: 'file',
  path: './data/memory.json',
});

const longTermMemory = new InMemoryStore({ storage });
await longTermMemory.load(); // restore from disk

// ── Create the agent ──────────────────────────────────────────────────────
const agent = createAgent({
  name: 'memory-agent',
  model: 'gpt-4o-mini',
  instructions: `
    You are a personal assistant that remembers things about users.
    When you learn something new about a user, store it.
    Always greet users by name if you know it.
  `,
  memory: longTermMemory,
  sessionStore: new InMemoryStore(),  // per-conversation context
});

// ── First conversation ─────────────────────────────────────────────────────
const userId = 'user_42';

await agent.run("My name is Alice and I prefer dark mode.", { userId });
// Agent stores: { name: 'Alice', preference: 'dark mode' }

await agent.run("I'm vegetarian and I live in Berlin.", { userId });
// Agent stores: { diet: 'vegetarian', location: 'Berlin' }

// ── Later conversation (new session, same userId) ──────────────────────────
const result = await agent.run("Recommend a restaurant near me.", { userId });
console.log(result.text);
// → "Since you're vegetarian and based in Berlin, here are some great options..."
```

## Manual memory operations

```ts
// Store a fact directly
await longTermMemory.set(`${userId}:name`, 'Alice');
await longTermMemory.set(`${userId}:diet`, 'vegetarian');

// Read a fact
const name = await longTermMemory.get(`${userId}:name`);
console.log(name); // 'Alice'

// List all keys for a user
const keys = await longTermMemory.keys(`${userId}:*`);
console.log(keys); // ['user_42:name', 'user_42:diet', ...]

// Delete a fact
await longTermMemory.delete(`${userId}:diet`);

// Clear everything for a user (e.g., GDPR deletion)
for (const key of keys) {
  await longTermMemory.delete(key);
}
```

## Summarize long conversations

For very long conversations, summarize older messages instead of keeping all of them:

```ts
const agent = createAgent({
  model: 'gpt-4o-mini',
  sessionStore: new InMemoryStore(),
  maxSessionTokens: 4000,     // when session exceeds this...
  sessionSummarize: true,     // ...auto-summarize older messages
  sessionSummaryModel: 'gpt-4o-mini',
});
```

## Scoped memory per user (multi-tenant)

```ts
// Each user gets their own isolated memory namespace
function createUserAgent(userId: string) {
  return createAgent({
    name: `agent-${userId}`,
    model: 'gpt-4o-mini',
    instructions: 'You are a personal assistant.',
    memory: longTermMemory,
    memoryNamespace: userId,  // ← all keys auto-prefixed with userId
  });
}

const agentForAlice = createUserAgent('alice');
const agentForBob   = createUserAgent('bob');
// Alice's memories never leak to Bob
```

## Vector memory (semantic search)

When you have thousands of memories, use vector search instead of key-value lookup:

```ts
import { InMemoryVectorStore } from 'fluxion/memory';
import { OpenAIEmbeddingProvider } from 'fluxion/memory';

const agent = createAgent({
  model: 'gpt-4o-mini',
  vectorMemory: new InMemoryVectorStore(),
  embeddingProvider: new OpenAIEmbeddingProvider({
    apiKey: process.env.OPENAI_API_KEY!,
  }),
  vectorMemoryTopK: 5,  // recall top 5 relevant memories
});

// Agent automatically embeds + stores every conversation turn
// and retrieves semantically similar past context
```

## What's next?

- [07 · Storage Patterns](./07-storage) — store anything with a unified API
- [11 · Customer Support Bot](./11-support-bot) — memory in a full production bot
