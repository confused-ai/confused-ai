/**
 * @confused-ai/adapter-redis
 *
 * Drop-in Redis backends for confused-ai agents:
 * - `RedisSessionStore` — distributed conversation session persistence
 * - `RedisRateLimiter` — sliding-window rate limiter
 *
 * @example
 * ```ts
 * import { createClient } from 'redis';
 * import { RedisSessionStore, RedisRateLimiter } from '@confused-ai/adapter-redis';
 *
 * const redis = createClient({ url: process.env.REDIS_URL });
 * await redis.connect();
 *
 * const sessions = new RedisSessionStore({ client: redis });
 * const limiter  = new RedisRateLimiter({ client: redis, name: 'api', maxRequests: 60 });
 * ```
 */

export {
    RedisSessionStore,
    type RedisSessionStoreConfig,
    type RedisClientLike,
    type RedisMultiLike,
} from './session-store.js';

export {
    RedisRateLimiter,
    RateLimitError,
    type RedisRateLimiterConfig,
    type RedisClientForRateLimiter,
} from './rate-limiter.js';
