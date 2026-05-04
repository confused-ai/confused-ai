/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @confused-ai/session — Redis session store (distributed, horizontally scalable).
 *
 * SRP  — owns only Redis session persistence.
 * DIP  — implements SessionStore interface.
 * Lazy — ioredis loaded inside factory; zero cost if unused.
 * DS   — Redis hashes for O(1) field access. TTL managed by Redis natively.
 *         Keys follow namespace:sessionId pattern for multi-tenant isolation.
 */

import type { SessionStore, SessionData } from './types.js';

interface RedisClientLike {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/** Minimal ioredis-compatible client interface for typing purposes. */
export interface RedisClient {
    get(key: string): Promise<string | null>;
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
    pipeline(): { exec(): Promise<unknown> };
    quit(): Promise<'OK'>;
}

type RedisConstructor = new (options?: string | object) => RedisClientLike;

const MISSING_SDK_MSG =
  '[confused-ai] Redis session store requires ioredis.\n' +
  '  Install: npm install ioredis';

export interface RedisSessionStoreOptions {
  /** ioredis connection URL or options. Defaults to redis://localhost:6379. */
  redis?: string | object;
  /** Key prefix for namespacing. Default: "confused-ai:session:". */
  keyPrefix?: string;
  /** TTL in seconds. Default: 86400 (24 hours). */
  ttl?: number;
}

export function createRedisStore(opts: RedisSessionStoreOptions = {}): SessionStore {
  const keyPrefix = opts.keyPrefix ?? 'confused-ai:session:';
  const ttl       = opts.ttl ?? 86_400;

  // Lazy SDK load
   
  let IORedis: RedisConstructor;
  try {
    const redisModule = require('ioredis') as { default?: RedisConstructor } | RedisConstructor;
    const RedisImpl = typeof redisModule === 'function' ? redisModule : redisModule.default;
    if (!RedisImpl) throw new Error(MISSING_SDK_MSG);
    IORedis = RedisImpl;
  } catch {
    throw new Error(MISSING_SDK_MSG);
  }

  const client = new IORedis(
    typeof opts.redis === 'string'
      ? opts.redis
      : opts.redis ?? 'redis://localhost:6379',
  );

  const key = (id: string) => `${keyPrefix}${id}`;

  return {
    async get(id) {
      const data = await client.get(key(id));
      return data ? (JSON.parse(data) as SessionData) : undefined;
    },

    async create(data) {
      const id      = crypto.randomUUID();
      const now     = Date.now();
      const session: SessionData = {
        id,
        agentId:   data.agentId,
        messages:  data.messages ?? [],
        createdAt: now,
        updatedAt: now,
        ...(data.userId !== undefined && { userId: data.userId }),
      };
      await client.setex(key(id), ttl, JSON.stringify(session));
      return session;
    },

    async update(id, data) {
      const existing = await this.get(id);
      if (!existing) return;
      const updated: SessionData = { ...existing, messages: data.messages, updatedAt: Date.now() };
      await client.setex(key(id), ttl, JSON.stringify(updated));
    },

    async getMessages(id) {
      const session = await this.get(id);
      return [...(session?.messages ?? [])];
    },

    async delete(id) {
      await client.del(key(id));
    },
  };
}
