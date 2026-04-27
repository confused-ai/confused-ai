import { agent } from 'confused-ai';
import { KnowledgeEngine, TextLoader, InMemoryVectorStore } from 'confused-ai/knowledge';
import { OpenAIEmbeddingProvider } from 'confused-ai/memory';

const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider(),
  vectorStore: new InMemoryVectorStore(),
});

// Ingest a document
await knowledge.ingest([{ content: 'confused-ai is a TypeScript framework...' }]);
await knowledge.ingest([{ content: 'confused-ai is a framework for building AI applications.' }]);

const ragAgent = agent({
  model: 'gpt-4o-mini',
  instructions: 'Answer questions using the knowledge base. Do not use external tools.',
  knowledgebase: knowledge,
  tools: [],
});

const r = await ragAgent.run('What is confused-ai?');
console.log(r.text);