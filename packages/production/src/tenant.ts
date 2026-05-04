/**
 * Tenant Context — per-tenant isolation for session stores, rate limiters,
 * cost trackers, and audit logs.
 *
 * Provides per-tenant isolation for user_id / session_id automatically. Call
 * `createTenantContext(tenantId)` and get back a set of stores that automatically namespace all keys.
 *
 * @example
 * ```ts
 * import { createAgent } from 'confused-ai';
 * import { createTenantContext } from 'confused-ai/production';
 * import { createSqliteSessionStore } from 'confused-ai/session';
 *
 * const baseSessionStore = await createSqliteSessionStore('./agent.db');
 *
 * // In your request handler, scope to the authenticated tenant:
 * const ctx = createTenantContext('tenant-acme', { sessionStore: baseSessionStore });
 *
 * const agent = createAgent({
 *   name: 'Support',
 *   sessionStore: ctx.sessionStore,  // all keys prefixed with 'tenant-acme:'
 *   rateLimitAdapter: ctx.rateLimiter,
 * });
 * ```
 */

import type { SessionStore } from '@confused-ai/session';
import type { SessionQuery, Session, SessionId, SessionRun } from '@confused-ai/session';
import type { Message } from '@confused-ai/core';
import { RateLimiter } from './rate-limiter.js';
import type { RateLimiterConfig } from './rate-limiter.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TenantContextOptions {
    /** Base session store to wrap. */
    sessionStore?: SessionStore;
    /** Per-tenant rate limiter config. */
    rateLimitConfig?: Omit<RateLimiterConfig, 'name'>;
}

export interface TenantContext {
    readonly tenantId: string;
    /** Session store scoped to this tenant (all keys prefixed). */
    readonly sessionStore: SessionStore;
    /** Rate limiter scoped to this tenant. */
    readonly rateLimiter: RateLimiter;
    /** Inject tenantId into `AgentRunOptions`. */
    readonly runContext: { userId?: string; tenantId: string };
}

// ── Tenant-scoped session store wrapper ────────────────────────────────────

/**
 * Wraps a `SessionStore` and prefixes all session IDs with `tenantId:`,
 * ensuring complete data isolation between tenants without separate databases.
 */
export class TenantScopedSessionStore implements SessionStore {
    constructor(
        private readonly base: SessionStore,
        private readonly tenantId: string
    ) {}

    private prefix(id: string): string {
        return `${this.tenantId}:${id}`;
    }

    private unprefix(id: string): string {
        const p = `${this.tenantId}:`;
        return id.startsWith(p) ? id.slice(p.length) : id;
    }

    private prefixSession(session: Session): Session {
        return { ...session, id: this.unprefix(session.id) as SessionId };
    }

    async create(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): Promise<Session> {
        const s = await this.base.create(session);
        return this.prefixSession(s);
    }

    async get(sessionId: SessionId): Promise<Session | null> {
        const s = await this.base.get(this.prefix(sessionId));
        return s ? this.prefixSession(s) : null;
    }

    async update(sessionId: SessionId, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<Session> {
        const s = await this.base.update(this.prefix(sessionId), updates);
        return this.prefixSession(s);
    }

    async delete(sessionId: SessionId): Promise<boolean> {
        return this.base.delete(this.prefix(sessionId));
    }

    async list(query?: SessionQuery): Promise<Session[]> {
        const sessions = await this.base.list(query);
        return sessions
            .filter((s) => s.id.startsWith(`${this.tenantId}:`))
            .map((s) => this.prefixSession(s));
    }

    async addMessage(sessionId: SessionId, message: Message): Promise<Session> {
        const s = await this.base.addMessage(this.prefix(sessionId), message);
        return this.prefixSession(s);
    }

    async getMessages(sessionId: SessionId): Promise<Message[]> {
        return this.base.getMessages(this.prefix(sessionId));
    }

    async clearMessages(sessionId: SessionId): Promise<Session> {
        const s = await this.base.clearMessages(this.prefix(sessionId));
        return this.prefixSession(s);
    }

    async setContext(sessionId: SessionId, key: string, value: unknown): Promise<Session> {
        const s = await this.base.setContext(this.prefix(sessionId), key, value);
        return this.prefixSession(s);
    }

    async getContext(sessionId: SessionId, key: string): Promise<unknown> {
        return this.base.getContext(this.prefix(sessionId), key);
    }

    async recordRun(run: Omit<SessionRun, 'id'>): Promise<SessionRun> {
        return this.base.recordRun({ ...run, sessionId: this.prefix(run.sessionId) });
    }

    async getRuns(sessionId: SessionId): Promise<SessionRun[]> {
        return this.base.getRuns(this.prefix(sessionId));
    }

    async cleanup(): Promise<number> {
        return this.base.cleanup();
    }
}

// ── TenantRegistry — central config store ─────────────────────────────────

export interface TenantConfig {
    readonly tenantId: string;
    /** Max requests per minute for this tenant. */
    readonly maxRpm?: number;
    /** Max USD per day for this tenant. */
    readonly maxUsdPerDay?: number;
    /** Allowed model list (if undefined, all models allowed). */
    readonly allowedModels?: string[];
    readonly metadata?: Record<string, unknown>;
}

/** Central registry of tenant configurations. */
export class TenantRegistry {
    private tenants = new Map<string, TenantConfig>();

    register(config: TenantConfig): void {
        this.tenants.set(config.tenantId, config);
    }

    get(tenantId: string): TenantConfig | undefined {
        return this.tenants.get(tenantId);
    }

    list(): TenantConfig[] {
        return Array.from(this.tenants.values());
    }

    delete(tenantId: string): void {
        this.tenants.delete(tenantId);
    }
}

// ── createTenantContext ────────────────────────────────────────────────────

/**
 * Create a per-tenant context with automatically scoped stores and rate limiters.
 *
 * @param tenantId - Unique identifier for the tenant.
 * @param options - Base stores and config to scope.
 */
export function createTenantContext(
    tenantId: string,
    options: TenantContextOptions = {}
): TenantContext {
    const sessionStore = options.sessionStore
        ? new TenantScopedSessionStore(options.sessionStore, tenantId)
        : new TenantScopedSessionStore(createFallbackSessionStore(), tenantId);

    const rateLimiter = new RateLimiter({
        name: `tenant:${tenantId}`,
        maxRequests: options.rateLimitConfig?.maxRequests ?? 60,
        intervalMs: options.rateLimitConfig?.intervalMs ?? 60_000,
        burstCapacity: options.rateLimitConfig?.burstCapacity ?? 10,
        overflowMode: options.rateLimitConfig?.overflowMode ?? 'reject',
    });

    return {
        tenantId,
        sessionStore,
        rateLimiter,
        runContext: { tenantId },
    };
}

// ── Fallback session store (in-memory) ────────────────────────────────────

function createFallbackSessionStore(): SessionStore {
    // Lazy import to avoid circular deps
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { InMemorySessionStore } = require('../session/in-memory-store.js') as { InMemorySessionStore: new () => SessionStore };
    return new InMemorySessionStore();
}
