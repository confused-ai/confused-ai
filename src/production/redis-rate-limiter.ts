/**
 * Fixed-window distributed rate limiter using Redis INCR + EXPIRE.
 *
 * Share limits across Node processes when all use the same Redis key prefix.
 * Requires `ioredis` (or any {@link RedisClient} with `incr` / `expire`).
 */

import type { RedisRateLimitClient as RedisClient } from './_types.js';
import { RateLimitError } from './rate-limiter.js';

export interface RedisRateLimiterConfig {
    /** Redis client (e.g. `new Redis(process.env.REDIS_URL)`). */
    readonly redis: RedisClient;
    /** Logical limiter name (part of Redis key). */
    readonly name: string;
    /** Max requests per window. */
    readonly maxRequests: number;
    /** Window length in seconds (default: 60). */
    readonly windowSeconds?: number;
    /** Key prefix. Default: `ca:rl:` */
    readonly keyPrefix?: string;
    /**
     * Optional tenant identifier. When set, limits are scoped per-tenant so one
     * tenant's traffic cannot exhaust another tenant's quota.
     */
    readonly tenantId?: string;
}

/**
 * Atomic INCR-then-PEXPIRE-on-first-hit Lua script.
 *
 * Returns the post-increment counter. Running both ops in one server-side script
 * removes the window between INCR and EXPIRE: a crash can no longer leave a key
 * without a TTL (which would otherwise cause a permanent self-DoS).
 */
const INCR_EXPIRE_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return n
`;

/**
 * Distributed fixed-window limiter. Each window is `floor(now / windowSeconds)`.
 */
export class RedisRateLimiter {
    private readonly redis: RedisClient;
    private readonly name: string;
    private readonly maxRequests: number;
    private readonly windowSeconds: number;
    private readonly keyPrefix: string;
    private readonly tenantId?: string;

    constructor(config: RedisRateLimiterConfig) {
        this.redis = config.redis;
        this.name = config.name;
        this.maxRequests = config.maxRequests;
        this.windowSeconds = config.windowSeconds ?? 60;
        this.keyPrefix = config.keyPrefix ?? 'ca:rl:';
        this.tenantId = config.tenantId;
    }

    private windowKey(): string {
        const slot = Math.floor(Date.now() / 1000 / this.windowSeconds);
        // Scope the key per-tenant when configured so tenants get isolated quotas.
        const tenantSegment = this.tenantId ? `${this.tenantId}:` : '';
        return `${this.keyPrefix}${tenantSegment}${this.name}:${slot}`;
    }

    /**
     * Atomically increment the window counter and set its TTL on first hit.
     * Prefers a single Lua `eval` (no INCR/EXPIRE race); falls back to the
     * legacy two-command path for clients that don't support `eval`.
     */
    private async increment(key: string): Promise<number> {
        const ttlMs = (this.windowSeconds + 2) * 1000;
        if (typeof this.redis.eval === 'function') {
            const raw = await this.redis.eval(INCR_EXPIRE_LUA, 1, key, ttlMs);
            return typeof raw === 'number' ? raw : Number(raw);
        }
        // Fallback: not atomic, but still guards the EXPIRE with the first-hit check.
        const n = await this.redis.incr(key);
        if (n === 1) {
            await this.redis.expire(key, this.windowSeconds + 2);
        }
        return n;
    }

    /**
     * Run `fn` only if the current window has not exceeded `maxRequests`.
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        const n = await this.increment(this.windowKey());
        if (n > this.maxRequests) {
            throw new RateLimitError(this.name, this.windowSeconds * 1000);
        }
        return fn();
    }

    /**
     * Try to take one token; returns false if limit exceeded (does not throw).
     */
    async tryAcquire(): Promise<boolean> {
        const n = await this.increment(this.windowKey());
        return n <= this.maxRequests;
    }
}
