/**
 * Knowledge module: RAG, hybrid search, reranking, persistent storage.
 */

export * from './types.js';
export { KnowledgeEngine, splitText } from './engine.js';
export type { KnowledgeEngineConfig, DocumentInput, TextSplitterOptions } from './engine.js';
export {
    TextLoader,
    JSONLoader,
    CSVLoader,
    URLLoader,
} from './loaders.js';
export type { DocumentLoader } from './loaders.js';
// Note: OpenAIEmbeddingProvider and InMemoryVectorStore are exported from 'confused-ai/memory'
// They are re-exported here for convenience when importing from 'confused-ai/knowledge' directly.
export { OpenAIEmbeddingProvider } from '../memory/openai-embeddings.js';
export type { OpenAIEmbeddingConfig } from '../memory/openai-embeddings.js';
export { InMemoryVectorStore } from '../memory/in-memory-vector-store.js';
