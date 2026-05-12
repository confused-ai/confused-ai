/**
 * Curator — prunes stale entries and deduplicates memories across learning stores.
 *
 * SRP  — owns only the prune/dedup concern.
 * DIP  — depends on abstract store interfaces, not concrete implementations.
 */

import type {
    UserMemoryStore,
    LearnedKnowledgeStore,
    DecisionLogStore,
    UserMemoryEntry,
    LearnedKnowledge,
} from './types.js';

export interface CuratorConfig {
    /** User memory store to curate. */
    userMemory?: UserMemoryStore;
    /** Learned knowledge store to curate. */
    learnedKnowledge?: LearnedKnowledgeStore;
    /** Decision log store to curate. */
    decisionLog?: DecisionLogStore;
}

export interface CurateOptions {
    /** User ID to curate (required for userMemory). */
    userId?: string;
    /** Agent ID scope. */
    agentId?: string;
    /** Remove entries older than this many days. Default: 90. */
    maxAgeDays?: number;
    /**
     * If true, remove duplicate memories (same content, case-insensitive).
     * Default: true.
     */
    deduplicateMemories?: boolean;
    /**
     * If true, remove duplicate learned-knowledge entries (same title+namespace).
     * Default: true.
     */
    deduplicateKnowledge?: boolean;
}

export interface CurateResult {
    /** Entries pruned from user memory store. */
    userMemoryPruned: number;
    /** Decision log entries pruned. */
    decisionLogPruned: number;
    /** Duplicate user memory entries removed. */
    userMemoryDeduplicated: number;
}

/**
 * Curator — centralised maintenance for all learning stores.
 *
 * Usage:
 * ```ts
 * const curator = new Curator({ userMemory, learnedKnowledge, decisionLog });
 * await curator.curate({ userId: 'u1', maxAgeDays: 60 });
 * ```
 */
export class Curator {
    constructor(private readonly _config: CuratorConfig) {}

    /**
     * Prune old entries and deduplicate memories.
     * Returns a summary of what was removed.
     */
    async curate(opts: CurateOptions = {}): Promise<CurateResult> {
        const maxAgeDays     = opts.maxAgeDays ?? 90;
        const dedupeMemories = opts.deduplicateMemories ?? true;
        const result: CurateResult = {
            userMemoryPruned: 0,
            decisionLogPruned: 0,
            userMemoryDeduplicated: 0,
        };

        // ── Decision log pruning ───────────────────────────────────────────────
        if (this._config.decisionLog) {
            result.decisionLogPruned = await this._config.decisionLog.prune(opts.agentId, maxAgeDays);
        }

        // ── User memory: prune by age + deduplicate ───────────────────────────
        if (this._config.userMemory && opts.userId) {
            const mem = await this._config.userMemory.get(opts.userId, opts.agentId);
            if (mem) {
                const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
                const original = mem.memories;
                let working = original;

                // Age pruning
                const afterAge = working.filter((m) => (m.createdAt ?? '') >= cutoff);
                result.userMemoryPruned = working.length - afterAge.length;
                working = afterAge;

                // Deduplication: keep last occurrence of each normalised content
                if (dedupeMemories) {
                    const seen = new Set<string>();
                    const unique: UserMemoryEntry[] = [];
                    for (let i = working.length - 1; i >= 0; i--) {
                        const key = (working[i]?.content ?? '').toLowerCase().trim();
                        if (!seen.has(key)) {
                            seen.add(key);
                            unique.unshift(working[i]!);
                        }
                    }
                    result.userMemoryDeduplicated = working.length - unique.length;
                    working = unique;
                }

                if (working.length !== original.length) {
                    await this._config.userMemory.set({ ...mem, memories: working });
                }
            }
        }

        return result;
    }

    /**
     * Deduplicate learned knowledge: remove exact title+namespace duplicates.
     * This is a lightweight scan — intended for small-to-medium knowledge bases.
     */
    async deduplicateKnowledge(namespace = 'global'): Promise<number> {
        if (!this._config.learnedKnowledge) return 0;

        // Fetch all by a broad query and identify duplicates by title
        const all = await this._config.learnedKnowledge.search('', namespace, 1_000);
        const seen = new Map<string, LearnedKnowledge>();
        let duplicates = 0;

        for (const k of all) {
            const key = `${k.title.toLowerCase().trim()}::${k.namespace ?? 'global'}`;
            if (seen.has(key)) {
                // Keep newest (already inserted); delete extra
                await this._config.learnedKnowledge.delete(k.title, k.namespace ?? 'global');
                duplicates++;
            } else {
                seen.set(key, k);
            }
        }
        return duplicates;
    }
}
