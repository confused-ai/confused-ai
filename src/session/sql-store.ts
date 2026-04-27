/**
 * SQL-backed session store. Works with any DB via SessionDbDriver.
 */

import type {
    SessionStore,
    Session,
    SessionRun,
    SessionId,
    SessionQuery,
    SessionStoreConfig,
} from './types.js';
import { SessionState } from './types.js';
import type { SessionDbDriver, SessionRow, SessionRunRow } from './db-driver.js';
import type { Message } from '../providers/types.js';

const DEFAULT_CONFIG: Required<SessionStoreConfig> = {
    defaultTtlMs: 24 * 60 * 60 * 1000,
    maxSessionsPerAgent: 100,
    maxMessagesPerSession: 1000,
};

function toSession(row: SessionRow): Session {
    return {
        id: row.id,
        agentId: row.agent_id,
        userId: row.user_id ?? undefined,
        state: row.state as SessionState,
        messages: JSON.parse(row.messages || '[]') as Message[],
        metadata: (JSON.parse(row.metadata || '{}') as Session['metadata']) ?? {},
        context: (JSON.parse(row.context || '{}') as Record<string, unknown>) ?? {},
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    };
}

function toSessionRun(row: SessionRunRow): SessionRun {
    return {
        id: row.id,
        sessionId: row.session_id,
        agentId: row.agent_id,
        startTime: new Date(row.start_time),
        endTime: row.end_time ? new Date(row.end_time) : undefined,
        status: row.status as SessionRun['status'],
        steps: row.steps,
        result: row.result != null ? JSON.parse(row.result) : undefined,
        error: row.error ?? undefined,
    };
}

function genId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * SQL session store. Use with SessionDbDriver (SQLite, PostgreSQL, etc.).
 */
export class SqlSessionStore implements SessionStore {
    private driver: SessionDbDriver;
    private config: Required<SessionStoreConfig>;
    private tableSessions: string;
    private tableRuns: string;

    constructor(
        driver: SessionDbDriver,
        config: SessionStoreConfig & { tablePrefix?: string } = {}
    ) {
        this.driver = driver;
        this.config = { ...DEFAULT_CONFIG, ...config };
        const prefix = config.tablePrefix ?? 'agent';
        this.tableSessions = `${prefix}_sessions`;
        this.tableRuns = `${prefix}_session_runs`;
    }

    /** Create tables if they don't exist. Call once at startup. */
    async migrate(): Promise<void> {
        const exec = this.driver.exec ?? ((sql: string) => this.driver.run(sql));
        await exec(
            `CREATE TABLE IF NOT EXISTS ${this.tableSessions} (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                user_id TEXT,
                state TEXT NOT NULL,
                messages TEXT NOT NULL DEFAULT '[]',
                metadata TEXT NOT NULL DEFAULT '{}',
                context TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT
            )`
        );
        await exec(
            `CREATE TABLE IF NOT EXISTS ${this.tableRuns} (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT,
                status TEXT NOT NULL,
                steps INTEGER NOT NULL DEFAULT 0,
                result TEXT,
                error TEXT
            )`
        );
    }

    async create(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): Promise<Session> {
        const id = genId('session');
        const now = new Date().toISOString();
        const messages = JSON.stringify(session.messages ?? []);
        const metadata = JSON.stringify(session.metadata ?? {});
        const context = JSON.stringify(session.context ?? {});
        const expiresAt = session.expiresAt?.toISOString() ?? null;

        await this.driver.run(
            `INSERT INTO ${this.tableSessions} (id, agent_id, user_id, state, messages, metadata, context, created_at, updated_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                session.agentId,
                session.userId ?? null,
                session.state,
                messages,
                metadata,
                context,
                now,
                now,
                expiresAt,
            ]
        );

        await this.enforceMaxSessions(session.agentId);

        return this.get(id) as Promise<Session>;
    }

    async get(sessionId: SessionId): Promise<Session | null> {
        const rows = await this.driver.query<SessionRow>(
            `SELECT * FROM ${this.tableSessions} WHERE id = ?`,
            [sessionId]
        );
        const row = rows[0];
        if (!row) return null;

        if (row.expires_at && new Date(row.expires_at) < new Date()) {
            await this.delete(sessionId);
            return null;
        }

        return toSession(row);
    }

    async update(sessionId: SessionId, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<Session> {
        const existing = await this.get(sessionId);
        if (!existing) throw new Error(`Session not found: ${sessionId}`);

        const updated: Session = { ...existing, ...updates, updatedAt: new Date() };
        const messages = JSON.stringify(updated.messages);
        const metadata = JSON.stringify(updated.metadata);
        const context = JSON.stringify(updated.context);
        const expiresAt = updated.expiresAt?.toISOString() ?? null;

        await this.driver.run(
            `UPDATE ${this.tableSessions} SET agent_id = ?, user_id = ?, state = ?, messages = ?, metadata = ?, context = ?, updated_at = ?, expires_at = ?
             WHERE id = ?`,
            [
                updated.agentId,
                updated.userId ?? null,
                updated.state,
                messages,
                metadata,
                context,
                updated.updatedAt.toISOString(),
                expiresAt,
                sessionId,
            ]
        );

        return this.get(sessionId) as Promise<Session>;
    }

    async delete(sessionId: SessionId): Promise<boolean> {
        await this.driver.run(`DELETE FROM ${this.tableRuns} WHERE session_id = ?`, [sessionId]);
        await this.driver.run(`DELETE FROM ${this.tableSessions} WHERE id = ?`, [sessionId]);
        return true;
    }

    async list(query?: SessionQuery): Promise<Session[]> {
        let sql = `SELECT * FROM ${this.tableSessions} WHERE 1=1`;
        const params: unknown[] = [];

        if (query?.agentId) {
            sql += ' AND agent_id = ?';
            params.push(query.agentId);
        }
        if (query?.userId) {
            sql += ' AND user_id = ?';
            params.push(query.userId);
        }
        if (query?.state) {
            sql += ' AND state = ?';
            params.push(query.state);
        }
        if (query?.before) {
            sql += ' AND created_at < ?';
            params.push(query.before.toISOString());
        }
        if (query?.after) {
            sql += ' AND created_at > ?';
            params.push(query.after.toISOString());
        }

        sql += ' ORDER BY updated_at DESC';
        if (query?.limit) {
            sql += ' LIMIT ?';
            params.push(query.limit);
        }

        const rows = await this.driver.query<SessionRow>(sql, params);
        return rows.map(toSession);
    }

    async addMessage(sessionId: SessionId, message: Message): Promise<Session> {
        const session = await this.get(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);

        const messages = [...session.messages, message];
        // slice(-max) is non-mutating and avoids O(n) shift() for large arrays
        const trimmed = messages.length > this.config.maxMessagesPerSession
            ? messages.slice(-this.config.maxMessagesPerSession)
            : messages;

        return this.update(sessionId, { messages: trimmed, state: SessionState.ACTIVE });
    }

    async getMessages(sessionId: SessionId): Promise<Message[]> {
        const session = await this.get(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        return [...session.messages];
    }

    async clearMessages(sessionId: SessionId): Promise<Session> {
        return this.update(sessionId, { messages: [] });
    }

    async setContext(sessionId: SessionId, key: string, value: unknown): Promise<Session> {
        const session = await this.get(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        return this.update(sessionId, { context: { ...session.context, [key]: value } });
    }

    async getContext(sessionId: SessionId, key: string): Promise<unknown> {
        const session = await this.get(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        return session.context[key];
    }

    async recordRun(run: Omit<SessionRun, 'id'>): Promise<SessionRun> {
        const session = await this.get(run.sessionId);
        if (!session) throw new Error(`Session not found: ${run.sessionId}`);

        const id = genId('run');
        await this.driver.run(
            `INSERT INTO ${this.tableRuns} (id, session_id, agent_id, start_time, end_time, status, steps, result, error)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                run.sessionId,
                run.agentId,
                run.startTime.toISOString(),
                run.endTime?.toISOString() ?? null,
                run.status,
                run.steps,
                run.result != null ? JSON.stringify(run.result) : null,
                run.error ?? null,
            ]
        );

        const rows = await this.driver.query<SessionRunRow>(`SELECT * FROM ${this.tableRuns} WHERE id = ?`, [id]);
        return toSessionRun(rows[0]!);
    }

    async getRuns(sessionId: SessionId): Promise<SessionRun[]> {
        const rows = await this.driver.query<SessionRunRow>(
            `SELECT * FROM ${this.tableRuns} WHERE session_id = ? ORDER BY start_time DESC`,
            [sessionId]
        );
        return rows.map(toSessionRun);
    }

    async cleanup(): Promise<number> {
        const now = new Date().toISOString();
        const rows = await this.driver.query<{ id: string }>(
            `SELECT id FROM ${this.tableSessions} WHERE expires_at IS NOT NULL AND expires_at < ?`,
            [now]
        );
        for (const r of rows) {
            await this.delete(r.id);
        }
        return rows.length;
    }

    private async enforceMaxSessions(agentId: string): Promise<void> {
        const rows = await this.driver.query<{ id: string; created_at: string }>(
            `SELECT id, created_at FROM ${this.tableSessions} WHERE agent_id = ? ORDER BY created_at ASC`,
            [agentId]
        );
        const excess = rows.length - this.config.maxSessionsPerAgent;
        if (excess > 0) {
            for (let i = 0; i < excess; i++) {
                await this.delete(rows[i]!.id);
            }
        }
    }
}
