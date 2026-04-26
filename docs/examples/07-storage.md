# 07 · Storage Patterns 🟡

The `createStorage()` abstraction gives you one consistent API for caching,
state, configuration, and checkpointing — regardless of where you store the data.

## What you'll learn

- Memory storage (fast, non-persistent, great for dev/testing)
- File storage (persist to disk, no external services)
- How to cache tool results
- How to store agent state (progress, config)

## The storage API

```ts
import { createStorage } from 'confused-ai/storage';

const store = createStorage({ type: 'memory' }); // or 'file'

await store.set('key', { any: 'value' });
const val = await store.get('key');       // { any: 'value' } | null
await store.delete('key');
const exists = await store.has('key');   // boolean
const keys = await store.keys('prefix:*'); // glob matching
await store.clear();
```

## 1 · In-Memory Storage

Zero setup. Lost on restart. Perfect for development and testing.

```ts
const store = createStorage({ type: 'memory' });
```

## 2 · File Storage

Persists to a JSON file. No database needed.

```ts
const store = createStorage({
  type: 'file',
  path: './data/agent-state.json',
});
```

## 3 · Cache Tool Results

Wrap any tool with caching using the storage layer:

```ts
import { z } from 'zod';
import { tool, extendTool } from 'confused-ai';
import { createStorage } from 'confused-ai/storage';

const cache = createStorage({ type: 'file', path: './data/tool-cache.json' });

const geocodeTool = tool({
  name: 'geocode',
  description: 'Convert a city name to lat/lon coordinates',
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    // Expensive API call — cache it!
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=1`);
    const data = await res.json();
    const place = data.results?.[0];
    return { lat: place?.latitude, lon: place?.longitude, name: place?.name };
  },
});

// Cached version — never calls the API twice for the same city
const cachedGeocode = extendTool(geocodeTool, {
  name: 'geocodeCached',
  beforeExecute: async (params, ctx) => {
    // Attach cache to context so transformOutput can access it
    (ctx as Record<string, unknown>)._cacheKey = `geocode:${params.city.toLowerCase()}`;
  },
  transformInput: async (params, ctx) => {
    const key = `geocode:${params.city.toLowerCase()}`;
    const hit = await cache.get<{ lat: number; lon: number; name: string }>(key);
    if (hit) {
      // Short-circuit: cancel real execution, return cached value
      // (throw a special signal to return cached data)
      throw Object.assign(new Error('__cache_hit__'), { cachedValue: hit });
    }
    return params;
  },
  onError: async (err, params) => {
    if (err.message === '__cache_hit__') {
      return (err as unknown as { cachedValue: unknown }).cachedValue as ReturnType<typeof geocodeTool.execute> extends Promise<infer T> ? T : never;
    }
    throw err;
  },
  afterExecute: async (output, params) => {
    await cache.set(`geocode:${params.city.toLowerCase()}`, output);
  },
});
```

### Simpler cache pattern with `wrapTool`

```ts
import { wrapTool } from 'confused-ai';

function withCache<T extends ZodObject<ZodRawShape>, O>(
  base: LightweightTool<T, O>,
  store: StorageAdapter,
  ttlMs = 60_000
) {
  return wrapTool(base, [
    async (params, ctx, next) => {
      const key = `${base.name}:${JSON.stringify(params)}`;
      const cached = await store.get<O>(key);
      if (cached) return cached;
      const result = await next(params, ctx);
      await store.set(key, result, { ttl: ttlMs });
      return result;
    },
  ]);
}

const cachedGeocode = withCache(geocodeTool, cache, 24 * 60 * 60_000); // 24h TTL
```

## 4 · Track Agent Progress

Useful for long-running workflows that need to resume after interruption:

```ts
const progressStore = createStorage({ type: 'file', path: './data/progress.json' });

async function processDocuments(docIds: string[]) {
  // Load previously completed IDs
  const completed = new Set(await progressStore.get<string[]>('completed') ?? []);

  for (const id of docIds) {
    if (completed.has(id)) {
      console.log(`Skipping ${id} (already done)`);
      continue;
    }

    await processDocument(id);

    completed.add(id);
    await progressStore.set('completed', [...completed]); // checkpoint
  }
}
```

## 5 · Store Agent Configuration

```ts
const configStore = createStorage({ type: 'file', path: './config/agent.json' });

// Set defaults on first run
await configStore.set('defaults', {
  maxTokens: 2048,
  temperature: 0.7,
  language: 'en',
});

// Load at runtime
const config = await configStore.get('defaults');
const agent = createAgent({
  model: 'gpt-4o-mini',
  modelOptions: { maxTokens: config.maxTokens },
});
```

## 6 · Rate Limiter Using Storage

```ts
async function checkRateLimit(userId: string, limit = 10, windowMs = 60_000): Promise<boolean> {
  const key = `ratelimit:${userId}`;
  const now = Date.now();
  const record = await store.get<{ count: number; windowStart: number }>(key);

  if (!record || now - record.windowStart > windowMs) {
    await store.set(key, { count: 1, windowStart: now });
    return true; // allowed
  }
  if (record.count >= limit) return false; // blocked
  await store.set(key, { ...record, count: record.count + 1 });
  return true; // allowed
}
```

## What's next?

- [11 · Customer Support Bot](./11-support-bot) — storage inside a full production bot
- [13 · Production Resilience](./13-production) — circuit breakers + checkpointing
