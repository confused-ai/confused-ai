/**
 * In-memory memory store implementation
 */

import {
    MemoryStore,
    MemoryEntry,
    MemoryQuery,
    MemoryFilter,
    MemoryType,
    MemorySearchResult,
    MemoryStoreConfig,
} from './types.js';
import type { EntityId } from '../core/types.js';
import { DebugLogger, createDebugLogger } from '../shared/debug-logger.js';

/**
 * Default configuration for in-memory store
 */
const DEFAULT_CONFIG: Required<MemoryStoreConfig> = {
    maxShortTermEntries: 100,
    defaultQueryLimit: 10,
    similarityThreshold: 0.7,
    embeddingDimension: 1536,
    debug: false,
};

/**
 * In-memory implementation of MemoryStore
 * Suitable for development and testing
 */
export class InMemoryStore implements MemoryStore {
    private memories: Map<EntityId, MemoryEntry> = new Map();
    private config: Required<MemoryStoreConfig>;
    private logger: DebugLogger;

    constructor(config: MemoryStoreConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = createDebugLogger('MemoryStore', this.config.debug);
        this.logger.debug('InMemoryStore initialized', undefined, this.config);
    }

    async store(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry> {
        const id = this.generateId();
        const createdAt = new Date();

        const fullEntry: MemoryEntry = {
            ...entry,
            id,
            createdAt,
        };

        this.memories.set(id, fullEntry);
        this.logger.debug('Stored memory entry', undefined, {
            id,
            type: entry.type,
            tags: entry.metadata.tags,
            agentId: entry.metadata.agentId,
            sessionId: entry.metadata.sessionId,
        });

        // Enforce short-term memory limits
        if (entry.type === MemoryType.SHORT_TERM) {
            this.enforceShortTermLimit();
        }

        return fullEntry;
    }

    async retrieve(query: MemoryQuery): Promise<MemorySearchResult[]> {
        const limit = query.limit ?? this.config.defaultQueryLimit;
        const threshold = query.threshold ?? this.config.similarityThreshold;

        let entries = Array.from(this.memories.values());

        // Filter by type
        if (query.type) {
            entries = entries.filter(e => e.type === query.type);
        }

        // Apply filters
        if (query.filter) {
            entries = this.applyFilter(entries, query.filter);
        }

        // Calculate similarity scores (simplified - just keyword matching for in-memory)
        const scored = entries.map(entry => ({
            entry,
            score: this.calculateSimilarity(query.query, entry.content),
        }));

        // Filter by threshold and sort by score
        const results = scored
            .filter(r => r.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        this.logger.debug('Retrieved memory results', undefined, {
            query: query.query.slice(0, 50),
            type: query.type,
            filter: query.filter,
            totalMatches: results.length,
            limit: limit,
            threshold: threshold,
        });

        return results;
    }

    async get(id: EntityId): Promise<MemoryEntry | null> {
        const entry = this.memories.get(id) ?? null;
        if (entry) {
            this.logger.debug('Retrieved memory entry', undefined, { id, type: entry.type });
        } else {
            this.logger.debug('Memory entry not found', undefined, { id });
        }
        return entry;
    }

    async update(
        id: EntityId,
        updates: Partial<Omit<MemoryEntry, 'id' | 'createdAt'>>
    ): Promise<MemoryEntry> {
        const existing = this.memories.get(id);
        if (!existing) {
            throw new Error(`Memory entry not found: ${id}`);
        }

        const updated: MemoryEntry = {
            ...existing,
            ...updates,
            id: existing.id,
            createdAt: existing.createdAt,
        };

        this.memories.set(id, updated);
        return updated;
    }

    async delete(id: EntityId): Promise<boolean> {
        return this.memories.delete(id);
    }

    async clear(type?: MemoryType): Promise<void> {
        if (type) {
            for (const [id, entry] of this.memories) {
                if (entry.type === type) {
                    this.memories.delete(id);
                }
            }
        } else {
            this.memories.clear();
        }
    }

    async getRecent(limit: number, type?: MemoryType): Promise<MemoryEntry[]> {
        let entries = Array.from(this.memories.values());

        if (type) {
            entries = entries.filter(e => e.type === type);
        }

        return entries
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit);
    }

    async snapshot(): Promise<MemoryEntry[]> {
        return Array.from(this.memories.values());
    }

    /**
     * Get the number of stored memories
     */
    size(): number {
        return this.memories.size;
    }

    /**
     * Generate a unique ID
     */
    private generateId(): EntityId {
        return `mem-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * Apply filter to memory entries
     */
    private applyFilter(entries: MemoryEntry[], filter: MemoryFilter): MemoryEntry[] {
        return entries.filter(entry => {
            if (filter.tags && filter.tags.length > 0) {
                const entryTags = entry.metadata.tags ?? [];
                if (!filter.tags.some(tag => entryTags.includes(tag))) {
                    return false;
                }
            }

            if (filter.source && entry.metadata.source !== filter.source) {
                return false;
            }

            if (filter.agentId && entry.metadata.agentId !== filter.agentId) {
                return false;
            }

            if (filter.sessionId && entry.metadata.sessionId !== filter.sessionId) {
                return false;
            }

            if (filter.before && entry.createdAt > filter.before) {
                return false;
            }

            if (filter.after && entry.createdAt < filter.after) {
                return false;
            }

            return true;
        });
    }

    /**
     * Calculate simple similarity score between query and content
     * In production, use proper embeddings
     */
    private calculateSimilarity(query: string, content: string): number {
        const queryWords = query.toLowerCase().split(/\s+/);
        const contentWords = content.toLowerCase().split(/\s+/);

        let matches = 0;
        for (const word of queryWords) {
            if (contentWords.some(cw => cw.includes(word) || word.includes(cw))) {
                matches++;
            }
        }

        return matches / Math.max(queryWords.length, 1);
    }

    /**
     * Enforce short-term memory entry limit
     */
    private enforceShortTermLimit(): void {
        const shortTermEntries = Array.from(this.memories.values())
            .filter(e => e.type === MemoryType.SHORT_TERM)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        const excess = shortTermEntries.length - this.config.maxShortTermEntries;
        if (excess > 0) {
            for (let i = 0; i < excess; i++) {
                this.memories.delete(shortTermEntries[i].id);
            }
        }
    }
}