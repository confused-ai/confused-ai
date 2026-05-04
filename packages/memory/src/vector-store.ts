/**
 * Vector-based memory store implementation
 */

import {
    MemoryStore,
    MemoryEntry,
    MemoryQuery,
    MemoryFilter,
    MemoryType,
    MemorySearchResult,
    MemoryStoreConfig,
    VectorStoreAdapter,
    EmbeddingProvider,
} from './types.js';
import type { EntityId } from '@confused-ai/core';

/**
 * Configuration for vector memory store
 */
export interface VectorMemoryStoreConfig extends MemoryStoreConfig {
    vectorStore: VectorStoreAdapter;
    embeddingProvider: EmbeddingProvider;
}

/**
 * Vector-based memory store using external vector database
 */
export class VectorMemoryStore implements MemoryStore {
    private config: Required<MemoryStoreConfig>;
    private vectorStore: VectorStoreAdapter;
    private embeddingProvider: EmbeddingProvider;
    private entryCache: Map<EntityId, MemoryEntry> = new Map();

    constructor(config: VectorMemoryStoreConfig) {
        this.vectorStore = config.vectorStore;
        this.embeddingProvider = config.embeddingProvider;
        this.config = {
            maxShortTermEntries: config.maxShortTermEntries ?? 100,
            defaultQueryLimit: config.defaultQueryLimit ?? 10,
            similarityThreshold: config.similarityThreshold ?? 0.7,
            embeddingDimension: config.embeddingDimension ?? this.embeddingProvider.getDimension(),
            debug: config.debug ?? false,
        };
    }

    async store(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry> {
        const id = this.generateId();
        const createdAt = new Date();

        // Generate embedding for the content
        const embedding = await this.embeddingProvider.embed(entry.content);

        const fullEntry: MemoryEntry = {
            ...entry,
            id,
            createdAt,
            embedding,
        };

        // Store in vector database
        await this.vectorStore.upsert([
            {
                id,
                vector: embedding,
                metadata: {
                    type: entry.type,
                    content: entry.content,
                    createdAt: createdAt.toISOString(),
                    ...entry.metadata,
                },
            },
        ]);

        // Cache locally
        this.entryCache.set(id, fullEntry);

        return fullEntry;
    }

    async retrieve(query: MemoryQuery): Promise<MemorySearchResult[]> {
        const limit = query.limit ?? this.config.defaultQueryLimit;

        // Generate embedding for the query
        const queryEmbedding = await this.embeddingProvider.embed(query.query);

        // Build filter for vector store
        const filter: Record<string, unknown> = {};
        if (query.type) {
            filter.type = query.type;
        }
        if (query.filter) {
            Object.assign(filter, this.convertFilter(query.filter));
        }

        // Search vector store
        const results = await this.vectorStore.search(queryEmbedding, limit, filter);

        // Convert to MemorySearchResult
        return results.map(r => {
            const entry = this.entryCache.get(r.id) ?? this.reconstructEntry(r.id, r.metadata);
            return {
                entry,
                score: r.score,
            };
        });
    }

    async get(id: EntityId): Promise<MemoryEntry | null> {
        // Check cache first
        const cached = this.entryCache.get(id);
        if (cached) {
            return cached;
        }

        // Would need to implement get by ID in vector store
        // For now, return null
        return null;
    }

    async update(
        id: EntityId,
        updates: Partial<Omit<MemoryEntry, 'id' | 'createdAt'>>
    ): Promise<MemoryEntry> {
        const existing = await this.get(id);
        if (!existing) {
            throw new Error(`Memory entry not found: ${id}`);
        }

        // If content is updated, regenerate embedding
        let embedding = existing.embedding;
        if (updates.content && updates.content !== existing.content) {
            embedding = await this.embeddingProvider.embed(updates.content);
        }

        const updated: MemoryEntry = {
            ...existing,
            ...updates,
            id: existing.id,
            createdAt: existing.createdAt,
            embedding: embedding ?? existing.embedding,
        };

        // Update in vector store
        await this.vectorStore.upsert([
            {
                id,
                vector: updated.embedding ?? [],
                metadata: {
                    type: updated.type,
                    content: updated.content,
                    createdAt: updated.createdAt.toISOString(),
                    ...updated.metadata,
                },
            },
        ]);

        // Update cache
        this.entryCache.set(id, updated);

        return updated;
    }

    async delete(id: EntityId): Promise<boolean> {
        await this.vectorStore.delete([id]);
        this.entryCache.delete(id);
        return true;
    }

    async clear(type?: MemoryType): Promise<void> {
        if (type) {
            // Vector stores typically don't support clearing by metadata filter
            // This would need to be implemented in the adapter
            const allEntries = Array.from(this.entryCache.values());
            const toDelete = allEntries.filter(e => e.type === type).map(e => e.id);
            await this.vectorStore.delete(toDelete);
            for (const id of toDelete) {
                this.entryCache.delete(id);
            }
        } else {
            await this.vectorStore.clear();
            this.entryCache.clear();
        }
    }

    async getRecent(limit: number, type?: MemoryType): Promise<MemoryEntry[]> {
        // Get all cached entries sorted by date
        let entries = Array.from(this.entryCache.values());

        if (type) {
            entries = entries.filter(e => e.type === type);
        }

        return entries
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit);
    }

    async snapshot(): Promise<MemoryEntry[]> {
        return Array.from(this.entryCache.values());
    }

    /**
     * Generate a unique ID
     */
    private generateId(): EntityId {
        return `vec-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * Convert memory filter to vector store filter
     */
    private convertFilter(filter: MemoryFilter): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        if (filter.tags) {
            result.tags = filter.tags;
        }
        if (filter.source) {
            result.source = filter.source;
        }
        if (filter.agentId) {
            result.agentId = filter.agentId;
        }
        if (filter.sessionId) {
            result.sessionId = filter.sessionId;
        }

        return result;
    }

    /**
     * Reconstruct a memory entry from vector store metadata
     */
    private reconstructEntry(id: EntityId, metadata: Record<string, unknown>): MemoryEntry {
        return {
            id,
            type: (metadata.type as MemoryType) ?? MemoryType.SHORT_TERM,
            content: (metadata.content as string) ?? '',
            metadata: {
                source: metadata.source as string,
                importance: metadata.importance as number,
                tags: metadata.tags as string[],
                agentId: metadata.agentId as EntityId,
                sessionId: metadata.sessionId as string,
                custom: metadata.custom as Record<string, unknown>,
            },
            createdAt: new Date(metadata.createdAt as string),
        };
    }
}