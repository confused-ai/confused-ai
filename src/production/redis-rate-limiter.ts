/**
 * Fixed-window distributed rate limiter using Redis INCR + EXPIRE.
 *
 * Share limits across Node processes when all use the same Redis key prefix.
 * Requires `ioredis` (or any {@link RedisClient} with `incr` / `expire`).
 */

import type { RedisClient } from '@confused-ai/session';
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
}

/**
 * Distributed fixed-window limiter. Each window is `floor(now / windowSeconds)`.
 */
export class RedisRateLimiter {
    private readonly redis: RedisClient;
    private readonly name: string;
    private readonly maxRequests: number;
    private readonly windowSeconds: number;
    private readonly keyPrefix: string;

    constructor(config: RedisRateLimiterConfig) {
        this.redis = config.redis;
        this.name = config.name;
        this.maxRequests = config.maxRequests;
        this.windowSeconds = config.windowSeconds ?? 60;
        this.keyPrefix = config.keyPrefix ?? 'ca:rl:';
    }

    private windowKey(): string {
        const slot = Math.floor(Date.now() / 1000 / this.windowSeconds);
        return `${this.keyPrefix}${this.name}:${slot}`;
    }

    /**
     * Run `fn` only if the current window has not exceeded `maxRequests`.
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        const key = this.windowKey();
        const n = await this.redis.incr(key);
        if (n === 1) {
            await this.redis.expire(key, this.windowSeconds + 2);
        }
        if (n > this.maxRequests) {
            throw new RateLimitError(this.name, this.windowSeconds * 1000);
        }
        return fn();
    }

    /**
     * Try to take one token; returns false if limit exceeded (does not throw).
     */
    async tryAcquire(): Promise<boolean> {
        const key = this.windowKey();
        const n = await this.redis.incr(key);
        if (n === 1) {
            await this.redis.expire(key, this.windowSeconds + 2);
        }
        if (n > this.maxRequests) {
            return false;
        }
        return true;
    }
}
