/**
 * Redis Session Store & Cache Adapter
 *
 * Drop-in Redis backend for:
 *   1. `SessionStore` — full conversation session persistence (replaces InMemorySessionStore)
 *   2. `LLMCache` adapter — distributed LLM response caching (replaces in-process LRU)
 *
 * Uses ioredis under the hood. Install:  `npm install ioredis`
 *
 * Design decisions & edge cases covered:
 *
 * SessionStore:
 *   - Sessions serialized as JSON in Redis hashes (HSET) — avoids storing the
 *     whole session as a single JSON blob so addMessage is O(1) via RPUSH on a
 *     separate list key instead of deserialize-append-serialize.
 *   - TTL: every write refreshes the expiry so active sessions never expire.
 *   - addMessage uses RPUSH on `session:{id}:messages` + LTRIM to enforce maxMessages.
 *   - getMessages uses LRANGE — no full session deserialization.
 *   - list() uses SCAN (not KEYS) to avoid blocking large Redis instances.
 *   - delete() removes both the hash and the messages list atomically via a pipeline.
 *   - cleanExpired() is a no-op (Redis TTL handles expiry automatically).
 *   - Connection errors bubble as-is so callers can retry or fall back.
 *
 * LLM Cache:
 *   - Keys: `llmcache:{sha256(content)}` — same deterministic hash as the in-memory cache.
 *   - Values: JSON-serialized GenerateResult.
 *   - TTL: configurable, default 1 hour.
 *   - SET NX (setnx-style via SET ... EX ... NX) prevents cache stampede.
 *   - On GET: deserializes + returns; on deserialization failure returns null (cache miss).
 *
 * Both classes lazily connect — no connection required at construction time.
 * Pass a pre-built ioredis instance or a connection string.
 */

import { createHash } from 'node:crypto';
import type { SessionStore, Session, SessionRun, SessionId, SessionQuery } from './types.js';
import { SessionState } from './types.js';
import type { Message } from '../providers/types.js';
import type { GenerateResult } from '../providers/types.js';

// ── Redis client interface (matches ioredis public API) ────────────────────
// We define a minimal interface so the file compiles without ioredis installed.
// At runtime, pass a real ioredis instance.

export interface RedisClient {
    get(key: string): Promise<string | null>;
    /** Atomic increment (used by distributed rate limiting). */
    incr(key: string): Promise<number>;
    set(key: string, value: string): Promise<'OK' | null>;
    set(key: string, value: string, exFlag: 'EX', seconds: number): Promise<'OK' | null>;
    set(key: string, value: string, exFlag: 'EX', seconds: number, nxFlag: 'NX'): Promise<'OK' | null>;
    del(...keys: string[]): Promise<number>;
    exists(...keys: string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    hset(key: string, ...args: (string | number)[]): Promise<number>;
    hgetall(key: string): Promise<Record<string, string> | null>;
    rpush(key: string, ...values: string[]): Promise<number>;
    ltrim(key: string, start: number, stop: number): Promise<'OK'>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    llen(key: string): Promise<number>;
    scan(cursor: string, matchFlag: 'MATCH', pattern: string, countFlag: 'COUNT', count: number): Promise<[string, string[]]>;
    pipeline(): RedisPipeline;
    quit(): Promise<'OK'>;
}

export interface RedisPipeline {
    del(...keys: string[]): this;
    exec(): Promise<Array<[Error | null, unknown]> | null>;
}

// ── Key helpers ────────────────────────────────────────────────────────────

const KEY_PREFIX_SESSION = 'ca:session:';
const KEY_PREFIX_MESSAGES = 'ca:session:messages:';
const KEY_PREFIX_RUNS = 'ca:session:runs:';
const KEY_PREFIX_CACHE = 'ca:llmcache:';

function sessionKey(id: string): string { return `${KEY_PREFIX_SESSION}${id}`; }
function messagesKey(id: string): string { return `${KEY_PREFIX_MESSAGES}${id}`; }
function runsKey(id: string): string { return `${KEY_PREFIX_RUNS}${id}`; }

function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Redis Session Store ────────────────────────────────────────────────────

export interface RedisSessionStoreConfig {
    /** ioredis instance. */
    redis: RedisClient;
    /** Session TTL in seconds. Refreshed on every write. Default: 86400 (24h). */
    ttlSeconds?: number;
    /** Maximum messages per session (oldest trimmed). Default: 1000. */
    maxMessages?: number;
}

/**
 * Production Redis-backed session store.
 * Drop-in replacement for InMemorySessionStore.
 *
 * @example
 * ```ts
 * import Redis from 'ioredis';
 * import { RedisSessionStore } from 'confused-ai/session';
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const sessions = new RedisSessionStore({ redis });
 *
 * const agent = createAgent({
 *   name: 'My Agent',
 *   instructions: '...',
 *   sessionStore: sessions,
 * });
 * ```
 */
export class RedisSessionStore implements SessionStore {
    private readonly redis: RedisClient;
    private readonly ttlSeconds: number;
    private readonly maxMessages: number;

    constructor(config: RedisSessionStoreConfig) {
        this.redis = config.redis;
        this.ttlSeconds = config.ttlSeconds ?? 86_400;
        this.maxMessages = config.maxMessages ?? 1_000;
    }

    async create(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): Promise<Session> {
        const id = generateId();
        const now = new Date();
        const full: Session = {
            ...session,
            id,
            createdAt: now,
            updatedAt: now,
        };
        await this._saveSession(full);
        return full;
    }

    async get(sessionId: SessionId): Promise<Session | null> {
        const hash = await this.redis.hgetall(sessionKey(sessionId));
        if (!hash || Object.keys(hash).length === 0) return null;
        return this._deserializeSession(hash);
    }

    async update(
        sessionId: SessionId,
        updates: Partial<Omit<Session, 'id' | 'createdAt'>>
    ): Promise<Session> {
        const existing = await this.get(sessionId);
        if (!existing) throw new Error(`Session not found: ${sessionId}`);
        const updated: Session = { ...existing, ...updates, updatedAt: new Date() };
        await this._saveSession(updated);
        return updated;
    }

    async delete(sessionId: SessionId): Promise<boolean> {
        const pipeline = this.redis.pipeline();
        pipeline.del(sessionKey(sessionId), messagesKey(sessionId), runsKey(sessionId));
        await pipeline.exec();
        return true;
    }

    async list(query?: SessionQuery): Promise<Session[]> {
        const sessions: Session[] = [];
        let cursor = '0';
        const pattern = `${KEY_PREFIX_SESSION}*`;

        do {
            const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            // Filter out messages/runs keys
            const sessionKeys = keys.filter(
                (k) => !k.startsWith(KEY_PREFIX_MESSAGES) && !k.startsWith(KEY_PREFIX_RUNS)
            );
            for (const key of sessionKeys) {
                const hash = await this.redis.hgetall(key);
                if (!hash || Object.keys(hash).length === 0) continue;
                const session = this._deserializeSession(hash);
                if (this._matchesQuery(session, query)) {
                    sessions.push(session);
                }
            }
        } while (cursor !== '0');

        return query?.limit ? sessions.slice(0, query.limit) : sessions;
    }

    async addMessage(sessionId: SessionId, message: Message): Promise<Session> {
        const key = messagesKey(sessionId);
        await this.redis.rpush(key, JSON.stringify(message));
        // Trim to max; keep last N messages (-maxMessages to -1 = last N)
        await this.redis.ltrim(key, -this.maxMessages, -1);
        await this.redis.expire(key, this.ttlSeconds);
        return this.update(sessionId, {});
    }

    async getMessages(sessionId: SessionId): Promise<Message[]> {
        const raw = await this.redis.lrange(messagesKey(sessionId), 0, -1);
        return raw.map((r) => JSON.parse(r) as Message);
    }

    async clearMessages(sessionId: SessionId): Promise<Session> {
        await this.redis.del(messagesKey(sessionId));
        return this.update(sessionId, {});
    }

    async setContext(sessionId: SessionId, key: string, value: unknown): Promise<Session> {
        const session = await this.get(sessionId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        const context = { ...session.context, [key]: value };
        return this.update(sessionId, { context });
    }

    async getContext(sessionId: SessionId, key: string): Promise<unknown> {
        const session = await this.get(sessionId);
        return session?.context[key] ?? undefined;
    }

    async recordRun(run: Omit<SessionRun, 'id'>): Promise<SessionRun> {
        const full: SessionRun = { ...run, id: generateId() };
        const key = runsKey(run.sessionId);
        await this.redis.rpush(key, JSON.stringify(full));
        await this.redis.expire(key, this.ttlSeconds);
        return full;
    }

    async getRuns(sessionId: SessionId): Promise<SessionRun[]> {
        const raw = await this.redis.lrange(runsKey(sessionId), 0, -1);
        return raw.map((r) => JSON.parse(r) as SessionRun);
    }

    async cleanup(): Promise<number> {
        // Redis TTLs handle expiry; nothing to scan-delete here
        return 0;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private async _saveSession(session: Session): Promise<void> {
        const key = sessionKey(session.id);
        // Serialize flat fields into Redis hash (messages stored separately)
        const { messages: _messages, ...rest } = session;
        await this.redis.hset(key,
            'id', rest.id,
            'agentId', rest.agentId,
            'userId', rest.userId ?? '',
            'state', rest.state,
            'metadata', JSON.stringify(rest.metadata),
            'context', JSON.stringify(rest.context),
            'createdAt', rest.createdAt.toISOString(),
            'updatedAt', rest.updatedAt.toISOString(),
            'expiresAt', rest.expiresAt?.toISOString() ?? '',
        );
        await this.redis.expire(key, this.ttlSeconds);
    }

    private _deserializeSession(hash: Record<string, string>): Session {
        return {
            id: hash.id ?? '',
            agentId: hash.agentId ?? '',
            userId: hash.userId || undefined,
            state: (hash.state as SessionState) ?? SessionState.ACTIVE,
            messages: [], // loaded separately via getMessages
            metadata: hash.metadata ? (JSON.parse(hash.metadata) as Session['metadata']) : {},
            context: hash.context ? (JSON.parse(hash.context) as Record<string, unknown>) : {},
            createdAt: new Date(hash.createdAt ?? 0),
            updatedAt: new Date(hash.updatedAt ?? 0),
            expiresAt: hash.expiresAt ? new Date(hash.expiresAt) : undefined,
        };
    }

    private _matchesQuery(session: Session, query?: SessionQuery): boolean {
        if (!query) return true;
        if (query.agentId && session.agentId !== query.agentId) return false;
        if (query.userId && session.userId !== query.userId) return false;
        if (query.state && session.state !== query.state) return false;
        if (query.after && session.createdAt < query.after) return false;
        if (query.before && session.createdAt > query.before) return false;
        return true;
    }
}

// ── Redis LLM Cache ─────────────────────────────────────────────────────────

export interface RedisLlmCacheConfig {
    /** ioredis instance. */
    redis: RedisClient;
    /** Cache TTL in seconds. Default: 3600 (1 hour). */
    ttlSeconds?: number;
    /** Key namespace prefix. Default: 'ca:llmcache:'. */
    keyPrefix?: string;
}

/** Key shape for {@link RedisLlmCache} (align with `LLMCache` usage). */
export interface RedisLlmCacheKeyInput {
    messages: unknown[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: unknown[];
}

/**
 * Distributed Redis-backed LLM response cache.
 *
 * Compatible with the in-memory LLMCache API. Wire into any LLMProvider via the
 * caching wrapper in `confused-ai/llm`.
 *
 * @example
 * ```ts
 * import Redis from 'ioredis';
 * import { RedisLlmCache } from 'confused-ai/session';
 *
 * const cache = new RedisLlmCache({ redis: new Redis(process.env.REDIS_URL) });
 * // Wrap your provider:
 * const cachedLlm = new CachedLLMProvider(baseProvider, cache);
 * ```
 */
export class RedisLlmCache {
    private readonly redis: RedisClient;
    private readonly ttlSeconds: number;
    private readonly prefix: string;
    private hits = 0;
    private misses = 0;

    constructor(config: RedisLlmCacheConfig) {
        this.redis = config.redis;
        this.ttlSeconds = config.ttlSeconds ?? 3_600;
        this.prefix = config.keyPrefix ?? KEY_PREFIX_CACHE;
    }

    private hash(input: RedisLlmCacheKeyInput): string {
        const canonical = JSON.stringify({
            messages: input.messages,
            model: input.model ?? '__default__',
            temperature: input.temperature ?? null,
            maxTokens: input.maxTokens ?? null,
            tools: input.tools ?? [],
        });
        return createHash('sha256').update(canonical).digest('hex');
    }

    private prefixKey(hash: string): string {
        return `${this.prefix}${hash}`;
    }

    async get(input: RedisLlmCacheKeyInput): Promise<GenerateResult | null> {
        const key = this.prefixKey(this.hash(input));
        let raw: string | null;
        try {
            raw = await this.redis.get(key);
        } catch {
            // Redis error → cache miss (fail open)
            this.misses++;
            return null;
        }
        if (!raw) {
            this.misses++;
            return null;
        }
        try {
            this.hits++;
            return JSON.parse(raw) as GenerateResult;
        } catch {
            // Corrupt cache entry → treat as miss
            this.misses++;
            await this.redis.del(key).catch(() => { /* ignore */ });
            return null;
        }
    }

    async set(input: RedisLlmCacheKeyInput, result: GenerateResult): Promise<void> {
        const key = this.prefixKey(this.hash(input));
        const value = JSON.stringify(result);
        try {
            // SET ... EX ttl NX = only store if not already cached (prevent stampede overwrite)
            await this.redis.set(key, value, 'EX', this.ttlSeconds, 'NX');
        } catch {
            // Cache write failure is non-fatal
        }
    }

    async delete(input: RedisLlmCacheKeyInput): Promise<void> {
        await this.redis.del(this.prefixKey(this.hash(input)));
    }

    getStats(): { hits: number; misses: number; hitRate: number } {
        const total = this.hits + this.misses;
        return { hits: this.hits, misses: this.misses, hitRate: total > 0 ? this.hits / total : 0 };
    }

    async quit(): Promise<void> {
        await this.redis.quit();
    }
}
