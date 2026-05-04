/**
 * Memory module exports
 */

export * from './types.js';
export { InMemoryStore } from './in-memory-store.js';
export { VectorMemoryStore } from './vector-store.js';
export type { VectorMemoryStoreConfig } from './vector-store.js';
// Note: OpenAIEmbeddingProvider from this module conflicts with the one in 'confused-ai/llm'.
// Use the llm subpath for the standard provider, or import directly from 'confused-ai/memory'.
export { OpenAIEmbeddingProvider } from './openai-embeddings.js';
export type { OpenAIEmbeddingConfig } from './openai-embeddings.js';
export { InMemoryVectorStore } from './in-memory-vector-store.js';
export {
    PineconeVectorStore,
    QdrantVectorStore,
    PgVectorStore,
} from './vector-adapters.js';
export type {
    PgPool,
    PineconeVectorStoreConfig,
    QdrantVectorStoreConfig,
    PgVectorStoreConfig,
} from './vector-adapters.js';