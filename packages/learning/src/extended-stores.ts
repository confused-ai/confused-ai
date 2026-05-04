/**
 * In-memory implementations for the extended learning stores.
 * Drop-in defaults — swap with DB-backed stores in production.
 */

import type {
    UserMemory,
    UserMemoryEntry,
    UserMemoryStore,
    SessionContext,
    SessionContextStore,
    LearnedKnowledge,
    LearnedKnowledgeStore,
    EntityMemory,
    EntityFact,
    EntityEvent,
    EntityRelationship,
    EntityMemoryStore,
} from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortId(): string {
    return Math.random().toString(36).slice(2, 10);
}

function now(): string {
    return new Date().toISOString();
}

// ── InMemoryUserMemoryStore ───────────────────────────────────────────────────

export class InMemoryUserMemoryStore implements UserMemoryStore {
    private data = new Map<string, UserMemory>();

    private key(userId: string, agentId?: string): string {
        return agentId ? `${userId}:${agentId}` : userId;
    }

    async get(userId: string, agentId?: string): Promise<UserMemory | null> {
        return this.data.get(this.key(userId, agentId)) ?? null;
    }

    async set(memory: UserMemory): Promise<UserMemory> {
        const updated = { ...memory, updatedAt: now() };
        this.data.set(this.key(memory.userId, memory.agentId), updated);
        return updated;
    }

    async addMemory(userId: string, content: string, agentId?: string, extra?: Record<string, unknown>): Promise<string> {
        const existing = await this.get(userId, agentId);
        const id = shortId();
        const entry: UserMemoryEntry = { id, content, createdAt: now(), ...extra };
        if (existing) {
            await this.set({ ...existing, memories: [...existing.memories, entry] });
        } else {
            await this.set({ userId, agentId, memories: [entry], createdAt: now(), updatedAt: now() });
        }
        return id;
    }

    async updateMemory(userId: string, memoryId: string, content: string, agentId?: string): Promise<boolean> {
        const existing = await this.get(userId, agentId);
        if (!existing) return false;
        const idx = existing.memories.findIndex(m => m.id === memoryId);
        if (idx === -1) return false;
        const updated = existing.memories.map(m =>
            m.id === memoryId ? { ...m, content, updatedAt: now() } : m
        );
        await this.set({ ...existing, memories: updated });
        return true;
    }

    async deleteMemory(userId: string, memoryId: string, agentId?: string): Promise<boolean> {
        const existing = await this.get(userId, agentId);
        if (!existing) return false;
        const before = existing.memories.length;
        const memories = existing.memories.filter(m => m.id !== memoryId);
        await this.set({ ...existing, memories });
        return memories.length < before;
    }

    async clearMemories(userId: string, agentId?: string): Promise<void> {
        const existing = await this.get(userId, agentId);
        if (existing) await this.set({ ...existing, memories: [] });
    }
}

// ── InMemorySessionContextStore ───────────────────────────────────────────────

export class InMemorySessionContextStore implements SessionContextStore {
    private data = new Map<string, SessionContext>();

    private key(sessionId: string, agentId?: string): string {
        return agentId ? `${sessionId}:${agentId}` : sessionId;
    }

    async get(sessionId: string, agentId?: string): Promise<SessionContext | null> {
        return this.data.get(this.key(sessionId, agentId)) ?? null;
    }

    async set(context: SessionContext): Promise<SessionContext> {
        const updated = { ...context, updatedAt: now() };
        this.data.set(this.key(context.sessionId, context.agentId), updated);
        return updated;
    }

    async clear(sessionId: string, agentId?: string): Promise<boolean> {
        return this.data.delete(this.key(sessionId, agentId));
    }
}

// ── InMemoryLearnedKnowledgeStore ─────────────────────────────────────────────

export class InMemoryLearnedKnowledgeStore implements LearnedKnowledgeStore {
    /** Stored as flat list; search is simple substring / tag matching */
    private entries: LearnedKnowledge[] = [];

    async search(query: string, namespace?: string, limit = 10): Promise<LearnedKnowledge[]> {
        const q = query.toLowerCase();
        return this.entries
            .filter(k => {
                if (namespace && k.namespace !== namespace) return false;
                return (
                    k.title.toLowerCase().includes(q) ||
                    k.learning.toLowerCase().includes(q) ||
                    (k.context ?? '').toLowerCase().includes(q) ||
                    (k.tags ?? []).some(t => t.toLowerCase().includes(q))
                );
            })
            .slice(0, limit);
    }

    async save(knowledge: LearnedKnowledge): Promise<LearnedKnowledge> {
        const idx = this.entries.findIndex(k =>
            k.title === knowledge.title && k.namespace === knowledge.namespace
        );
        const entry = { ...knowledge, updatedAt: now() };
        if (idx !== -1) {
            this.entries[idx] = entry;
        } else {
            this.entries.push({ ...entry, createdAt: now() });
        }
        return entry;
    }

    async delete(title: string, namespace?: string): Promise<boolean> {
        const before = this.entries.length;
        this.entries = this.entries.filter(k => !(k.title === title && k.namespace === namespace));
        return this.entries.length < before;
    }
}

// ── InMemoryEntityMemoryStore ─────────────────────────────────────────────────

export class InMemoryEntityMemoryStore implements EntityMemoryStore {
    private data = new Map<string, EntityMemory>();

    private key(entityId: string, namespace?: string): string {
        return namespace ? `${namespace}:${entityId}` : entityId;
    }

    async get(entityId: string, namespace?: string): Promise<EntityMemory | null> {
        return this.data.get(this.key(entityId, namespace)) ?? null;
    }

    async search(query: string, namespace?: string, limit = 10): Promise<EntityMemory[]> {
        const q = query.toLowerCase();
        return Array.from(this.data.values())
            .filter(e => {
                if (namespace && e.namespace !== namespace) return false;
                return (
                    e.entityId.toLowerCase().includes(q) ||
                    (e.name ?? '').toLowerCase().includes(q) ||
                    (e.description ?? '').toLowerCase().includes(q) ||
                    e.facts.some(f => f.content.toLowerCase().includes(q))
                );
            })
            .slice(0, limit);
    }

    async set(entity: EntityMemory): Promise<EntityMemory> {
        const updated = { ...entity, updatedAt: now() };
        this.data.set(this.key(entity.entityId, entity.namespace), updated);
        return updated;
    }

    private async _getOrCreate(entityId: string, namespace?: string): Promise<EntityMemory> {
        return (await this.get(entityId, namespace)) ?? {
            entityId,
            entityType: 'unknown',
            facts: [],
            events: [],
            relationships: [],
            namespace,
            createdAt: now(),
        };
    }

    async addFact(entityId: string, content: string, namespace?: string, extra?: Record<string, unknown>): Promise<string> {
        const entity = await this._getOrCreate(entityId, namespace);
        const id = shortId();
        const fact: EntityFact = { id, content, ...extra };
        await this.set({ ...entity, facts: [...entity.facts, fact] });
        return id;
    }

    async updateFact(entityId: string, factId: string, content: string, namespace?: string): Promise<boolean> {
        const entity = await this.get(entityId, namespace);
        if (!entity) return false;
        const idx = entity.facts.findIndex(f => f.id === factId);
        if (idx === -1) return false;
        const facts = entity.facts.map(f => f.id === factId ? { ...f, content } : f);
        await this.set({ ...entity, facts });
        return true;
    }

    async deleteFact(entityId: string, factId: string, namespace?: string): Promise<boolean> {
        const entity = await this.get(entityId, namespace);
        if (!entity) return false;
        const before = entity.facts.length;
        const facts = entity.facts.filter(f => f.id !== factId);
        await this.set({ ...entity, facts });
        return facts.length < before;
    }

    async addEvent(entityId: string, content: string, date?: string, namespace?: string): Promise<string> {
        const entity = await this._getOrCreate(entityId, namespace);
        const id = shortId();
        const event: EntityEvent = { id, content, ...(date ? { date } : {}) };
        await this.set({ ...entity, events: [...entity.events, event] });
        return id;
    }

    async addRelationship(
        entityId: string,
        relatedEntityId: string,
        relation: string,
        direction: 'outgoing' | 'incoming' = 'outgoing',
        namespace?: string,
    ): Promise<string> {
        const entity = await this._getOrCreate(entityId, namespace);
        const id = shortId();
        const rel: EntityRelationship = { id, entityId: relatedEntityId, relation, direction };
        await this.set({ ...entity, relationships: [...entity.relationships, rel] });
        return id;
    }

    async delete(entityId: string, namespace?: string): Promise<boolean> {
        return this.data.delete(this.key(entityId, namespace));
    }
}
