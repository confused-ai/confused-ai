# Storage

The storage module provides a generic key-value store with pluggable backends. Use it to persist configuration, cache data, store artifacts, or keep any structured state.

> **See also:** For a unified approach to storage *and* all other infrastructure (sessions, memory, RAG, auth, rate-limiting, audit logging …), see the [Adapters guide](./adapters.md) and `createProductionSetup()`.

## Quick start

```ts
import { createStorage } from 'confused-ai';
// or: import { createStorage } from 'confused-ai/storage';

// In-memory (dev / testing)
const store = createStorage();

// Set a value (JSON-serialized automatically)
await store.set('user:123', { name: 'Alice', plan: 'pro' });

// Get a typed value
const user = await store.get<{ name: string; plan: string }>('user:123');
console.log(user?.name); // Alice

// TTL — expires in 1 hour
await store.set('session:abc', { token: 'jwt...' }, 3600);

// List all keys with a prefix
const keys = await store.list('user:'); // ['user:123']

// Check existence
const exists = await store.has('user:123'); // true

// Delete
await store.delete('user:123');

// Clear all
await store.clear();
```

## Drivers

### Memory (default)

Zero-config, lives in RAM. Perfect for dev and testing.

```ts
const store = createStorage();
// or explicitly:
const store = createStorage({ driver: 'memory' });
```

### File

Persists to disk as JSON files. Good for local development, single-node edge functions, or CLI tools.

```ts
const store = createStorage({
  driver: 'file',
  basePath: './data/storage',  // directory will be created automatically
});

// Keys with ':' are stored as nested directories:
// user:123:prefs  →  ./data/storage/user/123/prefs.json
await store.set('user:123:prefs', { theme: 'dark' });
```

### Custom adapter

Bring your own storage backend — Redis, S3, Azure Blob, Cloudflare KV, Turso, etc.:

```ts
import { createStorage, type StorageAdapter } from 'confused-ai/storage';
import Redis from 'ioredis';

const redis = new Redis();

const redisAdapter: StorageAdapter = {
  async get(key) {
    return (await redis.get(key)) ?? undefined;
  },
  async set(key, value, ttl) {
    if (ttl) await redis.set(key, value, 'EX', ttl);
    else await redis.set(key, value);
  },
  async delete(key) {
    await redis.del(key);
  },
  async list(prefix) {
    return redis.keys(prefix ? `${prefix}*` : '*');
  },
  async has(key) {
    return (await redis.exists(key)) === 1;
  },
  async clear() {
    await redis.flushdb();
  },
};

const store = createStorage({ adapter: redisAdapter });
```

## Storage interface

```ts
interface Storage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  readonly adapter: StorageAdapter;
}
```

## Common patterns

### Agent state persistence

```ts
const agentStore = createStorage({ driver: 'file', basePath: './agent-state' });

// Save agent state between runs
await agentStore.set(`agent:${agentId}:lastRun`, { timestamp: Date.now(), output });
const lastRun = await agentStore.get(`agent:${agentId}:lastRun`);
```

### Tool result caching

```ts
const cache = createStorage();

const cachedSearch = tool({
  name: 'cachedSearch',
  description: 'Search with result caching',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    const key = `search:${query}`;
    const cached = await cache.get(key);
    if (cached) return cached;

    const result = await doRealSearch(query);
    await cache.set(key, result, 300); // cache for 5 minutes
    return result;
  },
});
```

### Feature flags / config

```ts
const config = createStorage({ driver: 'file', basePath: './config' });

await config.set('features', {
  ragEnabled: true,
  maxAgents: 5,
  allowedModels: ['gpt-4o', 'claude-3-5-sonnet-latest'],
});

const features = await config.get<{ ragEnabled: boolean }>('features');
if (features?.ragEnabled) {
  // enable RAG
}
```

## StorageAdapter interface

Implement this to add any backend:

```ts
interface StorageAdapter {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  has(key: string): Promise<boolean>;
  clear?(): Promise<void>;  // optional
}
```

The high-level `Storage` layer wraps adapters with JSON serialization — adapter implementations always work with raw strings.
