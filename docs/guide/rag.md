---
title: RAG & Knowledge
description: KnowledgeEngine, document loaders (Text, JSON, CSV, URL), vector stores, and semantic retrieval — grounded agents in minutes.
outline: [2, 3]
---

# RAG & Knowledge

The `KnowledgeEngine` indexes your documents into a vector store and automatically retrieves relevant context before each LLM call. Attach it to any agent with a single option.

---

## Quick start

```ts
import { agent } from 'confused-ai';
import { KnowledgeEngine, InMemoryVectorStore, TextLoader } from 'confused-ai/knowledge';
import { readFileSync } from 'fs';

// 1. Load and index your documents
const knowledge = new KnowledgeEngine({
  vectorStore: new InMemoryVectorStore(),
  chunkSize:   500,
  overlap:     50,
});

await knowledge.load(new TextLoader([
  { id: 'handbook', content: readFileSync('./docs/employee-handbook.txt', 'utf8') },
  { id: 'policy',   content: readFileSync('./docs/expense-policy.txt', 'utf8') },
]));

// 2. Attach to an agent
const hr = agent({
  model:        'gpt-4o',
  instructions: 'You are an HR assistant. Use the provided context to answer questions.',
  knowledge,
});

const result = await hr.run('What is the reimbursement limit for team lunches?');
console.log(result.text);
```

---

## Document loaders

| Loader | Use case |
|--------|---------|
| `TextLoader` | Plain text files |
| `JSONLoader` | JSON arrays / objects |
| `CSVLoader` | Tabular CSV data |
| `URLLoader` | Fetch & extract web pages |

### `TextLoader`

```ts
import { TextLoader } from 'confused-ai/knowledge';

const loader = new TextLoader([
  { id: 'readme',  content: readFileSync('./README.md', 'utf8') },
  { id: 'license', content: readFileSync('./LICENSE', 'utf8') },
]);
await knowledge.load(loader);
```

### `JSONLoader`

```ts
import { JSONLoader } from 'confused-ai/knowledge';

const loader = new JSONLoader(
  [{ title: 'Page 1', body: 'Content...' }],
  { textFields: ['title', 'body'] }
);
await knowledge.load(loader);
```

### `CSVLoader`

```ts
import { CSVLoader } from 'confused-ai/knowledge';

const loader = new CSVLoader(readFileSync('./products.csv', 'utf8'), {
  textColumns: ['name', 'description'],
  metaColumns: ['sku', 'price'],
});
await knowledge.load(loader);
```

### `URLLoader`

```ts
import { URLLoader } from 'confused-ai/knowledge';

const loader = new URLLoader([
  'https://docs.example.com/api',
  'https://docs.example.com/guide',
]);
await knowledge.load(loader);
```

---

## Vector stores

| Store | Class | Notes |
|-------|-------|-------|
| In-memory | `InMemoryVectorStore` | Dev / testing — not persistent |
| Pinecone | `PineconeVectorStore` | Cloud-hosted, serverless |
| Qdrant | `QdrantVectorStore` | Self-hosted or cloud |
| pgvector | `PgVectorStore` | PostgreSQL extension |

### Pinecone

```ts
import { PineconeVectorStore } from 'confused-ai/knowledge';

const vectorStore = new PineconeVectorStore({
  apiKey:    process.env.PINECONE_API_KEY!,
  indexName: 'my-knowledge-base',
});
```

### Qdrant

```ts
import { QdrantVectorStore } from 'confused-ai/knowledge';

const vectorStore = new QdrantVectorStore({
  url:            'http://localhost:6333',
  collectionName: 'knowledge',
  apiKey:         process.env.QDRANT_API_KEY,
});
```

### pgvector

```ts
import { PgVectorStore } from 'confused-ai/knowledge';

const vectorStore = new PgVectorStore({
  connectionString: process.env.DATABASE_URL!,
  tableName:        'knowledge_embeddings',
});
```

---

## Custom embeddings

By default, `KnowledgeEngine` uses OpenAI `text-embedding-3-small`. Swap to any provider:

```ts
import { KnowledgeEngine, OpenAIEmbeddingProvider } from 'confused-ai/knowledge';

const knowledge = new KnowledgeEngine({
  vectorStore:       new InMemoryVectorStore(),
  embeddingProvider: new OpenAIEmbeddingProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    model:  'text-embedding-3-large',
  }),
});
```

---

## Manual retrieval

Query chunks outside an agent run:

```ts
const results = await knowledge.search('expense reimbursement policy', { topK: 5 });

for (const doc of results) {
  console.log(doc.id);       // 'policy'
  console.log(doc.content);  // matching chunk text
  console.log(doc.score);    // cosine similarity 0–1
  console.log(doc.metadata); // source metadata
}
```

---

## `KnowledgeEngine` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `vectorStore` | `VectorStore` | required | Where to store/query embeddings |
| `embeddingProvider` | `EmbeddingProvider` | OpenAI | Embedding model |
| `chunkSize` | `number` | `500` | Characters per chunk |
| `overlap` | `number` | `50` | Character overlap between chunks |
| `topK` | `number` | `5` | Chunks to retrieve per run |
| `minScore` | `number` | `0` | Minimum cosine similarity threshold |

> **New:** Use a `RagAdapter` (via `ragAdapter`) to plug any RAG pipeline — Pinecone, Qdrant, OpenSearch, or your own — without configuring the full `KnowledgeEngine`. See the [Adapters guide](./adapters.md).

## Quick setup

```ts
import {
  KnowledgeEngine,
  InMemoryVectorStore,
  TextLoader,
} from 'confused-ai/knowledge';
import { OpenAIEmbeddingProvider } from 'confused-ai/memory';
// or: import { ... } from 'confused-ai';

const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'text-embedding-3-small', // optional, this is the default
  }),
  vectorStore: new InMemoryVectorStore(),
});

// Ingest documents
await knowledge.ingest([
  { id: 'doc-1', content: 'confused-ai is a TypeScript framework for production AI agents.' },
  { id: 'doc-2', content: 'It supports RAG, multi-agent orchestration, and lifecycle hooks.' },
]);

// Query
const results = await knowledge.query('What does confused-ai support?', { topK: 3 });
// results: [{ id, content, score, metadata }]
```

## Document loaders

Load content from files, URLs, or any source:

```ts
import {
  TextLoader,
  JSONLoader,
  CSVLoader,
  URLLoader,
} from 'confused-ai/knowledge';

// Plain text / markdown files
const textDocs = await new TextLoader('./docs/').load();

// JSON files
const jsonDocs = await new JSONLoader('./data/products.json', {
  textField: 'description', // which field to embed
}).load();

// CSV files
const csvDocs = await new CSVLoader('./data/faq.csv', {
  textColumn: 'answer',
}).load();

// Fetch a URL
const webDocs = await new URLLoader('https://example.com/docs').load();

// Ingest all at once
await knowledge.ingest([...textDocs, ...jsonDocs, ...csvDocs, ...webDocs]);
```

## Attaching to an agent

```ts
import { agent } from 'confused-ai';

const ragAgent = agent({
  model: 'gpt-4o-mini',
  instructions: `
    You are a documentation assistant.
    Use the knowledge base to answer questions.
    Always cite document IDs when you reference content.
  `,
  knowledgebase: knowledge,
  tools: [], // Disable default tools (web fetching) to strictly rely on the knowledgebase
});

const answer = await ragAgent.run('How do I add lifecycle hooks?');
console.log(answer.text);
```

## Hybrid search

The engine supports keyword + semantic hybrid search when you implement `HybridSearchProvider`:

```ts
import type { HybridSearchProvider } from 'confused-ai/knowledge';

class MyHybridSearch implements HybridSearchProvider {
  async search(query: string, topK: number) {
    // combine BM25 keyword results with your vector results
    return combinedResults;
  }
}

const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider({ apiKey }),
  vectorStore: new InMemoryVectorStore(),
  hybridSearch: new MyHybridSearch(),
});
```

## Reranking

Add a reranker to improve result precision:

```ts
import type { RerankerProvider } from 'confused-ai/knowledge';

class CohereReranker implements RerankerProvider {
  async rerank(query: string, results: RAGChunk[], topN: number) {
    // call Cohere rerank API
    return rerankedResults;
  }
}

const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider({ apiKey }),
  vectorStore: new InMemoryVectorStore(),
  reranker: new CohereReranker(),
});
```

## Custom vector store

Implement `VectorStore` to use Pinecone, Weaviate, Qdrant, pgvector, etc.:

```ts
import type { VectorStore } from 'confused-ai/memory';

class PineconeVectorStore implements VectorStore {
  async upsert(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void> {
    await pinecone.upsert([{ id, values: embedding, metadata }]);
  }

  async query(embedding: number[], topK: number): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
    const results = await pinecone.query({ vector: embedding, topK });
    return results.matches.map(m => ({ id: m.id, score: m.score, metadata: m.metadata ?? {} }));
  }

  async delete(id: string): Promise<void> {
    await pinecone.deleteOne(id);
  }
}
```

## Text splitting

Large documents are automatically split into chunks. Control chunk size:

```ts
const knowledge = new KnowledgeEngine({
  embeddingProvider: myEmbedder,
  vectorStore: myVectorStore,
  splitter: {
    chunkSize: 512,       // tokens per chunk
    chunkOverlap: 64,     // overlap between chunks
  },
});
```

## KnowledgeEngineConfig reference

```ts
interface KnowledgeEngineConfig {
  embeddingProvider: EmbeddingProvider;     // required
  vectorStore: VectorStore;                 // required
  hybridSearch?: HybridSearchProvider;      // optional
  reranker?: RerankerProvider;              // optional
  splitter?: {
    chunkSize?: number;                     // default: 512
    chunkOverlap?: number;                  // default: 64
  };
  defaultTopK?: number;                     // default: 5
}
```
