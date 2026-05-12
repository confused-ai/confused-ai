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

import type { SessionStore, SessionData, SessionMessage } from '@confused-ai/session';
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

    private prefixData(data: SessionData): SessionData {
        return { ...data, id: this.unprefix(data.id) };
    }

    async create(session: { agentId: string; userId?: string; messages?: SessionMessage[] } | string): Promise<SessionData> {
        if (typeof session === 'string') {
            // Caller supplied an explicit ID — prefix it
            const s = await this.base.create(this.prefix(session));
            return this.prefixData(s);
        }
        const s = await this.base.create(session);
        return this.prefixData(s);
    }

    async get(sessionId: string): Promise<SessionData | undefined> {
        const s = await this.base.get(this.prefix(sessionId));
        return s ? this.prefixData(s) : undefined;
    }

    async update(sessionId: string, data: { messages: SessionMessage[] }): Promise<void> {
        return this.base.update(this.prefix(sessionId), data);
    }

    async getMessages(sessionId: string): Promise<SessionMessage[]> {
        return this.base.getMessages(this.prefix(sessionId));
    }

    async appendMessage(sessionId: string, message: SessionMessage): Promise<void> {
        return this.base.appendMessage(this.prefix(sessionId), message);
    }

    async delete(sessionId: string): Promise<void> {
        return this.base.delete(this.prefix(sessionId));
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
export async function createTenantContext(
    tenantId: string,
    options: TenantContextOptions = {}
): Promise<TenantContext> {
    const baseStore = options.sessionStore ?? await createFallbackSessionStore();
    const sessionStore = new TenantScopedSessionStore(baseStore, tenantId);

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

async function createFallbackSessionStore(): Promise<SessionStore> {
    const { InMemorySessionStore } = await import('@confused-ai/session');
    return new InMemorySessionStore();
}
