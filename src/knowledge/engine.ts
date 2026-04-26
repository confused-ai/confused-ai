/**
 * Knowledge Engine — Production RAG implementation
 *
 * Provides document ingestion (chunking + embedding), retrieval (vector + optional keyword),
 * and optional agentic RAG (retrieve → LLM generate answer with citations).
 *
 * @example
 * import { KnowledgeEngine, OpenAIEmbeddingProvider, InMemoryVectorStore } from 'confused-ai-core';
 *
 * const knowledge = new KnowledgeEngine({
 *   embeddingProvider: new OpenAIEmbeddingProvider(),
 *   vectorStore: new InMemoryVectorStore(),
 * });
 *
 * // Ingest documents
 * await knowledge.ingest([
 *   { content: 'TypeScript is a typed superset of JavaScript...' },
 *   { content: 'Agents use LLMs to reason and take actions...' },
 * ]);
 *
 * // Retrieve relevant chunks
 * const result = await knowledge.retrieve('What are agents?');
 */

import type { RAGEngine, RAGChunk, RAGQueryOptions, RAGQueryResult } from './types.js';
import type { EmbeddingProvider, VectorStoreAdapter } from '../memory/types.js';

/** Configuration for the knowledge engine */
export interface KnowledgeEngineConfig {
    /** Embedding provider (e.g. OpenAIEmbeddingProvider) */
    embeddingProvider: EmbeddingProvider;
    /** Vector store adapter (e.g. InMemoryVectorStore, PineconeAdapter) */
    vectorStore: VectorStoreAdapter;
    /** Default number of chunks to retrieve (default: 5) */
    defaultTopK?: number;
    /** Minimum similarity threshold (default: 0.5) */
    defaultThreshold?: number;
    /** Chunk size for document splitting (default: 512 chars) */
    chunkSize?: number;
    /** Chunk overlap for document splitting (default: 50 chars) */
    chunkOverlap?: number;
}

/** A document to ingest into the knowledge base */
export interface DocumentInput {
    content: string;
    metadata?: Record<string, unknown>;
    source?: string;
}

/** Text splitter options */
export interface TextSplitterOptions {
    chunkSize: number;
    chunkOverlap: number;
    separators?: string[];
}

/**
 * Split text into chunks using recursive character-based splitting.
 * Similar to LangChain's RecursiveCharacterTextSplitter.
 */
export function splitText(text: string, options: TextSplitterOptions): string[] {
    const { chunkSize, chunkOverlap } = options;
    const separators = options.separators ?? ['\n\n', '\n', '. ', ' ', ''];
    const chunks: string[] = [];

    function split(text: string, sepIdx: number): string[] {
        if (text.length <= chunkSize) return [text];

        const sep = separators[sepIdx];
        if (sep === undefined) {
            // Last resort: hard split
            const parts: string[] = [];
            for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
                parts.push(text.slice(i, i + chunkSize));
            }
            return parts;
        }

        const parts = sep === '' ? [text] : text.split(sep);
        const merged: string[] = [];
        let current = '';

        for (const part of parts) {
            const candidate = current ? current + sep + part : part;
            if (candidate.length > chunkSize && current) {
                merged.push(current);
                // Keep overlap from end of current chunk
                const overlapStart = Math.max(0, current.length - chunkOverlap);
                current = current.slice(overlapStart) + sep + part;
                if (current.length > chunkSize) {
                    // Recurse with next separator
                    merged.push(...split(current, sepIdx + 1));
                    current = '';
                }
            } else {
                current = candidate;
            }
        }
        if (current) merged.push(current);
        return merged;
    }

    chunks.push(...split(text, 0));
    return chunks.filter(c => c.trim().length > 0);
}

/**
 * Production RAG engine implementation.
 * Handles document ingestion, chunking, embedding, and retrieval.
 */
export class KnowledgeEngine implements RAGEngine {
    private embeddingProvider: EmbeddingProvider;
    private vectorStore: VectorStoreAdapter;
    private defaultTopK: number;
    private defaultThreshold: number;
    private chunkSize: number;
    private chunkOverlap: number;
    private chunkCounter = 0;

    constructor(config: KnowledgeEngineConfig) {
        this.embeddingProvider = config.embeddingProvider;
        this.vectorStore = config.vectorStore;
        this.defaultTopK = config.defaultTopK ?? 5;
        this.defaultThreshold = config.defaultThreshold ?? 0.5;
        this.chunkSize = config.chunkSize ?? 512;
        this.chunkOverlap = config.chunkOverlap ?? 50;
    }

    /**
     * Retrieve relevant chunks for a query using vector similarity search.
     */
    async retrieve(query: string, options?: RAGQueryOptions): Promise<RAGQueryResult> {
        const limit = options?.limit ?? this.defaultTopK;
        const threshold = options?.threshold ?? this.defaultThreshold;

        const queryEmbedding = await this.embeddingProvider.embed(query);

        const results = await this.vectorStore.search(
            queryEmbedding,
            limit * 2, // Over-fetch for threshold filtering
            options?.filter
        );

        const chunks: RAGChunk[] = results
            .filter(r => r.score >= threshold)
            .slice(0, limit)
            .map(r => ({
                id: r.id,
                content: String(r.metadata.content ?? ''),
                score: r.score,
                metadata: r.metadata,
                source: r.metadata.source as string | undefined,
            }));

        return {
            chunks,
            query,
            totalRetrieved: results.length,
        };
    }

    /**
     * Ingest documents into the knowledge base.
     * Documents are automatically split into chunks and embedded.
     */
    async ingest(documents: DocumentInput[]): Promise<void> {
        for (const doc of documents) {
            const textChunks = splitText(doc.content, {
                chunkSize: this.chunkSize,
                chunkOverlap: this.chunkOverlap,
            });

            const embeddings = await this.embeddingProvider.embedBatch(
                textChunks
            );

            const vectorEntries = textChunks.map((chunk, i) => ({
                id: `chunk-${++this.chunkCounter}`,
                vector: embeddings[i],
                metadata: {
                    content: chunk,
                    source: doc.source,
                    ...doc.metadata,
                },
            }));

            await this.vectorStore.upsert(vectorEntries);
        }
    }

    /**
     * Build a context string from retrieved chunks for injection into LLM prompts.
     */
    async buildContext(query: string, options?: RAGQueryOptions): Promise<string> {
        const result = await this.retrieve(query, options);
        if (result.chunks.length === 0) return '';

        return result.chunks
            .map((c, i) => `[${i + 1}] ${c.content}${c.source ? ` (source: ${c.source})` : ''}`)
            .join('\n\n');
    }

    /**
     * Clear all ingested documents from the knowledge base.
     */
    async clear(): Promise<void> {
        await this.vectorStore.clear();
        this.chunkCounter = 0;
    }
}
