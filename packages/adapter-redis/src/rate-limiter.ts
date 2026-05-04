/**
 * RedisRateLimiter — distributed sliding-window rate limiter.
 *
 * Uses a Redis sorted-set + Lua script for atomic sliding-window enforcement.
 * Each call stores the current timestamp as both score and member.
 * Old entries (outside the window) are pruned atomically.
 *
 * This avoids the race between INCR and EXPIRE present in fixed-window limiters.
 *
 * @example
 * ```ts
 * import { createClient } from 'redis';
 * import { RedisRateLimiter } from '@confused-ai/adapter-redis';
 *
 * const redis = createClient({ url: process.env.REDIS_URL });
 * await redis.connect();
 *
 * const limiter = new RedisRateLimiter({
 *   client: redis,
 *   name: 'api:per-user',
 *   maxRequests: 60,
 *   windowMs: 60_000,
 * });
 *
 * // In a request handler:
 * const allowed = await limiter.tryAcquire(`user:${userId}`);
 * if (!allowed) return res.status(429).send('Too Many Requests');
 * ```
 */

export class RateLimitError extends Error {
    constructor(
        public readonly limiterName: string,
        public readonly retryAfterMs: number,
    ) {
        super(`Rate limit exceeded for "${limiterName}". Retry after ${String(retryAfterMs)}ms.`);
        this.name = 'RateLimitError';
    }
}

export interface RedisClientForRateLimiter {
    /**
     * Execute a Lua script.
     * node-redis v4: `client.eval(script, { keys, arguments })`
     * Note: the adapter handles both calling conventions.
     */
    eval(
        script: string,
        options: { keys: string[]; arguments: string[] },
    ): Promise<unknown>;
}

export interface RedisRateLimiterConfig {
    /** Pre-connected redis v4 client. */
    readonly client: RedisClientForRateLimiter;
    /** Logical limiter name (used in error messages and key construction). */
    readonly name: string;
    /** Maximum number of requests allowed in the window. */
    readonly maxRequests: number;
    /** Sliding window length in milliseconds. Default: 60_000 (1 minute). */
    readonly windowMs?: number;
    /** Key prefix. Default: `ca:rl:`. */
    readonly keyPrefix?: string;
}

/**
 * Atomic sliding-window Lua script.
 *
 * KEYS[1]: sorted-set key  (e.g. `ca:rl:api:per-user:user:42`)
 * ARGV[1]: current timestamp (ms, as string)
 * ARGV[2]: window start timestamp (ms, as string)  = now - windowMs
 * ARGV[3]: window TTL in seconds (for EXPIRE)
 * ARGV[4]: max requests (number as string)
 *
 * Returns: 1 if allowed, 0 if rate-limited.
 */
const SLIDING_WINDOW_SCRIPT = `
local key       = KEYS[1]
local now       = tonumber(ARGV[1])
local win_start = tonumber(ARGV[2])
local ttl_secs  = tonumber(ARGV[3])
local max_req   = tonumber(ARGV[4])

-- Remove members outside the window
redis.call('ZREMRANGEBYSCORE', key, '-inf', win_start)

-- Count remaining members
local count = redis.call('ZCARD', key)

if count < max_req then
  -- Add the current request
  redis.call('ZADD', key, now, tostring(now))
  redis.call('EXPIRE', key, ttl_secs)
  return 1
else
  return 0
end
`.trim();

export class RedisRateLimiter {
    private readonly client: RedisClientForRateLimiter;
    private readonly name: string;
    private readonly maxRequests: number;
    private readonly windowMs: number;
    private readonly keyPrefix: string;

    constructor(config: RedisRateLimiterConfig) {
        this.client = config.client;
        this.name = config.name;
        this.maxRequests = config.maxRequests;
        this.windowMs = config.windowMs ?? 60_000;
        this.keyPrefix = config.keyPrefix ?? 'ca:rl:';
    }

    private buildKey(identifier?: string): string {
        const base = `${this.keyPrefix}${this.name}`;
        return identifier ? `${base}:${identifier}` : base;
    }

    /**
     * Attempt to acquire a token.
     *
     * @param identifier - Optional per-user/tenant key suffix. Omit for a shared limiter.
     * @returns `true` if the request is allowed, `false` if rate-limited.
     */
    async tryAcquire(identifier?: string): Promise<boolean> {
        const key = this.buildKey(identifier);
        const now = Date.now();
        const windowStart = now - this.windowMs;
        const ttlSecs = Math.ceil(this.windowMs / 1000) + 1;

        const result = await this.client.eval(SLIDING_WINDOW_SCRIPT, {
            keys: [key],
            arguments: [
                String(now),
                String(windowStart),
                String(ttlSecs),
                String(this.maxRequests),
            ],
        });

        return result === 1;
    }

    /**
     * Execute `fn` only if the rate limit allows it.
     *
     * @param fn - The function to execute.
     * @param identifier - Optional per-user/tenant key suffix.
     * @throws {RateLimitError} if the rate limit is exceeded.
     */
    async execute<T>(fn: () => Promise<T>, identifier?: string): Promise<T> {
        const allowed = await this.tryAcquire(identifier);
        if (!allowed) {
            throw new RateLimitError(this.name, this.windowMs);
        }
        return fn();
    }
}
