/**
 * @confused-ai/knowledge — package barrel.
 */

export { KnowledgeEngine, createKnowledgeEngine, withEmbeddingCache } from './knowledge-engine.js';
export type { RAGEngine, VectorStore, EmbeddingFn, Document, SearchResult, RAGChunk, RAGQueryOptions, RAGQueryResult } from './types.js';

// ── AgentDb-backed engine ──────────────────────────────────────────────────
export { DbKnowledgeEngine, DbVectorStore, createDbKnowledgeEngine } from './db-knowledge-store.js';
export type { DbKnowledgeEngineOptions } from './db-knowledge-store.js';

// ── External vector-store adapters ─────────────────────────────────────────
export { Neo4jKnowledgeAdapter } from './adapters/neo4j-adapter.js';
export type { Neo4jAdapterConfig } from './adapters/neo4j-adapter.js';
export { ChromaKnowledgeAdapter } from './adapters/chroma-adapter.js';
export type { ChromaAdapterConfig } from './adapters/chroma-adapter.js';
export { PgvectorKnowledgeAdapter } from './adapters/pgvector-adapter.js';
export type { PgvectorAdapterConfig } from './adapters/pgvector-adapter.js';

// ── Document loaders ────────────────────────────────────────────────────────
export { loadPdf } from './loaders/pdf-loader.js';
export type { PdfLoaderOptions } from './loaders/pdf-loader.js';
export { loadCsv } from './loaders/csv-loader.js';
export type { CsvLoaderOptions } from './loaders/csv-loader.js';
export { loadUrl } from './loaders/url-loader.js';
export type { UrlLoaderOptions } from './loaders/url-loader.js';
