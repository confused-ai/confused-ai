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
import type { EntityId } from '@confused-ai/core';
import { DebugLogger, createDebugLogger } from '@confused-ai/shared';

/**
 * Default configuration for in-memory store
 */
const DEFAULT_CONFIG: Required<MemoryStoreConfig> = {
    maxShortTermEntries: 100,
    defaultQueryLimit: 10,
    similarityThreshold: 0.7,
    embeddingDimension: 1536,
    debug: false,
    // 0 = unlimited retention (no eviction based on age)
    retentionDays: 0,
};

/**
 * In-memory implementation of MemoryStore
 * Suitable for development and testing
 */
export class InMemoryStore implements MemoryStore {
    private memories: Map<EntityId, MemoryEntry> = new Map();
    private config: Required<MemoryStoreConfig>;
    private logger: DebugLogger;
    // Track SHORT_TERM count separately to avoid O(n) scan on every store()
    private shortTermCount = 0;

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
            this.shortTermCount++;
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
        const entry = this.memories.get(id);
        const deleted = this.memories.delete(id);
        if (deleted && entry?.type === MemoryType.SHORT_TERM) {
            this.shortTermCount--;
        }
        return deleted;
    }

    async clear(type?: MemoryType): Promise<void> {
        if (type) {
            for (const [id, entry] of this.memories) {
                if (entry.type === type) {
                    this.memories.delete(id);
                    if (type === MemoryType.SHORT_TERM) this.shortTermCount--;
                }
            }
        } else {
            this.memories.clear();
            this.shortTermCount = 0;
        }
    }

    async getRecent(limit: number, type?: MemoryType): Promise<MemoryEntry[]> {
        // Map preserves insertion order = creation order. Reverse-iterate for O(n)
        // instead of sorting the whole array O(n log n).
        const result: MemoryEntry[] = [];
        const values = Array.from(this.memories.values());
        for (let i = values.length - 1; i >= 0 && result.length < limit; i--) {
            if (!type || values[i].type === type) result.push(values[i]);
        }
        return result;
    }

    async snapshot(): Promise<MemoryEntry[]> {
        return Array.from(this.memories.values());
    }

    /**
     * Remove all memory entries whose age exceeds `retentionDays`.
     * Respects individual `expiresAt` dates first; falls back to `retentionDays`
     * when no explicit expiry is set.
     *
     * Returns the number of entries deleted.
     * No-op when `retentionDays` was not configured (config value 0).
     */
    pruneExpired(): number {
        const now = new Date();
        const retentionMs =
            this.config.retentionDays > 0 ? this.config.retentionDays * 86_400_000 : null;

        let pruned = 0;
        for (const [id, entry] of this.memories) {
            const expired =
                (entry.expiresAt !== undefined && entry.expiresAt < now) ||
                (retentionMs !== null &&
                    now.getTime() - entry.createdAt.getTime() > retentionMs);
            if (expired) {
                if (entry.type === MemoryType.SHORT_TERM) this.shortTermCount--;
                this.memories.delete(id);
                pruned++;
            }
        }
        return pruned;
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
     * Calculate simple similarity score between query and content.
     * Uses a Set for O(1) exact word lookups; falls back to substring scan only
     * for words that had no exact match — O(n + m) in the common case.
     */
    private calculateSimilarity(query: string, content: string): number {
        const queryWords = query.toLowerCase().split(/\s+/);
        const contentWords = content.toLowerCase().split(/\s+/);
        const contentSet = new Set(contentWords);

        let matches = 0;
        for (const word of queryWords) {
            if (contentSet.has(word)) {
                matches++;
            } else {
                // Substring fallback for partial matches
                for (const cw of contentWords) {
                    if (cw.includes(word) || word.includes(cw)) { matches++; break; }
                }
            }
        }

        return matches / Math.max(queryWords.length, 1);
    }

    /**
     * Enforce short-term memory entry limit.
     * Map preserves insertion order so iterating from the start evicts the oldest
     * entries first — O(excess) instead of O(n log n) sort.
     */
    private enforceShortTermLimit(): void {
        if (this.shortTermCount <= this.config.maxShortTermEntries) return;
        const excess = this.shortTermCount - this.config.maxShortTermEntries;
        let removed = 0;
        for (const [id, entry] of this.memories) {
            if (removed >= excess) break;
            if (entry.type === MemoryType.SHORT_TERM) {
                this.memories.delete(id);
                removed++;
            }
        }
        this.shortTermCount -= removed;
    }
}