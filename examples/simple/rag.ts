import { agent } from 'fluxion';
import { KnowledgeEngine, TextLoader, InMemoryVectorStore } from 'fluxion/knowledge';
import { OpenAIEmbeddingProvider } from 'fluxion/memory';

const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider(),
  vectorStore: new InMemoryVectorStore(),
});

// Ingest a document
await knowledge.ingest([{ content: 'fluxion is a TypeScript framework...' }]);

const ragAgent = agent({
  model: 'gpt-4o-mini',
  instructions: 'Answer questions using the knowledge base.',
  ragEngine: knowledge,
});

const r = await ragAgent.run('What is fluxion?');
console.log(r.text);