/**
 * In-memory DecisionLogStore implementation.
 * SRP  — owns only in-memory decision log storage.
 * DIP  — implements DecisionLogStore interface.
 * DS   — Map<id, DecisionLog> for O(1) get/add/delete.
 *         Linear search for list/search — acceptable for typical agent log sizes.
 */

import type { DecisionLog, DecisionLogStore } from './types.js';

function uuid(): string {
    return crypto.randomUUID();
}

export class InMemoryDecisionLogStore implements DecisionLogStore {
    private readonly _logs = new Map<string, DecisionLog>();

    async add(log: Omit<DecisionLog, 'id' | 'createdAt'>): Promise<DecisionLog> {
        const entry: DecisionLog = {
            ...log,
            id: uuid(),
            createdAt: new Date().toISOString(),
        };
        this._logs.set(entry.id, entry);
        return entry;
    }

    async get(id: string): Promise<DecisionLog | null> {
        return this._logs.get(id) ?? null;
    }

    async list(agentId?: string, sessionId?: string, limit = 100): Promise<DecisionLog[]> {
        const results: DecisionLog[] = [];
        for (const log of this._logs.values()) {
            if (agentId && log.agentId !== agentId) continue;
            if (sessionId && log.sessionId !== sessionId) continue;
            results.push(log);
        }
        // Newest first
        results.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        return results.slice(0, limit);
    }

    async search(query: string, agentId?: string, limit = 20): Promise<DecisionLog[]> {
        const q = query.toLowerCase();
        const results: DecisionLog[] = [];
        for (const log of this._logs.values()) {
            if (agentId && log.agentId !== agentId) continue;
            const text = `${log.decision} ${log.reasoning ?? ''} ${log.context ?? ''}`.toLowerCase();
            if (text.includes(q)) results.push(log);
        }
        results.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        return results.slice(0, limit);
    }

    async update(id: string, updates: Partial<Pick<DecisionLog, 'outcome' | 'outcomeQuality'>>): Promise<boolean> {
        const existing = this._logs.get(id);
        if (!existing) return false;
        this._logs.set(id, { ...existing, ...updates });
        return true;
    }

    async delete(id: string): Promise<boolean> {
        return this._logs.delete(id);
    }

    async prune(agentId?: string, maxAgeDays = 30): Promise<number> {
        const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
        let count = 0;
        for (const [id, log] of this._logs) {
            if (agentId && log.agentId !== agentId) continue;
            if ((log.createdAt ?? '') < cutoff) {
                this._logs.delete(id);
                count++;
            }
        }
        return count;
    }
}
