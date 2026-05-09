---
title: Session Management
description: Persist conversation history across runs with SQLite, Redis, or Postgres session stores.
outline: [2, 3]
---

# Session Management

Sessions give agents memory across multiple `run()` calls. Pass a `sessionId` to tie runs to a conversation thread. The session store persists messages so they survive process restarts.

## In-memory (development)

No configuration needed — sessions exist only for the process lifetime:

```ts
import { agent } from 'confused-ai';
import { InMemorySessionStore } from 'confused-ai/session';

const ai = agent({
  model: 'gpt-4o',
  sessionStore: new InMemorySessionStore(),
});

await ai.run({ prompt: 'My name is Alice', sessionId: 'alice' });
const r = await ai.run({ prompt: 'What is my name?', sessionId: 'alice' });
// → "Your name is Alice."
```

## SQLite (zero dependencies)

Persists to a local file. No external database required:

```ts
import { createSqliteSessionStore } from 'confused-ai/session';

const sessions = createSqliteSessionStore('./sessions.db');

const ai = agent({
  model: 'gpt-4o',
  sessionStore: sessions,
});
```

Session data survives process restarts automatically.

## Redis

For distributed deployments where multiple instances share sessions:

```ts
import { createRedisSessionStore } from 'confused-ai/session';

const sessions = createRedisSessionStore({
  url: process.env.REDIS_URL!,
  keyPrefix: 'agent:session:',
  ttlSeconds: 86_400,  // sessions expire after 24 hours
});
```

## Postgres

```ts
import { createPostgresSessionStore } from 'confused-ai/session';

const sessions = createPostgresSessionStore({
  connectionString: process.env.DATABASE_URL!,
  tableName: 'agent_sessions',
  ttlSeconds: 7 * 86_400,  // 1 week
});
```

## Session options

```ts
import { InMemorySessionStore } from 'confused-ai/session';

const sessions = new InMemorySessionStore({
  maxMessages: 100,       // keep last 100 messages per session
  retentionDays: 30,      // auto-expire after 30 days
});
```

## Working with sessions directly

```ts
// List all sessions
const allSessions = await sessions.list();

// Get a specific session
const session = await sessions.get('user-123');
console.log(session.messages);

// Delete a session
await sessions.delete('user-123');

// Clear all sessions
await sessions.clear();
```

## Multi-tenant sessions

Scope sessions to a tenant to avoid cross-tenant data access:

```ts
import { tenantScopedKey } from 'confused-ai/contracts';

const sessionId = tenantScopedKey('tenant-abc', 'user-123');
// → 'tenant-abc:user-123'

await ai.run({ prompt: '...', sessionId });
```

Note: `:` characters are rejected in tenant/user IDs to prevent key injection.
