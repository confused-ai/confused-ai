/**
 * @confused-ai/session — session store types.
 * Consumed by @confused-ai/core via the SessionStore interface.
 */

export interface SessionData {
  readonly id: string;
  readonly agentId: string;
  readonly userId?: string;
  readonly messages: ReadonlyArray<SessionMessage>;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly metadata?: Record<string, unknown>;
}

export interface SessionMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  readonly name?: string;
  readonly tool_call_id?: string;
}

/**
 * SessionStore — minimal interface (ISP).
 * Four methods covering the full lifecycle — no more.
 */
export interface SessionStore {
  get(id: string): Promise<SessionData | undefined>;
  create(data: { agentId: string; userId?: string; messages?: SessionMessage[] }): Promise<SessionData>;
  update(id: string, data: { messages: SessionMessage[] }): Promise<void>;
  getMessages(id: string): Promise<SessionMessage[]>;
  delete(id: string): Promise<void>;
}

// ── Richer session types (used by @confused-ai/production tenant module) ─────

export type SessionId = string;

export enum SessionState {
    ACTIVE = 'active',
    IDLE = 'idle',
    ARCHIVED = 'archived',
    EXPIRED = 'expired',
}

export interface SessionMetadata {
    readonly tags?: string[];
    readonly source?: string;
    readonly priority?: number;
    readonly [key: string]: unknown;
}

export interface Session {
    readonly id: SessionId;
    readonly agentId: string;
    readonly userId?: string;
    readonly state: SessionState;
    readonly messages: SessionMessage[];
    readonly metadata: SessionMetadata;
    readonly context: Record<string, unknown>;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly expiresAt?: Date;
}

export interface SessionRun {
    readonly id: string;
    readonly sessionId: SessionId;
    readonly agentId: string;
    readonly startTime: Date;
    readonly endTime?: Date;
    readonly status: 'running' | 'completed' | 'failed' | 'interrupted';
    readonly steps: number;
    readonly result?: unknown;
    readonly error?: string;
}

export interface SessionQuery {
    readonly agentId?: string;
    readonly userId?: string;
    readonly state?: SessionState;
    readonly limit?: number;
    readonly before?: Date;
    readonly after?: Date;
}
