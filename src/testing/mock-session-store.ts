/**
 * Mock session store for testing
 *
 * In-memory session store that tracks interactions
 */

import type { SessionStore, SessionQuery, SessionRun } from '../session/types.js';
import type { Session } from '../session/types.js';
import type { Message } from '../providers/types.js';

/**
 * Mock session store for unit tests
 *
 * @example
 * ```ts
 * const mockStore = new MockSessionStore();
 *
 * const agent = createAgent({
 *   name: 'Test Agent',
 *   instructions: 'Test',
 *   sessionStore: mockStore,
 * });
 *
 * // Verify session was created
 * expect(mockStore.getCreatedSessionIds()).toContain('session-id');
 * ```
 */
export class MockSessionStore implements SessionStore {
    private sessions = new Map<string, Session>();
    private runs = new Map<string, SessionRun[]>();
    private createdSessionIds: string[] = [];
    private deletedSessionIds: string[] = [];

    async create(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): Promise<Session> {
        const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const created: Session = {
            ...session,
            id,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.sessions.set(id, created);
        this.createdSessionIds.push(id);
        return created;
    }

    async get(sessionId: string): Promise<Session | null> {
        return this.sessions.get(sessionId) || null;
    }

    async update(sessionId: string, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<Session> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const updated: Session = { ...session, ...updates, updatedAt: new Date() };
        this.sessions.set(sessionId, updated);
        return updated;
    }

    async delete(sessionId: string): Promise<boolean> {
        const deleted = this.sessions.delete(sessionId);
        if (deleted) {
            this.deletedSessionIds.push(sessionId);
        }
        return deleted;
    }

    async list(query?: SessionQuery): Promise<Session[]> {
        let sessions = Array.from(this.sessions.values());
        if (query?.userId) sessions = sessions.filter(s => s.userId === query.userId);
        if (query?.agentId) sessions = sessions.filter(s => s.agentId === query.agentId);
        if (query?.state) sessions = sessions.filter(s => s.state === query.state);
        if (query?.limit) sessions = sessions.slice(0, query.limit);
        return sessions;
    }

    async addMessage(sessionId: string, message: Message): Promise<Session> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`Session ${sessionId} not found`);
        const updated: Session = {
            ...session,
            messages: [...session.messages, message],
            updatedAt: new Date(),
        };
        this.sessions.set(sessionId, updated);
        return updated;
    }

    async getMessages(sessionId: string): Promise<Message[]> {
        const session = this.sessions.get(sessionId);
        return session?.messages ?? [];
    }

    async clearMessages(sessionId: string): Promise<Session> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`Session ${sessionId} not found`);
        const updated: Session = { ...session, messages: [], updatedAt: new Date() };
        this.sessions.set(sessionId, updated);
        return updated;
    }

    async setContext(sessionId: string, key: string, value: unknown): Promise<Session> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`Session ${sessionId} not found`);
        const updated: Session = {
            ...session,
            context: { ...session.context, [key]: value },
            updatedAt: new Date(),
        };
        this.sessions.set(sessionId, updated);
        return updated;
    }

    async getContext(sessionId: string, key: string): Promise<unknown> {
        const session = this.sessions.get(sessionId);
        return session?.context?.[key];
    }

    async recordRun(run: Omit<SessionRun, 'id'>): Promise<SessionRun> {
        const id = `run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const recorded: SessionRun = { ...run, id };
        const existing = this.runs.get(run.sessionId) ?? [];
        existing.push(recorded);
        this.runs.set(run.sessionId, existing);
        return recorded;
    }

    async getRuns(sessionId: string): Promise<SessionRun[]> {
        return this.runs.get(sessionId) ?? [];
    }

    async cleanup(): Promise<number> {
        return 0;
    }

    /** Get IDs of sessions that were created */
    getCreatedSessionIds(): string[] {
        return this.createdSessionIds;
    }

    /** Get IDs of sessions that were deleted */
    getDeletedSessionIds(): string[] {
        return this.deletedSessionIds;
    }

    /** Reset the store */
    reset(): void {
        this.sessions.clear();
        this.runs.clear();
        this.createdSessionIds = [];
        this.deletedSessionIds = [];
    }

    /** Get all sessions (for debugging) */
    getAllSessions(): Map<string, Session> {
        return new Map(this.sessions);
    }
}
