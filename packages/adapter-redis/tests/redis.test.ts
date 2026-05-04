/**
 * Integration tests for @confused-ai/adapter-redis.
 *
 * Skipped automatically when REDIS_URL is not set in the environment.
 * Run with a real Redis instance:
 *
 *   REDIS_URL=redis://localhost:6379 bun test packages/adapter-redis
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisSessionStore } from '../src/session-store.js';
import { RedisRateLimiter, RateLimitError } from '../src/rate-limiter.js';

const SKIP = !process.env.REDIS_URL;
const describeIf = SKIP ? describe.skip : describe;

// We import `redis` dynamically so the test file compiles without redis installed.
type RedisClientType = Awaited<ReturnType<typeof createRedisClient>>;

async function createRedisClient() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { createClient } = (await import('redis')) as any;
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    return client as import('../src/session-store.js').RedisClientLike &
        import('../src/rate-limiter.js').RedisClientForRateLimiter;
}

let client: RedisClientType | null = null;

beforeAll(async () => {
    if (!SKIP) {
        client = await createRedisClient();
    }
});

afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any)?.quit?.();
});

// ── RedisSessionStore ───────────────────────────────────────────────────────

describeIf('RedisSessionStore', () => {
    it('creates and retrieves a session', async () => {
        const store = new RedisSessionStore({ client: client!, ttlSeconds: 60 });

        const sessionId = await store.create('user-1', { source: 'test' });
        expect(typeof sessionId).toBe('string');
        expect(sessionId).toContain('user-1');

        const session = await store.get(sessionId);
        expect(session).not.toBeNull();
        expect(session!.userId).toBe('user-1');
        expect(session!.messages).toHaveLength(0);
        expect(session!.metadata.source).toBe('test');

        await store.delete(sessionId);
    });

    it('appends messages to a session', async () => {
        const store = new RedisSessionStore({ client: client!, ttlSeconds: 60 });
        const sessionId = await store.create('user-2');

        await store.append(sessionId, [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
        ]);

        const session = await store.get(sessionId);
        expect(session!.messages).toHaveLength(2);
        expect(session!.messages[0].role).toBe('user');
        expect(session!.messages[1].content).toBe('Hi there!');

        await store.delete(sessionId);
    });

    it('returns null for unknown session', async () => {
        const store = new RedisSessionStore({ client: client! });
        const result = await store.get('non-existent-session-id');
        expect(result).toBeNull();
    });

    it('deletes a session', async () => {
        const store = new RedisSessionStore({ client: client!, ttlSeconds: 60 });
        const sessionId = await store.create('user-3');
        await store.delete(sessionId);
        const result = await store.get(sessionId);
        expect(result).toBeNull();
    });

    it('touches a session to refresh TTL', async () => {
        const store = new RedisSessionStore({ client: client!, ttlSeconds: 60 });
        const sessionId = await store.create('user-4');
        // Should not throw
        await expect(store.touch(sessionId, 120)).resolves.toBeUndefined();
        await store.delete(sessionId);
    });

    it('lists sessions by user', async () => {
        const store = new RedisSessionStore({ client: client!, ttlSeconds: 60 });
        const id1 = await store.create('user-list-test');
        const id2 = await store.create('user-list-test');

        const sessions = await store.listByUser('user-list-test');
        const ids = sessions.map((s) => s.id);
        expect(ids).toContain(id1);
        expect(ids).toContain(id2);

        await store.delete(id1);
        await store.delete(id2);
    });
});

// ── RedisRateLimiter ────────────────────────────────────────────────────────

describeIf('RedisRateLimiter', () => {
    it('allows requests within the limit', async () => {
        const limiter = new RedisRateLimiter({
            client: client!,
            name: `test-rl-${Date.now()}`,
            maxRequests: 5,
            windowMs: 10_000,
        });

        for (let i = 0; i < 5; i++) {
            const allowed = await limiter.tryAcquire('u1');
            expect(allowed).toBe(true);
        }
    });

    it('blocks requests that exceed the limit', async () => {
        const limiter = new RedisRateLimiter({
            client: client!,
            name: `test-rl-block-${Date.now()}`,
            maxRequests: 3,
            windowMs: 10_000,
        });

        for (let i = 0; i < 3; i++) {
            await limiter.tryAcquire('u2');
        }

        const blocked = await limiter.tryAcquire('u2');
        expect(blocked).toBe(false);
    });

    it('execute() throws RateLimitError when exceeded', async () => {
        const limiter = new RedisRateLimiter({
            client: client!,
            name: `test-rl-throw-${Date.now()}`,
            maxRequests: 1,
            windowMs: 10_000,
        });

        await limiter.execute(async () => 'first');

        await expect(limiter.execute(async () => 'second')).rejects.toBeInstanceOf(RateLimitError);
    });

    it('scopes limits per identifier', async () => {
        const limiter = new RedisRateLimiter({
            client: client!,
            name: `test-rl-scope-${Date.now()}`,
            maxRequests: 2,
            windowMs: 10_000,
        });

        await limiter.tryAcquire('userA');
        await limiter.tryAcquire('userA');
        // userA is at limit
        expect(await limiter.tryAcquire('userA')).toBe(false);
        // userB should still be allowed
        expect(await limiter.tryAcquire('userB')).toBe(true);
    });
});

// ── Unit tests (no Redis needed) ────────────────────────────────────────────

describe('RateLimitError', () => {
    it('has correct name and message', () => {
        const err = new RateLimitError('api:write', 60_000);
        expect(err.name).toBe('RateLimitError');
        expect(err.message).toContain('api:write');
        expect(err.retryAfterMs).toBe(60_000);
    });
});
