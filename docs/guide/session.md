---
title: Session Management
description: SQLite, in-memory, SQL, and Redis session stores — persist agent conversation history across restarts and deployments.
outline: [2, 3]
---

# Session Management

Sessions maintain conversation history across multiple `agent.run()` calls, server restarts, and deployments. Pass a `sessionId` to any run to resume an existing conversation.

| Store | Class | Use case |
|-------|-------|---------|
| SQLite | `createSqliteSessionStore` | Single-server, local persistence |
| In-memory | `InMemorySessionStore` | Dev / testing — not persistent |
| SQL (generic) | `SqlSessionStore` | PostgreSQL, MySQL, any Knex-compatible DB |
| Redis | `RedisSessionStore` | Multi-instance, distributed |

---

## SQLite — single server

```ts
import { agent } from 'confused-ai';
import { createSqliteSessionStore } from 'confused-ai/session';

const sessions = createSqliteSessionStore('./sessions.db');

const ai = agent({
  model:        'gpt-4o',
  instructions: 'You are a helpful assistant.',
  sessionStore: sessions,
});

// First call — starts conversation
await ai.run('My project is called Orion.', { sessionId: 'user-alice' });

// Later call — continues the same conversation
const result = await ai.run('What is my project called?', { sessionId: 'user-alice' });
console.log(result.text); // "Your project is called Orion."
```

---

## In-memory — development

```ts
import { InMemorySessionStore } from 'confused-ai/session';

const ai = agent({
  model:        'gpt-4o',
  instructions: '...',
  sessionStore: new InMemorySessionStore(),
});
```

::: warning Not persistent
`InMemorySessionStore` is cleared on process restart. Use SQLite or Redis for production.
:::

---

## SQL (generic) — PostgreSQL / MySQL

```ts
import { SqlSessionStore } from 'confused-ai/session';
import knex from 'knex';

const db = knex({
  client:     'pg',
  connection: process.env.DATABASE_URL,
});

const ai = agent({
  model:        'gpt-4o',
  instructions: '...',
  sessionStore: new SqlSessionStore({
    db,
    tableName: 'agent_sessions',  // auto-created if missing
  }),
});
```

---

## Redis — multi-instance

```ts
import { RedisSessionStore } from 'confused-ai/session';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

const ai = agent({
  model:        'gpt-4o',
  instructions: '...',
  sessionStore: new RedisSessionStore({
    client: redis,
    ttlMs:  7 * 24 * 60 * 60 * 1000,  // 7-day expiry (optional)
    prefix: 'session:',
  }),
});
```

---

## Direct session operations

Read and manage sessions programmatically:

```ts
// Get all messages in a session
const messages = await sessions.getMessages('user-alice');

// Clear a session (e.g. when a user requests history deletion)
await sessions.clearSession('user-alice');

// Delete a session entirely
await sessions.deleteSession('user-alice');

// List active sessions
const allSessions = await sessions.listSessions();
```

---

## Session options on `run()`

| Option | Type | Description |
|--------|------|-------------|
| `sessionId` | `string` | Resumes or creates a session with this ID |
| `maxHistoryMessages` | `number` | Truncate history to N messages (default: unlimited) |
| `systemMessage` | `string` | Override instructions for this run only |

## Quick start

```ts
import { createSqliteSessionStore } from 'confused-ai/session';
// or: import { createSqliteSessionStore } from 'confused-ai';

const sessions = createSqliteSessionStore('./data/sessions.db');

const myAgent = agent({
  model: 'gpt-4o-mini',
  instructions: 'You are a persistent assistant.',
  sessionStore: sessions,
});

// Each run with the same sessionId picks up where it left off
await myAgent.run('My favorite color is blue.', { sessionId: 'user-alice' });
const r = await myAgent.run('What is my favorite color?', { sessionId: 'user-alice' });
console.log(r.text); // "Your favorite color is blue."
```

## Session stores

### InMemorySessionStore

Fast, in-process, no setup. Lost on restart.

```ts
import { InMemorySessionStore } from 'confused-ai/session';

const sessions = new InMemorySessionStore();
```

### SQLite (built-in)

Persists to a local SQLite file. Zero external dependencies.

```ts
import { createSqliteSessionStore } from 'confused-ai/session';

const sessions = createSqliteSessionStore('./data/sessions.db');
// DB file and table created automatically
```

### SQL (PostgreSQL / MySQL)

Use any SQL database via the `SqlSessionStore`:

```ts
import { SqlSessionStore } from 'confused-ai/session';

const sessions = new SqlSessionStore({
  driver: myDbDriver, // implements SessionDbDriver
  tableName: 'agent_sessions', // optional, default: 'sessions'
});
```

Implement `SessionDbDriver` for your database:

```ts
import type { SessionDbDriver, SessionRow } from 'confused-ai/session';

class PostgresSessionDriver implements SessionDbDriver {
  async get(sessionId: string): Promise<SessionRow | null> {
    const row = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    return row ?? null;
  }

  async set(row: SessionRow): Promise<void> {
    await db.query(
      `INSERT INTO sessions (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [row.id, JSON.stringify(row.data)]
    );
  }

  async delete(sessionId: string): Promise<void> {
    await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }

  async list(): Promise<string[]> {
    const rows = await db.query('SELECT id FROM sessions');
    return rows.map(r => r.id);
  }
}
```

### Redis (distributed sessions + LLM cache)

Use `RedisSessionStore` for distributed deployments (multiple backend instances sharing sessions). Requires `ioredis`.

```ts
import Redis from 'ioredis';
import { RedisSessionStore } from 'confused-ai/session';

const redis = new Redis(process.env.REDIS_URL!);
const sessions = new RedisSessionStore({ client: redis });

const myAgent = agent({
  model: 'gpt-4o',
  instructions: '...',
  sessionStore: sessions,
});
```

`RedisSessionStore` uses Redis hashes + lists — active sessions never expire, writes are O(1), and `list()` uses `SCAN` (not `KEYS`) so it's safe on large instances.

**Redis LLM cache** — share an LLM response cache across all instances:

```ts
import { RedisLlmCache } from 'confused-ai/session';
import type { RedisLlmCacheKeyInput } from 'confused-ai/session';

const llmCache = new RedisLlmCache({
  client: redis,
  ttlSeconds: 3600, // default: 1 hour
});

const myAgent = createAgent({
  name: 'assistant',
  model: 'gpt-4o',
  instructions: '...',
  llmCache,
});
```

### Bun SQLite (Bun runtime only)

When running under **Bun**, use `createBunSqliteSessionStore` — `better-sqlite3` does not load under Bun.

```ts
// Import directly from the subpath (not in the main barrel to avoid Node import errors)
import { createBunSqliteSessionStore } from 'confused-ai/session/bun-sqlite';
// or in Bun apps: import { createBunSqliteSessionStore } from 'confused-ai/session';

const sessions = await createBunSqliteSessionStore('./data/sessions.db');

const myAgent = agent({
  model: 'gpt-4o',
  instructions: '...',
  sessionStore: sessions,
});
```

Under **Node.js**, use `createSqliteSessionStore` (backed by `better-sqlite3`) instead.

## Disable sessions

```ts
const agent = defineAgent({
  model: 'gpt-4o',
  instructions: '...',
  sessionStore: false, // completely disable session persistence
});
```

---

## Plugging in a custom session backend via adapters

Use a `SessionStoreAdapter` to plug any backend into the session layer without
replacing the entire `SessionStore` implementation:

```ts
import { createAgent } from 'confused-ai';
import { InMemorySessionStoreAdapter } from 'confused-ai/adapters';
// Production: import { RedisSessionAdapter } from 'confused-ai-adapter-redis-sessions';

createAgent({
  name: 'assistant',
  model: 'gpt-4o',
  instructions: '...',
  // Convenience field — wires directly to the session-store binding slot:
  sessionStoreAdapter: new InMemorySessionStoreAdapter(),
});
```

See the [Adapters guide](./adapters.md) for the full adapter system.

## Session metadata

Pass extra metadata per-run — available in tools via `ctx.metadata`:

```ts
await myAgent.run('Help me with my account', {
  sessionId: 'user-456',
  metadata: {
    userId: 'user-456',
    plan: 'enterprise',
    region: 'us-east-1',
  },
});
```
