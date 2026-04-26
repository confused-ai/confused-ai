/**
 * Session management types and interfaces
 */

import type { EntityId } from '../core/types.js';
import type { Message } from '../providers/types.js';

/**
 * Unique session identifier
 */
export type SessionId = string;

/**
 * Session state
 */
export enum SessionState {
    ACTIVE = 'active',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    EXPIRED = 'expired',
}

/**
 * Session metadata
 */
export interface SessionMetadata {
    readonly title?: string;
    readonly description?: string;
    readonly tags?: string[];
    readonly custom?: Record<string, unknown>;
}

/**
 * Session entry representing a conversation session
 */
export interface Session {
    readonly id: SessionId;
    readonly agentId: EntityId;
    readonly userId?: string;
    readonly state: SessionState;
    readonly messages: Message[];
    readonly metadata: SessionMetadata;
    readonly context: Record<string, unknown>;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly expiresAt?: Date;
}

/**
 * Run/execution entry within a session
 */
export interface SessionRun {
    readonly id: string;
    readonly sessionId: SessionId;
    readonly agentId: EntityId;
    readonly startTime: Date;
    readonly endTime?: Date;
    readonly status: 'running' | 'completed' | 'failed' | 'interrupted';
    readonly steps: number;
    readonly result?: unknown;
    readonly error?: string;
}

/**
 * Configuration for session store
 */
export interface SessionStoreConfig {
    readonly defaultTtlMs?: number;
    readonly maxSessionsPerAgent?: number;
    readonly maxMessagesPerSession?: number;
}

/**
 * Query options for session retrieval
 */
export interface SessionQuery {
    readonly agentId?: EntityId;
    readonly userId?: string;
    readonly state?: SessionState;
    readonly limit?: number;
    readonly before?: Date;
    readonly after?: Date;
}

/**
 * Session store interface for persisting conversation and run state
 */
export interface SessionStore {
    /**
     * Create a new session
     */
    create(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): Promise<Session>;

    /**
     * Get a session by ID
     */
    get(sessionId: SessionId): Promise<Session | null>;

    /**
     * Update an existing session
     */
    update(sessionId: SessionId, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<Session>;

    /**
     * Delete a session
     */
    delete(sessionId: SessionId): Promise<boolean>;

    /**
     * List sessions matching query
     */
    list(query?: SessionQuery): Promise<Session[]>;

    /**
     * Add a message to a session
     */
    addMessage(sessionId: SessionId, message: Message): Promise<Session>;

    /**
     * Get messages from a session
     */
    getMessages(sessionId: SessionId): Promise<Message[]>;

    /**
     * Clear messages from a session
     */
    clearMessages(sessionId: SessionId): Promise<Session>;

    /**
     * Set session context data
     */
    setContext(sessionId: SessionId, key: string, value: unknown): Promise<Session>;

    /**
     * Get session context data
     */
    getContext(sessionId: SessionId, key: string): Promise<unknown>;

    /**
     * Record a run within a session
     */
    recordRun(run: Omit<SessionRun, 'id'>): Promise<SessionRun>;

    /**
     * Get runs for a session
     */
    getRuns(sessionId: SessionId): Promise<SessionRun[]>;

    /**
     * Clean up expired sessions
     */
    cleanup(): Promise<number>;
}
