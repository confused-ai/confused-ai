# 05 · RAG Knowledge Base 🟡

RAG = **Retrieval-Augmented Generation**. Instead of relying only on what the
model was trained on, you load your own documents and let the agent search them
at query time. Perfect for company wikis, product docs, research papers, and FAQs.

## What you'll learn

- How to load documents (text, JSON, URL)
- How to build a vector index
- How to query the index inside an agent

## How RAG works

```
Your documents
    ↓  (split into chunks)
Text chunks
    ↓  (embed with OpenAI)
Vector store (in-memory or external)
    ↓
User asks: "What is the refund policy?"
    ↓  (embed question → find similar chunks)
Top 3 relevant chunks
    ↓  (inject into prompt)
Agent answers using YOUR content
```

## Code

```ts
// rag-agent.ts
import { createAgent } from 'fluxion';
import { KnowledgeEngine, TextLoader, URLLoader, JSONLoader } from 'fluxion/knowledge';
import { OpenAIEmbeddingProvider } from 'fluxion/memory';
import { InMemoryVectorStore } from 'fluxion/memory';

// ── 1. Set up the embedding provider ──────────────────────────────────────
const embeddings = new OpenAIEmbeddingProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'text-embedding-3-small',  // cheap + very good
});

// ── 2. Set up the vector store ────────────────────────────────────────────
const vectorStore = new InMemoryVectorStore();

// ── 3. Create the knowledge engine ────────────────────────────────────────
const knowledge = new KnowledgeEngine({
  embeddingProvider: embeddings,
  vectorStore,
  chunkSize: 500,     // characters per chunk
  chunkOverlap: 50,   // overlap between chunks (helps at boundaries)
});

// ── 4. Load your documents ────────────────────────────────────────────────

// Load from a plain text file
await knowledge.load(new TextLoader('./docs/refund-policy.txt'));

// Load from a URL (fetches HTML, strips tags)
await knowledge.load(new URLLoader('https://your-site.com/help/shipping'));

// Load from a JSON file (each item becomes a chunk)
await knowledge.load(new JSONLoader('./data/faq.json', {
  contentField: 'answer',          // field to embed
  metadataFields: ['id', 'topic'], // fields to store alongside
}));

// Load a string directly (great for testing)
await knowledge.loadText(`
  Return Policy: Items can be returned within 30 days of purchase.
  Electronics must be unopened. Digital downloads are non-refundable.
  To initiate a return, email returns@example.com with your order number.
`);

console.log(`Loaded ${await vectorStore.count()} chunks`);

// ── 5. Create the agent with RAG ──────────────────────────────────────────
const agent = createAgent({
  name: 'support-agent',
  model: 'gpt-4o-mini',
  instructions: `
    You are a customer support agent.
    Answer questions using the provided knowledge base.
    If the answer is not in the knowledge base, say so clearly.
    Always cite the source when available.
  `,
  knowledge,               // ← attach the knowledge engine
  knowledgeTopK: 3,        // retrieve top 3 most relevant chunks
  knowledgeMinScore: 0.7,  // only use chunks with ≥70% similarity
});

// ── 6. Ask questions ───────────────────────────────────────────────────────
const r1 = await agent.run('What is your return policy?');
console.log(r1.text);
// → "Items can be returned within 30 days of purchase. Electronics must be unopened..."

const r2 = await agent.run('How do I initiate a return?');
console.log(r2.text);
// → "To initiate a return, email returns@example.com with your order number."

const r3 = await agent.run('What is the weather like today?');
console.log(r3.text);
// → "I don't have information about current weather in my knowledge base."
```

## Load from a directory

```ts
import { glob } from 'glob';
import { readFile } from 'node:fs/promises';

const mdFiles = await glob('./docs/**/*.md');
for (const file of mdFiles) {
  const content = await readFile(file, 'utf-8');
  await knowledge.loadText(content, { source: file });
}
```

## What chunks look like

Each chunk stored in the vector store has:
- `content` — the text (e.g., "Items can be returned within 30 days...")
- `embedding` — a 1536-dimension float array
- `metadata.source` — where it came from
- `metadata.chunkIndex` — position in the original document

## Persist to disk (no re-embedding on restart)

```ts
import { createStorage } from 'fluxion/storage';

const storage = createStorage({ type: 'file', path: './data/vectors.json' });

// Save after loading
await storage.set('vectors', await vectorStore.dump());

// Restore on startup
const saved = await storage.get('vectors');
if (saved) {
  await vectorStore.restore(saved);
  console.log('Restored vector store from disk');
} else {
  await knowledge.load(...); // first run
  await storage.set('vectors', await vectorStore.dump());
}
```

## What's next?

- [06 · Persistent Memory](./06-memory) — remember users across sessions
- [07 · Storage Patterns](./07-storage) — cache and persist any agent data
