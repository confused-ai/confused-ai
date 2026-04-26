# 15 · Full-Stack App 🔴

Everything in one place: an HTTP API server, a RAG knowledge base, persistent
memory, tool extensions, multi-agent team, observability hooks, and resilience
patterns. This is what a production fluxion deployment looks like.

## What you'll learn

- How all features compose together
- HTTP API server exposing a streaming chat endpoint
- Multi-turn sessions with persistent memory
- RAG from a knowledge base
- Fallback chain + circuit breaker for resilience
- Structured logging + cost tracking

## File Structure

```
my-ai-app/
├── src/
│   ├── index.ts          ← HTTP server
│   ├── agent.ts          ← Agent setup
│   ├── tools.ts          ← All tools
│   └── knowledge.ts      ← RAG setup
├── data/
│   ├── knowledge/        ← Your documents
│   ├── memory.json       ← Persisted user memory
│   └── vectors.json      ← Persisted vector store
├── .env
└── package.json
```

---

## `src/knowledge.ts`

```ts
// knowledge.ts — RAG setup
import { KnowledgeEngine, TextLoader, URLLoader } from 'fluxion/knowledge';
import { OpenAIEmbeddingProvider } from 'fluxion/memory';
import { InMemoryVectorStore } from 'fluxion/memory';
import { createStorage } from 'fluxion/storage';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function buildKnowledge() {
  const embeddings = new OpenAIEmbeddingProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'text-embedding-3-small',
  });
  const vectorStore = new InMemoryVectorStore();
  const storage = createStorage({ type: 'file', path: './data/vectors.json' });

  const engine = new KnowledgeEngine({
    embeddingProvider: embeddings,
    vectorStore,
    chunkSize: 400,
    chunkOverlap: 40,
  });

  // Try to restore persisted vectors (avoid re-embedding on restart)
  const saved = await storage.get('vectors');
  if (saved) {
    await vectorStore.restore(saved);
    console.log(`[knowledge] Restored ${await vectorStore.count()} chunks`);
  } else {
    // First run — load and embed all docs
    const files = await readdir('./data/knowledge');
    for (const file of files) {
      const content = await readFile(join('./data/knowledge', file), 'utf-8');
      await engine.loadText(content, { source: file });
    }
    await storage.set('vectors', await vectorStore.dump());
    console.log(`[knowledge] Indexed ${await vectorStore.count()} chunks`);
  }

  return engine;
}
```

---

## `src/tools.ts`

```ts
// tools.ts — all application tools
import { z } from 'zod';
import { tool, extendTool, wrapTool } from 'fluxion';
import { createStorage } from 'fluxion/storage';

const toolCache = createStorage({ type: 'file', path: './data/tool-cache.json' });

// ── Weather tool (with cache) ─────────────────────────────────────────────
const rawWeather = tool({
  name: 'getWeather',
  description: 'Get current weather for a city',
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    const res = await fetch(`https://wttr.in/${city}?format=j1`);
    const d = await res.json();
    return {
      city,
      temp_c: d.current_condition?.[0]?.temp_C,
      description: d.current_condition?.[0]?.weatherDesc?.[0]?.value,
    };
  },
});

export const weatherTool = wrapTool(rawWeather, [
  // 10-minute cache
  async (params, ctx, next) => {
    const key = `weather:${params.city.toLowerCase()}`;
    const hit = await toolCache.get(key);
    if (hit) return hit as Awaited<ReturnType<typeof rawWeather.execute>>;
    const result = await next(params, ctx);
    await toolCache.set(key, result);
    return result;
  },
]);

// ── Calculator tool ───────────────────────────────────────────────────────
export const calculator = tool({
  name: 'calculate',
  description: 'Evaluate a mathematical expression',
  parameters: z.object({ expression: z.string().describe('A safe math expression like "2 + 2 * 3"') }),
  execute: async ({ expression }) => {
    // Only allow safe math characters
    if (!/^[\d\s+\-*/().^%]+$/.test(expression)) {
      throw new Error('Invalid expression — only numbers and basic operators allowed');
    }
    const result = Function(`"use strict"; return (${expression})`)();
    return { expression, result };
  },
});

// ── Web search (logged) ───────────────────────────────────────────────────
const rawSearch = tool({
  name: 'webSearch',
  description: 'Search the web',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => ({
    results: [{ title: 'Result 1', snippet: 'Example result...', url: 'https://example.com' }],
  }),
});

export const webSearch = extendTool(rawSearch, {
  beforeExecute: (p) => { console.log(`[search] ${p.query}`); },
  onError: () => ({ results: [], error: 'Search temporarily unavailable' }),
});
```

---

## `src/agent.ts`

```ts
// agent.ts — agent setup with all features
import { createAgent } from 'fluxion';
import { FallbackChain } from 'fluxion/llm';
import { InMemoryStore } from 'fluxion/memory';
import { createStorage } from 'fluxion/storage';
import { weatherTool, calculator, webSearch } from './tools.js';
import { buildKnowledge } from './knowledge.js';
import type { KnowledgeEngine } from 'fluxion/knowledge';

const storage = createStorage({ type: 'file', path: './data/memory.json' });
const longTermMemory = new InMemoryStore({ storage });
await longTermMemory.load();

const knowledge = await buildKnowledge();

// Resilient model with fallbacks
const model = new FallbackChain([
  { provider: 'openai',    model: 'gpt-4o',       timeout: 25_000 },
  { provider: 'openai',    model: 'gpt-4o-mini',  timeout: 15_000 },
]);

// Track sessions (userId → InMemoryStore)
const sessions = new Map<string, InMemoryStore>();

export function getSessionStore(userId: string): InMemoryStore {
  if (!sessions.has(userId)) {
    sessions.set(userId, new InMemoryStore());
  }
  return sessions.get(userId)!;
}

export const agent = createAgent({
  name: 'full-stack-agent',
  model,
  instructions: `
    You are a helpful assistant with access to web search, weather data, and a knowledge base.
    Remember user preferences and use them to personalize your responses.
    Always cite sources when using the knowledge base.
    Keep responses concise unless asked for detail.
  `,
  tools: [
    weatherTool.toFrameworkTool(),
    calculator.toFrameworkTool(),
    webSearch.toFrameworkTool(),
  ],
  knowledge,
  knowledgeTopK: 3,
  memory: longTermMemory,
  retry: { maxAttempts: 2 },
  timeoutMs: 30_000,
  hooks: {
    afterRun: (result, ctx) => {
      console.log(JSON.stringify({
        event: 'agent.run',
        userId: ctx.userId,
        tokens: result.usage?.totalTokens,
        cost: result.cost,
        ms: result.durationMs,
        ts: new Date().toISOString(),
      }));
    },
    onError: (err, ctx) => {
      console.error(JSON.stringify({
        event: 'agent.error',
        error: err.message,
        userId: ctx.userId,
        ts: new Date().toISOString(),
      }));
    },
  },
});
```

---

## `src/index.ts`

```ts
// index.ts — HTTP server
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { agent, getSessionStore } from './agent.js';

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  // POST /chat
  if (req.method === 'POST' && req.url === '/chat') {
    try {
      const body = JSON.parse(await readBody(req));
      const { message, userId = 'anon', sessionId = userId } = body;

      if (!message?.trim()) {
        return json(res, 400, { error: 'message is required' });
      }

      const result = await agent.run(message, {
        userId,
        sessionStore: getSessionStore(sessionId),
      });

      return json(res, 200, {
        text: result.text,
        usage: result.usage,
        sessionId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Internal error';
      return json(res, 500, { error: msg });
    }
  }

  // GET /health
  if (req.url === '/health') {
    return json(res, 200, { status: 'ok', ts: new Date().toISOString() });
  }

  json(res, 404, { error: 'Not found' });
});

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`   POST /chat  { message, userId, sessionId }`);
  console.log(`   GET  /health`);
});
```

---

## Run it

```bash
# Install dependencies
npm install fluxion better-sqlite3

# Set env vars
echo "OPENAI_API_KEY=sk-..." > .env

# Create knowledge directory
mkdir -p data/knowledge
echo "Our return policy: 30 days, no questions asked." > data/knowledge/policy.txt

# Start
npx tsx src/index.ts
```

## Test it

```bash
# Single question
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is your return policy?", "userId": "alice"}'

# Follow-up (same session)
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "And what about digital products?", "userId": "alice", "sessionId": "alice"}'

# Weather
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the weather in Tokyo?", "userId": "bob"}'
```

## What's next?

You've seen the full stack. Explore individual features in depth:

- [04 · Extend & Wrap Tools](./04-extend-tools) — go deeper on tool composition
- [08 · Multi-Agent Team](./08-team) — replace single agent with a team
- [09 · Supervisor Workflow](./09-supervisor) — add a planner
- [12 · Observability](./12-observability) — send traces to OpenTelemetry
