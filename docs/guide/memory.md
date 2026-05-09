---
title: Memory
description: Short-term conversation memory, long-term persistent memory, vector stores, and memory distillation.
outline: [2, 3]
---

# Memory

`@confused-ai/memory` provides three kinds of memory for agents:

| Kind | What it stores | Persistence |
|---|---|---|
| **Short-term** | Recent messages (sliding window) | In-process only |
| **Long-term** | Key/value facts, tagged entries | File, SQLite, Redis, Postgres |
| **Vector** | Semantic embeddings for similarity search | In-memory, Pinecone, Qdrant, pgvector |

## Short-term memory (conversation window)

By default agents use an in-memory session. To persist across restarts, use a session store (see [Session](/guide/session)).

To limit context size automatically, use `createSummaryBufferHook`:

```ts
import { agent } from 'confused-ai';
import { createSummaryBufferHook } from 'confused-ai/memory';

const summaryHook = createSummaryBufferHook({
  llm: myProvider,
  maxMessages: 20,   // keep last 20 messages
  keepLastN: 4,      // always keep the 4 most recent verbatim
});

const ai = agent({
  model: 'gpt-4o',
  hooks: { beforeStep: summaryHook },
});
```

When the message count exceeds `maxMessages`, older messages are replaced with an LLM-generated summary.

## Long-term memory store

```ts
import { InMemoryStore } from 'confused-ai/memory';

const store = new InMemoryStore({
  retentionDays: 30,    // auto-expire after 30 days
  maxShortTerm: 100,    // max short-term entries
});

// Store a memory
await store.store({
  type: 'long_term',
  content: "User prefers TypeScript over JavaScript",
  tags: ['preference', 'language'],
  userId: 'user-123',
});

// Retrieve recent memories
const memories = await store.getRecent(10, { userId: 'user-123' });

// Search by tags
const prefs = await store.getByTags(['preference'], { userId: 'user-123' });
```

## Let the agent manage its own memory

Give the agent `remember` and `recall` tools so it can decide what to store:

```ts
import { agent } from 'confused-ai';
import { InMemoryStore, createAgentMemoryTools } from 'confused-ai/memory';

const store = new InMemoryStore();
const { rememberTool, recallTool } = createAgentMemoryTools({ store });

const ai = agent({
  model: 'gpt-4o',
  systemPrompt: 'Use remember/recall tools to retain important information.',
  tools: [rememberTool, recallTool],
});
```

The LLM decides when to remember facts and recalls them when relevant.

## Vector memory (semantic search)

```ts
import { VectorMemoryStore, OpenAIEmbeddingProvider, InMemoryVectorStore } from 'confused-ai/memory';

const vectorMemory = new VectorMemoryStore({
  embedding: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  store: new InMemoryVectorStore(),
  topK: 5,
});

// Store a document
await vectorMemory.store({
  type: 'long_term',
  content: 'The capital of France is Paris.',
  tags: ['geography'],
});

// Semantic search
const results = await vectorMemory.search('What is the French capital?', 3);
```

## Production vector stores

Swap `InMemoryVectorStore` for a durable backend:

```ts
import { PineconeVectorStore, QdrantVectorStore, PgVectorStore } from 'confused-ai/memory';

// Pinecone
const pinecone = new PineconeVectorStore({
  apiKey: process.env.PINECONE_API_KEY!,
  index: 'my-agent-memory',
  namespace: 'prod',
});

// Qdrant
const qdrant = new QdrantVectorStore({
  url: 'http://localhost:6333',
  collection: 'agent_memory',
});

// pgvector (Postgres)
const pgvector = new PgVectorStore({
  connectionString: process.env.DATABASE_URL!,
  table: 'agent_embeddings',
  dimensions: 1536,
});
```

## Memory distillation

Compress large memory banks into concise summaries:

```ts
import { MemoryDistiller } from 'confused-ai/memory';

const distiller = new MemoryDistiller({
  llm: myProvider,
  maxMemories: 50,    // distill when store exceeds 50 items
  targetCount: 10,    // compress into ~10 key facts
});

await distiller.distill(store, { userId: 'user-123' });
```

## Database-backed memory

Use the built-in SQLite/Postgres store (no external deps):

```ts
import { createDbMemoryStore } from 'confused-ai/memory';

const store = createDbMemoryStore({
  url: 'file:./agent.db',  // SQLite
  // url: process.env.DATABASE_URL,  // Postgres
});
```
