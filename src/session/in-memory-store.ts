/**
 * In-memory session store implementation
 */

import {
    SessionStore,
    Session,
    SessionRun,
    SessionId,
    SessionState,
    SessionQuery,
    SessionStoreConfig,
} from './types.js';
import type { Message } from '../providers/types.js';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<SessionStoreConfig> = {
    defaultTtlMs: 24 * 60 * 60 * 1000, // 24 hours
    maxSessionsPerAgent: 100,
    maxMessagesPerSession: 1000,
};

/**
 * In-memory implementation of SessionStore
 * Suitable for development and testing
 */
export class InMemorySessionStore implements SessionStore {
    private sessions: Map<SessionId, Session> = new Map();
    private runs: Map<string, SessionRun[]> = new Map();
    private config: Required<SessionStoreConfig>;
    // Inverted index: agentId → insertion-ordered Set of sessionIds for O(1) per-agent queries
    private agentIndex = new Map<string, Set<SessionId>>();

    constructor(config: SessionStoreConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async create(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): Promise<Session> {
        const id = this.generateId();
        const now = new Date();

        const newSession: Session = {
            ...session,
            id,
            createdAt: now,
            updatedAt: now,
        };

        this.sessions.set(id, newSession);
        this.runs.set(id, []);

        // Update agent index
        const agentSet = this.agentIndex.get(session.agentId) ?? new Set<SessionId>();
        agentSet.add(id);
        this.agentIndex.set(session.agentId, agentSet);

        // Enforce max sessions per agent
        this.enforceMaxSessions(session.agentId);

        return newSession;
    }

    async get(sessionId: SessionId): Promise<Session | null> {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        // Check expiration
        if (session.expiresAt && session.expiresAt < new Date()) {
            await this.delete(sessionId);
            return null;
        }

        return session;
    }

    async update(sessionId: SessionId, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<Session> {
        const existing = this.sessions.get(sessionId);
        if (!existing) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        const updated: Session = {
            ...existing,
            ...updates,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: new Date(),
        };

        this.sessions.set(sessionId, updated);
        return updated;
    }

    async delete(sessionId: SessionId): Promise<boolean> {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.agentIndex.get(session.agentId)?.delete(sessionId);
        }
        this.runs.delete(sessionId);
        return this.sessions.delete(sessionId);
    }

    async list(query?: SessionQuery): Promise<Session[]> {
        let sessions = Array.from(this.sessions.values());

        if (query?.agentId) {
            sessions = sessions.filter(s => s.agentId === query.agentId);
        }

        if (query?.userId) {
            sessions = sessions.filter(s => s.userId === query.userId);
        }

        if (query?.state) {
            sessions = sessions.filter(s => s.state === query.state);
        }

        if (query?.before) {
            sessions = sessions.filter(s => s.createdAt < query.before!);
        }

        if (query?.after) {
            sessions = sessions.filter(s => s.createdAt > query.after!);
        }

        // Sort by updatedAt desc
        sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

        if (query?.limit) {
            sessions = sessions.slice(0, query.limit);
        }

        return sessions;
    }

    async addMessage(sessionId: SessionId, message: Message): Promise<Session> {
        const session = await this.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        const messages = [...session.messages, message];

        // Enforce max messages — slice is O(max), avoids O(n) shift()
        const trimmed = messages.length > this.config.maxMessagesPerSession
            ? messages.slice(-this.config.maxMessagesPerSession)
            : messages;

        return this.update(sessionId, {
            messages: trimmed,
            state: SessionState.ACTIVE,
        });
    }

    async getMessages(sessionId: SessionId): Promise<Message[]> {
        const session = await this.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        return [...session.messages];
    }

    async clearMessages(sessionId: SessionId): Promise<Session> {
        return this.update(sessionId, { messages: [] });
    }

    async setContext(sessionId: SessionId, key: string, value: unknown): Promise<Session> {
        const session = await this.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        return this.update(sessionId, {
            context: { ...session.context, [key]: value },
        });
    }

    async getContext(sessionId: SessionId, key: string): Promise<unknown> {
        const session = await this.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        return session.context[key];
    }

    async recordRun(run: Omit<SessionRun, 'id'>): Promise<SessionRun> {
        const session = await this.get(run.sessionId);
        if (!session) {
            throw new Error(`Session not found: ${run.sessionId}`);
        }

        const newRun: SessionRun = {
            ...run,
            id: `run-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        };

        const runs = this.runs.get(run.sessionId) ?? [];
        runs.push(newRun);
        this.runs.set(run.sessionId, runs);

        return newRun;
    }

    async getRuns(sessionId: SessionId): Promise<SessionRun[]> {
        return [...(this.runs.get(sessionId) ?? [])];
    }

    async cleanup(): Promise<number> {
        const now = new Date();
        let cleaned = 0;

        for (const [id, session] of this.sessions) {
            if (session.expiresAt && session.expiresAt < now) {
                await this.delete(id);
                cleaned++;
            }
        }

        return cleaned;
    }

    /**
     * Generate a unique ID
     */
    private generateId(): SessionId {
        return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * Enforce max sessions per agent
     */
    private enforceMaxSessions(agentId: string): void {
        const ids = this.agentIndex.get(agentId);
        if (!ids) return;
        const excess = ids.size - this.config.maxSessionsPerAgent;
        if (excess <= 0) return;
        // Iterate insertion order (oldest first in Set) and delete excess
        let removed = 0;
        for (const id of ids) {
            if (removed >= excess) break;
            this.delete(id);
            removed++;
        }
    }
}
