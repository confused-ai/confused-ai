# 04 · Extend & Wrap Tools 🟡

Don't rewrite tools — extend them. `extendTool()`, `wrapTool()`, and `pipeTools()`
let you add caching, logging, auth, retries, and transformations to any existing tool
without touching the original code.

## What you'll learn

- `extendTool()` — add before/after hooks and input/output transforms
- `wrapTool()` — middleware pipeline (like Express middleware, but for tools)
- `pipeTools()` — chain two tools where output of first feeds into second
- `versionTool()` — tag tools with a version for deprecation management

---

## 1 · `extendTool()` — Add Hooks

```ts
import { z } from 'zod';
import { tool, extendTool } from 'confused-ai';

// Original tool (imagine this comes from a library you can't modify)
const fetchWeather = tool({
  name: 'fetchWeather',
  description: 'Get weather data for a city',
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    const res = await fetch(`https://wttr.in/${city}?format=j1`);
    return res.json();
  },
});

// Extended version — adds logging + result trimming + error fallback
const smartWeather = extendTool(fetchWeather, {
  name: 'smartWeather',
  description: 'Weather with logging, caching, and graceful error handling',

  // Runs BEFORE execute — return false to cancel the call
  beforeExecute: async (params, ctx) => {
    console.log(`[${new Date().toISOString()}] Fetching weather for: ${params.city}`);
    // You could check rate limits here, return false to cancel
  },

  // Transform input before it reaches the original tool
  transformInput: (params) => ({
    // Normalize city name — trim whitespace, title-case
    city: params.city.trim().replace(/\b\w/g, c => c.toUpperCase()),
  }),

  // Transform output after the original tool returns
  transformOutput: (data) => ({
    // Only return what the agent actually needs
    temp_c: data.current_condition?.[0]?.temp_C ?? 'unknown',
    feels_like: data.current_condition?.[0]?.FeelsLikeC ?? 'unknown',
    description: data.current_condition?.[0]?.weatherDesc?.[0]?.value ?? 'unknown',
  }),

  // Runs AFTER execute — great for analytics, caching
  afterExecute: async (output, params) => {
    console.log(`[weather] ${params.city}: ${output.temp_c}°C`);
    // e.g. await analytics.track('weather_fetched', { city: params.city });
  },

  // If anything goes wrong, return a safe fallback instead of crashing
  onError: async (error, params) => {
    console.error(`Weather fetch failed for ${params.city}:`, error.message);
    return { temp_c: 'unavailable', feels_like: 'unavailable', description: 'Service temporarily unavailable' };
  },
});
```

---

## 2 · `wrapTool()` — Middleware Pipeline

Think of this like Express middleware — each layer can modify the request,
call `next()`, and modify the response.

```ts
import { wrapTool } from 'confused-ai';

// In-memory cache (swap with Redis for production)
const cache = new Map<string, { data: unknown; expiresAt: number }>();

const cachedWeather = wrapTool(fetchWeather, [
  // Layer 1: Auth guard — must run first (outermost)
  async (params, ctx, next) => {
    if (!ctx.metadata?.apiKey) {
      throw new Error('API key required');
    }
    return next(params, ctx);
  },

  // Layer 2: In-memory cache
  async (params, ctx, next) => {
    const key = `weather:${params.city}`;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      console.log(`[cache] HIT for ${params.city}`);
      return hit.data;
    }
    const result = await next(params, ctx);
    cache.set(key, { data: result, expiresAt: Date.now() + 5 * 60 * 1000 }); // 5 min TTL
    console.log(`[cache] SET for ${params.city}`);
    return result;
  },

  // Layer 3: Timing (innermost — closest to the actual call)
  async (params, ctx, next) => {
    const start = performance.now();
    const result = await next(params, ctx);
    console.log(`[timing] fetchWeather took ${(performance.now() - start).toFixed(1)}ms`);
    return result;
  },
], { name: 'cachedWeather' });
```

The execution order is:
```
Auth guard → Cache check → Timing start → [actual tool] → Timing end → Cache set → return
```

---

## 3 · `pipeTools()` — Chain Two Tools

Feed the output of one tool directly into the input of another.

```ts
import { z } from 'zod';
import { tool, pipeTools } from 'confused-ai';

// Tool 1: Fetch raw HTML from a URL
const fetchUrl = tool({
  name: 'fetchUrl',
  description: 'Fetch the HTML content of a URL',
  parameters: z.object({ url: z.string().url() }),
  execute: async ({ url }) => {
    const res = await fetch(url);
    return { body: await res.text(), url };
  },
});

// Tool 2: Extract plain text from HTML
const extractText = tool({
  name: 'extractText',
  description: 'Extract readable text from HTML',
  parameters: z.object({ html: z.string() }),
  execute: async ({ html }) => {
    // Simple tag stripper — use a proper HTML parser in production
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { text: text.slice(0, 2000) }; // first 2000 chars
  },
});

// Pipe them: fetchUrl → extractText
const fetchAndRead = pipeTools(fetchUrl, extractText, {
  name: 'fetchAndRead',
  description: 'Fetch a URL and return clean readable text',
  // Map fetchUrl output → extractText input
  adapter: (fetchResult) => ({ html: fetchResult.body }),
});

// Now one tool does both jobs
const result = await fetchAndRead.execute({ url: 'https://example.com' }, {});
// result.data.text → "Example Domain This domain is for use in..."
```

---

## 4 · `versionTool()` — Version Management

```ts
import { versionTool } from 'confused-ai';

// Tag with a version (non-breaking)
const searchV2 = versionTool(searchTool, '2.0', {
  changelog: 'Returns structured results with source URLs instead of plain text',
});

// Mark old version as deprecated
const searchV1 = versionTool(searchTool, '1.0', {
  deprecated: true,
  replacedBy: 'searchV2',
});
// searchV1.description now includes: "[DEPRECATED — use searchV2 instead]"
```

---

## Combine Everything

```ts
// Start with a basic tool
const base = tool({ ... });

// Step 1: Add caching via middleware
const cached = wrapTool(base, [cacheMiddleware]);

// Step 2: Add logging + error recovery via extendTool
const production = extendTool(cached, {
  beforeExecute: (p) => logger.info('tool_call', p),
  onError: (err) => ({ error: err.message, fallback: true }),
});

// Step 3: Register with agent
const agent = createAgent({
  tools: [production],
});
```

## What's next?

- [05 · RAG Knowledge Base](./05-rag) — query your own documents
- [08 · Multi-Agent Team](./08-team) — agents that use these tools together
