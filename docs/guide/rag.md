# RAG / Knowledge

The `KnowledgeEngine` turns any document collection into a searchable knowledge base that agents can query with natural language.

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
  ragEngine: knowledge,
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
