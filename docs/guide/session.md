# Session Management

Sessions let agents maintain conversation history across multiple calls and process restarts.

## Quick start

```ts
import { createSqliteSessionStore } from 'fluxion/session';
// or: import { createSqliteSessionStore } from 'fluxion';

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
import { InMemorySessionStore } from 'fluxion/session';

const sessions = new InMemorySessionStore();
```

### SQLite (built-in)

Persists to a local SQLite file. Zero external dependencies.

```ts
import { createSqliteSessionStore } from 'fluxion/session';

const sessions = createSqliteSessionStore('./data/sessions.db');
// DB file and table created automatically
```

### SQL (PostgreSQL / MySQL)

Use any SQL database via the `SqlSessionStore`:

```ts
import { SqlSessionStore } from 'fluxion/session';

const sessions = new SqlSessionStore({
  driver: myDbDriver, // implements SessionDbDriver
  tableName: 'agent_sessions', // optional, default: 'sessions'
});
```

Implement `SessionDbDriver` for your database:

```ts
import type { SessionDbDriver, SessionRow } from 'fluxion/session';

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
import { RedisSessionStore } from 'fluxion/session';

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
import { RedisLlmCache } from 'fluxion/session';
import type { RedisLlmCacheKeyInput } from 'fluxion/session';

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
import { createBunSqliteSessionStore } from 'fluxion/session/bun-sqlite';
// or in Bun apps: import { createBunSqliteSessionStore } from 'fluxion/session';

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
import { createAgent } from 'fluxion';
import { InMemorySessionStoreAdapter } from 'fluxion/adapters';
// Production: import { RedisSessionAdapter } from 'fluxion-adapter-redis-sessions';

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
