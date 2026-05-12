/**
 * Redis tools — get, set, delete, list keys, hash get, increment.
 * Requires: npm install ioredis
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface RedisToolConfig {
    url?: string;
    keyPrefix?: string;
    defaultTtl?: number;
}

interface RedisClient {
    get(k: string): Promise<string | null>;
    set(k: string, v: string, ...a: unknown[]): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    hgetall(k: string): Promise<Record<string, string> | null>;
    hset(k: string, ...a: unknown[]): Promise<number>;
    incr(k: string): Promise<number>;
    incrby(k: string, n: number): Promise<number>;
    quit(): Promise<void>;
}

function makeClient(config: RedisToolConfig): RedisClient {
    const Redis = require('ioredis') as new (url: string) => RedisClient;
    return new Redis(config.url ?? 'redis://localhost:6379');
}

function pk(key: string, prefix?: string): string {
    return prefix ? `${prefix}${key}` : key;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const GetSchema = z.object({ key: z.string().describe('Redis key') });
const SetSchema = z.object({
    key: z.string().describe('Redis key'),
    value: z.string().describe('Value to store'),
    ttl: z.number().int().positive().optional().describe('TTL in seconds'),
});
const DelSchema = z.object({ keys: z.array(z.string()).describe('Keys to delete') });
const KeysSchema = z.object({ pattern: z.string().describe('Glob pattern, e.g. "session:*"') });
const HashGetSchema = z.object({ key: z.string().describe('Hash key') });
const IncrSchema = z.object({
    key: z.string().describe('Counter key'),
    by: z.number().int().optional().default(1).describe('Amount to increment'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class RedisGetTool extends BaseTool<typeof GetSchema, { value: string | null; exists: boolean }> {
    constructor(private config: RedisToolConfig) {
        super({ id: 'redis_get', name: 'Redis Get', description: 'Get a value from Redis by key.', category: ToolCategory.DATABASE, parameters: GetSchema });
    }
    protected async performExecute(input: z.infer<typeof GetSchema>, _ctx: ToolContext) {
        const client = makeClient(this.config);
        const value = await client.get(pk(input.key, this.config.keyPrefix));
        await client.quit();
        return { value, exists: value !== null };
    }
}

export class RedisSetTool extends BaseTool<typeof SetSchema, { success: boolean }> {
    constructor(private config: RedisToolConfig) {
        super({ id: 'redis_set', name: 'Redis Set', description: 'Set a key-value pair in Redis with optional TTL.', category: ToolCategory.DATABASE, parameters: SetSchema });
    }
    protected async performExecute(input: z.infer<typeof SetSchema>, _ctx: ToolContext) {
        const client = makeClient(this.config);
        const ttl = input.ttl ?? this.config.defaultTtl;
        const k = pk(input.key, this.config.keyPrefix);
        if (ttl) {
            await client.set(k, input.value, 'EX', ttl);
        } else {
            await client.set(k, input.value);
        }
        await client.quit();
        return { success: true };
    }
}

export class RedisDeleteTool extends BaseTool<typeof DelSchema, { deleted: number }> {
    constructor(private config: RedisToolConfig) {
        super({ id: 'redis_delete', name: 'Redis Delete', description: 'Delete one or more keys from Redis.', category: ToolCategory.DATABASE, parameters: DelSchema });
    }
    protected async performExecute(input: z.infer<typeof DelSchema>, _ctx: ToolContext) {
        const client = makeClient(this.config);
        const deleted = await client.del(...input.keys.map((k) => pk(k, this.config.keyPrefix)));
        await client.quit();
        return { deleted };
    }
}

export class RedisKeysTool extends BaseTool<typeof KeysSchema, { keys: string[]; count: number }> {
    constructor(private config: RedisToolConfig) {
        super({ id: 'redis_keys', name: 'Redis Keys', description: 'List Redis keys matching a glob pattern.', category: ToolCategory.DATABASE, parameters: KeysSchema });
    }
    protected async performExecute(input: z.infer<typeof KeysSchema>, _ctx: ToolContext) {
        const client = makeClient(this.config);
        const pat = this.config.keyPrefix ? `${this.config.keyPrefix}${input.pattern}` : input.pattern;
        const keys = await client.keys(pat);
        await client.quit();
        return { keys, count: keys.length };
    }
}

export class RedisHashGetTool extends BaseTool<typeof HashGetSchema, { fields: Record<string, string> | null }> {
    constructor(private config: RedisToolConfig) {
        super({ id: 'redis_hash_get', name: 'Redis Hash Get', description: 'Get all fields of a Redis hash (HGETALL).', category: ToolCategory.DATABASE, parameters: HashGetSchema });
    }
    protected async performExecute(input: z.infer<typeof HashGetSchema>, _ctx: ToolContext) {
        const client = makeClient(this.config);
        const fields = await client.hgetall(pk(input.key, this.config.keyPrefix));
        await client.quit();
        return { fields };
    }
}

export class RedisIncrTool extends BaseTool<typeof IncrSchema, { value: number }> {
    constructor(private config: RedisToolConfig) {
        super({ id: 'redis_incr', name: 'Redis Increment', description: 'Increment a Redis counter key by a given amount (default 1).', category: ToolCategory.DATABASE, parameters: IncrSchema });
    }
    protected async performExecute(input: z.infer<typeof IncrSchema>, _ctx: ToolContext) {
        const client = makeClient(this.config);
        const k = pk(input.key, this.config.keyPrefix);
        const value = (input.by ?? 1) === 1 ? await client.incr(k) : await client.incrby(k, input.by ?? 1);
        await client.quit();
        return { value };
    }
}

// ── Toolkit ────────────────────────────────────────────────────────────────

export class RedisToolkit {
    readonly tools: BaseTool[];
    constructor(config: RedisToolConfig = {}) {
        this.tools = [
            new RedisGetTool(config),
            new RedisSetTool(config),
            new RedisDeleteTool(config),
            new RedisKeysTool(config),
            new RedisHashGetTool(config),
            new RedisIncrTool(config),
        ];
    }
}
