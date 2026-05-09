---
title: RAG / Knowledge Base
description: Build knowledge bases with document loaders, vector stores, and semantic retrieval.
outline: [2, 3]
---

# RAG / Knowledge Base

`@confused-ai/knowledge` provides a `KnowledgeEngine` that loads documents, embeds them, stores them in a vector store, and injects relevant chunks into agent context automatically.

## Quick start

```ts
import { agent } from 'confused-ai';
import { KnowledgeEngine, loadUrl } from 'confused-ai/knowledge';
import { OpenAIEmbeddingProvider, InMemoryVectorStore } from 'confused-ai/memory';

// 1. Build the engine
const knowledge = new KnowledgeEngine({
  embedding: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  vectorStore: new InMemoryVectorStore(),
});

// 2. Load documents
const docs = await loadUrl('https://docs.myapp.com/api');
await knowledge.ingest(docs);

// 3. Attach to agent — retrieval happens automatically each run
const ai = agent({
  model: 'gpt-4o',
  systemPrompt: 'Answer questions using the provided documentation.',
  knowledgebase: knowledge,
});

const result = await ai.run({ prompt: 'How do I authenticate?' });
```

## Document loaders

### URL loader

```ts
import { loadUrl } from 'confused-ai/knowledge';

const docs = await loadUrl('https://example.com/docs', {
  timeout: 10_000,
  // allowedHosts: ['example.com'],  // SSRF guard
});
```

### PDF loader

```ts
import { loadPdf } from 'confused-ai/knowledge';

const docs = await loadPdf('./report.pdf');
// Returns one Document per page with page number in metadata
```

### CSV loader

```ts
import { loadCsv } from 'confused-ai/knowledge';

const docs = await loadCsv('./products.csv', {
  contentColumns: ['name', 'description'],
  metadataColumns: ['sku', 'category'],
  delimiter: ',',
});
```

### Plain text / custom documents

```ts
import type { Document } from 'confused-ai/knowledge';

const docs: Document[] = [
  {
    id: 'doc-1',
    content: 'Our refund policy allows returns within 30 days.',
    metadata: { source: 'policy.txt', section: 'returns' },
  },
];

await knowledge.ingest(docs);
```

## Vector store adapters

### In-memory (development)

```ts
import { InMemoryVectorStore } from 'confused-ai/memory';
const store = new InMemoryVectorStore();
```

### Pinecone

```ts
import { PineconeVectorStore } from 'confused-ai/memory';

const store = new PineconeVectorStore({
  apiKey: process.env.PINECONE_API_KEY!,
  index: 'my-knowledge-base',
  namespace: 'prod',
});
```

### Qdrant

```ts
import { QdrantVectorStore } from 'confused-ai/memory';

const store = new QdrantVectorStore({
  url: 'http://localhost:6333',
  collection: 'knowledge',
  dimension: 1536,
});
```

### pgvector (Postgres)

```ts
import { PgvectorKnowledgeAdapter } from 'confused-ai/knowledge';

const store = new PgvectorKnowledgeAdapter({
  connectionString: process.env.DATABASE_URL!,
  table: 'knowledge_embeddings',
});
```

### ChromaDB

```ts
import { ChromaKnowledgeAdapter } from 'confused-ai/knowledge';

const store = new ChromaKnowledgeAdapter({
  url: 'http://localhost:8000',
  collection: 'my-docs',
});
```

### Neo4j (graph + vector)

```ts
import { Neo4jKnowledgeAdapter } from 'confused-ai/knowledge';

const store = new Neo4jKnowledgeAdapter({
  url: 'bolt://localhost:7687',
  username: 'neo4j',
  password: process.env.NEO4J_PASSWORD!,
  indexName: 'knowledge',
});
```

### Database-backed (SQLite/Postgres built-in)

```ts
import { createDbKnowledgeEngine } from 'confused-ai/knowledge';

const knowledge = createDbKnowledgeEngine({
  url: 'file:./knowledge.db',  // SQLite — zero deps
  // url: process.env.DATABASE_URL,  // Postgres
  embedding: myEmbeddingProvider,
});
```

## Manual querying

```ts
// Query the knowledge base directly
const results = await knowledge.query('refund policy', { topK: 5 });

results.forEach(r => {
  console.log(`[${r.score.toFixed(3)}] ${r.document.content.slice(0, 100)}`);
});
```

## Embedding providers

```ts
import { OpenAIEmbeddingProvider } from 'confused-ai/memory';

// OpenAI
const embedding = new OpenAIEmbeddingProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'text-embedding-3-small',  // or text-embedding-3-large
  dimensions: 1536,
});
```

## Embedding cache

Avoid re-embedding the same text repeatedly:

```ts
import { withEmbeddingCache } from 'confused-ai/knowledge';

const cachedEngine = withEmbeddingCache(knowledge, {
  maxSize: 10_000,
  ttlMs: 3_600_000,  // 1 hour
});
```
