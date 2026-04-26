import { agent } from 'confused-ai';
import { KnowledgeEngine, TextLoader, InMemoryVectorStore } from 'confused-ai/knowledge';
import { OpenAIEmbeddingProvider } from 'confused-ai/memory';

const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider(),
  vectorStore: new InMemoryVectorStore(),
});

// Ingest a document
await knowledge.ingest([{ content: 'confused-ai is a TypeScript framework...' }]);

const ragAgent = agent({
  model: 'gpt-4o-mini',
  instructions: 'Answer questions using the knowledge base.',
  ragEngine: knowledge,
});

const r = await ragAgent.run('What is confused-ai?');
console.log(r.text);