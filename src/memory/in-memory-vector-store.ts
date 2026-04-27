/**
 * In-Memory Vector Store Adapter
 *
 * Brute-force cosine similarity search. Good for development, testing,
 * and small datasets (< 100k vectors). For production, use a dedicated
 * vector database (Pinecone, Qdrant, Weaviate, pgvector).
 */

import type { VectorStoreAdapter, VectorEntry, VectorSearchResult } from './types.js';
import type { EntityId } from '../core/types.js';

export class InMemoryVectorStore implements VectorStoreAdapter {
    private vectors = new Map<EntityId, { vector: number[]; metadata: Record<string, unknown> }>();

    async upsert(vectors: VectorEntry[]): Promise<void> {
        for (const v of vectors) {
            this.vectors.set(v.id, { vector: v.vector, metadata: v.metadata });
        }
    }

    async search(query: number[], limit: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]> {
        const results: VectorSearchResult[] = [];

        for (const [id, entry] of this.vectors) {
            // Apply metadata filter
            if (filter && !this.matchesFilter(entry.metadata, filter)) {
                continue;
            }

            const score = cosineSimilarity(query, entry.vector);
            results.push({ id, score, metadata: entry.metadata });
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    async delete(ids: EntityId[]): Promise<void> {
        for (const id of ids) {
            this.vectors.delete(id);
        }
    }

    async clear(): Promise<void> {
        this.vectors.clear();
    }

    get size(): number {
        return this.vectors.size;
    }

    private matchesFilter(metadata: Record<string, unknown>, filter: Record<string, unknown>): boolean {
        for (const [key, value] of Object.entries(filter)) {
            if (metadata[key] !== value) return false;
        }
        return true;
    }
}

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    // Single sqrt(magA * magB) instead of sqrt(magA) * sqrt(magB)
    const denom = Math.sqrt(magA * magB);
    return denom === 0 ? 0 : dot / denom;
}
