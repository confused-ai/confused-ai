/**
 * Memory store types and interfaces
 */

import type { EntityId } from '@confused-ai/core';

/**
 * Types of memory supported
 */
export enum MemoryType {
    SHORT_TERM = 'short_term',
    LONG_TERM = 'long_term',
    EPISODIC = 'episodic',
    SEMANTIC = 'semantic',
}

/**
 * A memory entry
 */
export interface MemoryEntry {
    readonly id: EntityId;
    readonly type: MemoryType;
    readonly content: string;
    readonly embedding?: number[];
    readonly metadata: MemoryMetadata;
    readonly createdAt: Date;
    readonly expiresAt?: Date;
}

/**
 * Metadata for memory entries
 */
export interface MemoryMetadata {
    readonly source?: string;
    readonly importance?: number;
    readonly tags?: string[];
    readonly agentId?: EntityId;
    readonly sessionId?: string;
    readonly custom?: Record<string, unknown>;
}

/**
 * Query options for memory retrieval
 */
export interface MemoryQuery {
    readonly query: string;
    readonly type?: MemoryType;
    readonly limit?: number;
    readonly threshold?: number;
    readonly filter?: MemoryFilter;
    readonly includeEmbeddings?: boolean;
}

/**
 * Filter for memory queries
 */
export interface MemoryFilter {
    readonly tags?: string[];
    readonly source?: string;
    readonly agentId?: EntityId;
    readonly sessionId?: string;
    readonly before?: Date;
    readonly after?: Date;
    readonly custom?: Record<string, unknown>;
}

/**
 * Configuration for memory store
 */
export interface MemoryStoreConfig {
    readonly maxShortTermEntries?: number;
    readonly defaultQueryLimit?: number;
    readonly similarityThreshold?: number;
    readonly embeddingDimension?: number;
    /** Enable debug logging */
    readonly debug?: boolean;
}

/**
 * Result from memory search
 */
export interface MemorySearchResult {
    readonly entry: MemoryEntry;
    readonly score: number;
}

/**
 * Abstract memory store interface
 */
export interface MemoryStore {
    /**
     * Store a new memory entry
     */
    store(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry>;

    /**
     * Retrieve memories by query (semantic search)
     */
    retrieve(query: MemoryQuery): Promise<MemorySearchResult[]>;

    /**
     * Get a specific memory by ID
     */
    get(id: EntityId): Promise<MemoryEntry | null>;

    /**
     * Update an existing memory
     */
    update(id: EntityId, updates: Partial<Omit<MemoryEntry, 'id' | 'createdAt'>>): Promise<MemoryEntry>;

    /**
     * Delete a memory by ID
     */
    delete(id: EntityId): Promise<boolean>;

    /**
     * Clear all memories (optionally filtered by type)
     */
    clear(type?: MemoryType): Promise<void>;

    /**
     * Get recent memories
     */
    getRecent(limit: number, type?: MemoryType): Promise<MemoryEntry[]>;

    /**
     * Create a snapshot of current memories
     */
    snapshot(): Promise<MemoryEntry[]>;
}

/**
 * Embedding provider interface for vector operations
 */
export interface EmbeddingProvider {
    /**
     * Generate embeddings for text
     */
    embed(text: string): Promise<number[]>;

    /**
     * Generate embeddings for multiple texts
     */
    embedBatch(texts: string[]): Promise<number[][]>;

    /**
     * Get the dimension of embeddings
     */
    getDimension(): number;
}

/**
 * Vector store adapter interface
 */
export interface VectorStoreAdapter {
    /**
     * Store vectors with metadata
     */
    upsert(vectors: VectorEntry[]): Promise<void>;

    /**
     * Search for similar vectors
     */
    search(query: number[], limit: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]>;

    /**
     * Delete vectors by ID
     */
    delete(ids: EntityId[]): Promise<void>;

    /**
     * Clear all vectors
     */
    clear(): Promise<void>;
}

/**
 * Vector entry for storage
 */
export interface VectorEntry {
    readonly id: EntityId;
    readonly vector: number[];
    readonly metadata: Record<string, unknown>;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
    readonly id: EntityId;
    readonly score: number;
    readonly metadata: Record<string, unknown>;
}