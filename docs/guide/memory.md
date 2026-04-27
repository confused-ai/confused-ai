# Memory

Memory lets agents remember context across turns and recall semantically related information from past interactions.

> **New:** Use a `MemoryStoreAdapter` (via `memoryStoreAdapter`) to plug any vector backend into the memory layer. See the [Adapters guide](./adapters.md).

## Types of memory

| Type | Module | Best for |
|------|--------|----------|
| `InMemoryStore` | `confused-ai/memory` | Simple turn-by-turn conversation history |
| `VectorMemoryStore` | `confused-ai/memory` | Semantic recall — "remember things like this" |
| Session stores | `confused-ai/session` | Long-lived user sessions across restarts |

---

## InMemoryStore

Simple, fast, in-process. Best for short conversations.

```ts
import { InMemoryStore } from 'confused-ai/memory';
// or: import { InMemoryStore } from 'confused-ai';

const memory = new InMemoryStore();

const myAgent = agent({
  model: 'gpt-4o-mini',
  instructions: 'You are a helpful assistant.',
  memoryStore: memory,
});

// Messages are persisted within the run session
await myAgent.run('My name is Alice.', { sessionId: 'alice-session' });
const r2 = await myAgent.run('What is my name?', { sessionId: 'alice-session' });
console.log(r2.text); // "Your name is Alice."
```

---

## VectorMemoryStore

Enables semantic long-term memory — store anything and recall the most relevant context.

```ts
import { VectorMemoryStore } from 'confused-ai/memory';
import { OpenAIEmbeddingProvider, InMemoryVectorStore } from 'confused-ai/memory';

const vectorMemory = new VectorMemoryStore({
  embeddingProvider: new OpenAIEmbeddingProvider({
    apiKey: process.env.OPENAI_API_KEY!,
  }),
  vectorStore: new InMemoryVectorStore(),
  topK: 5, // how many memories to inject into each prompt
});

// Memories are added automatically as the agent runs
const myAgent = agent({
  model: 'gpt-4o',
  instructions: 'You are a personal assistant with long-term memory.',
  memory: vectorMemory,
});

// After several runs, the agent recalls relevant past context
await myAgent.run('I prefer dark mode and use TypeScript.', { sessionId: 'bob' });
await myAgent.run('How should I set up my editor?', { sessionId: 'bob' });
// Agent recalls the dark mode preference and TypeScript context
```

---

## OpenAIEmbeddingProvider

Used by `VectorMemoryStore` and `KnowledgeEngine` alike:

```ts
import { OpenAIEmbeddingProvider } from 'confused-ai/memory';

const embedder = new OpenAIEmbeddingProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'text-embedding-3-small', // default
  dimensions: 1536,                // optional
  batchSize: 100,                  // optional, default: 100
});

// Embed a single text
const vector = await embedder.embed('Hello, world!');

// Embed multiple texts in one batch
const vectors = await embedder.embedBatch(['Hello', 'World']);
```

---

## InMemoryVectorStore

In-process vector store using cosine similarity. No external DB required.

```ts
import { InMemoryVectorStore } from 'confused-ai/memory';

const vs = new InMemoryVectorStore();

await vs.upsert('doc-1', [0.1, 0.2, 0.3], { content: 'Hello world' });
await vs.upsert('doc-2', [0.4, 0.5, 0.6], { content: 'Goodbye world' });

const results = await vs.query([0.1, 0.2, 0.3], 2);
// [{ id: 'doc-1', score: 1.0, metadata: { content: 'Hello world' } }, ...]
```

---

## Production vector stores

For production workloads, replace `InMemoryVectorStore` with a persistent vector database.

### Pinecone

```ts
import { VectorMemoryStore, PineconeVectorStore } from 'confused-ai/memory';
import { OpenAIEmbeddingProvider } from 'confused-ai/model';

const vectorMemory = new VectorMemoryStore({
  embeddingProvider: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  vectorStore: new PineconeVectorStore({
    apiKey: process.env.PINECONE_API_KEY!,
    indexName: 'agent-memory',
    namespace: 'user-sessions',
  }),
  topK: 5,
});
```

Requires Pinecone's official SDK (`npm install @pinecone-database/pinecone`).

### Qdrant

```ts
import { QdrantVectorStore } from 'confused-ai/memory';

const store = new QdrantVectorStore({
  url: process.env.QDRANT_URL!, // e.g. 'http://localhost:6333'
  collectionName: 'agent-memory',
  // apiKey: process.env.QDRANT_API_KEY, // for Qdrant Cloud
});
```

### pgvector (PostgreSQL)

```ts
import { PgVectorStore } from 'confused-ai/memory';
import type { PgPool } from 'confused-ai/memory';

// Pass any pg-compatible pool
const store = new PgVectorStore({
  pool: pgPool as PgPool,
  tableName: 'agent_embeddings', // default: 'embeddings'
  dimensions: 1536,
});
```

Requires `pg` and the `pgvector` PostgreSQL extension.

### Summary

| Store | Package | Best for |
|-------|---------|----------|
| `InMemoryVectorStore` | built-in | Dev / testing |
| `PineconeVectorStore` | `@pinecone-database/pinecone` | Managed, scale-out |
| `QdrantVectorStore` | self-hosted or Qdrant Cloud | Open source, on-prem |
| `PgVectorStore` | `pg` + pgvector | Existing Postgres infra |

---

## Custom memory store

Implement the `MemoryStore` interface to use any external database:

```ts
import type { MemoryStore } from 'confused-ai/memory';

class PostgresMemoryStore implements MemoryStore {
  async save(sessionId: string, messages: Message[]): Promise<void> {
    await db.query(
      'INSERT INTO memories (session_id, messages) VALUES ($1, $2) ON CONFLICT (session_id) DO UPDATE SET messages = $2',
      [sessionId, JSON.stringify(messages)]
    );
  }

  async load(sessionId: string): Promise<Message[]> {
    const row = await db.query('SELECT messages FROM memories WHERE session_id = $1', [sessionId]);
    return row ? JSON.parse(row.messages) : [];
  }

  async delete(sessionId: string): Promise<void> {
    await db.query('DELETE FROM memories WHERE session_id = $1', [sessionId]);
  }
}
```

---

## Session stores

For persistence across process restarts, use session stores — see [Session Management](/guide/session).

```ts
import { createSqliteSessionStore } from 'confused-ai/session';

const sessions = createSqliteSessionStore('./data/sessions.db');

const myAgent = agent({
  model: 'gpt-4o',
  instructions: '...',
  sessionStore: sessions,
});
```
