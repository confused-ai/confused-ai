# Multi-Tenancy

The tenant module provides per-tenant isolation for session stores, rate limiters, cost trackers, and audit logs — all without separate databases.

> **Import path:** `confused-ai/production`

---

## The problem

Without tenant isolation, all users share the same session namespace and rate limit counters. If tenant A has 10,000 sessions, they pollute the lookup for tenant B. Rate limits apply globally instead of per-tenant.

`createTenantContext()` wraps any existing store and **prefixes all keys** with `tenantId:` automatically.

---

## Quick start

```ts
import { createAgent } from 'confused-ai';
import { createTenantContext } from 'confused-ai/production';
import { createSqliteSessionStore } from 'confused-ai/session';

// Create the base stores once (shared across tenants)
const baseSessionStore = await createSqliteSessionStore('./agent.db');

// In your request handler — scope to the authenticated tenant:
app.post('/chat', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string;

  const ctx = createTenantContext(tenantId, {
    sessionStore: baseSessionStore,
    rateLimitConfig: {
      maxRequests: 100,
      intervalMs: 60_000,
    },
  });

  const agent = createAgent({
    name: 'Support',
    model: 'gpt-4o',
    instructions: '...',
    sessionStore: ctx.sessionStore,   // all session keys prefixed with 'tenant-acme:'
  });

  const result = await agent.run(req.body.message, {
    sessionId: req.body.sessionId,
    userId: ctx.runContext.userId,
  });

  res.json({ text: result.text });
});
```

---

## `TenantContext` shape

```ts
interface TenantContext {
  readonly tenantId: string;
  /** Session store scoped to this tenant — all keys prefixed with 'tenantId:' */
  readonly sessionStore: SessionStore;
  /** Rate limiter scoped to this tenant */
  readonly rateLimiter: RateLimiter;
  /** Convenience object to spread into AgentRunOptions */
  readonly runContext: { tenantId: string; userId?: string };
}
```

---

## Per-tenant rate limiting

```ts
import { createTenantContext } from 'confused-ai/production';

const ctx = createTenantContext('tenant-enterprise', {
  rateLimitConfig: {
    maxRequests: 1000,    // 1000 req/min for enterprise
    intervalMs: 60_000,
    overflowMode: 'queue',
  },
});

// Check before running
const allowed = await ctx.rateLimiter.allow('user-42');
if (!allowed) {
  return res.status(429).json({ error: 'Rate limit exceeded' });
}
```

Different tiers get different rate limits:

```ts
function getTenantContext(tenantId: string, plan: 'free' | 'pro' | 'enterprise') {
  const limits = {
    free:       { maxRequests: 20,   intervalMs: 60_000 },
    pro:        { maxRequests: 200,  intervalMs: 60_000 },
    enterprise: { maxRequests: 2000, intervalMs: 60_000 },
  };

  return createTenantContext(tenantId, {
    sessionStore: baseSessionStore,
    rateLimitConfig: limits[plan],
  });
}
```

---

## Tenant-scoped session store

The `TenantScopedSessionStore` wraps any `SessionStore` and transparently adds the tenant prefix to every session ID. Use it directly if you want more control:

```ts
import { TenantScopedSessionStore } from 'confused-ai/production';
import { createSqliteSessionStore } from 'confused-ai/session';

const base = await createSqliteSessionStore('./shared.db');
const tenantStore = new TenantScopedSessionStore(base, 'tenant-acme');

// All operations automatically prefix with 'tenant-acme:'
const session = await tenantStore.create({ agentId: 'support', userId: 'user-1' });
// session.id === 'user-generated-id' (prefix is internal)
```

---

## Exports

| Export | From | Description |
|--------|------|-------------|
| `createTenantContext` | `confused-ai/production` | Create a tenant-scoped context |
| `TenantScopedSessionStore` | `confused-ai/production` | Prefix-wrapping session store |
| `TenantContext` | `confused-ai/production` | Context shape (type) |
| `TenantContextOptions` | `confused-ai/production` | Config type |
| `TenantConfig` | `confused-ai/production` | Config type |
