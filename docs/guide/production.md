---
title: Production Resilience
description: Circuit breakers, rate limiting, retries, budget caps, health checks, and graceful shutdown for production AI agents.
outline: [2, 3]
---

# Production Resilience

Everything you need to run agents safely in production: circuit breakers, rate limiting, retries, budget enforcement, health checks, and graceful shutdown — all composable, all opt-in.

---

## `withResilience()` — one-line hardening

Wraps any agent with automatic retries, circuit breaking, rate limiting, and health monitoring:

```ts
import { withResilience } from 'confused-ai/guard';
import { agent } from 'confused-ai';

const base = agent({
  model:        'gpt-4o',
  instructions: 'You are a production assistant.',
});

const resilient = withResilience(base, {
  circuitBreaker: {
    failureThreshold: 5,      // open after 5 consecutive failures
    resetTimeoutMs:   30_000, // try again after 30 s (half-open)
    callTimeoutMs:    60_000, // abort individual calls after 60 s
  },
  rateLimit: {
    maxRpm: 60,               // max runs per minute globally
  },
  retry: {
    maxRetries:   2,
    backoffMs:    500,
    maxBackoffMs: 5_000,
  },
  healthCheck:      true,     // enable .health() reporting
  gracefulShutdown: true,     // flush in-flight runs on SIGTERM
});

// Drop-in replacement — identical run() / stream() interface
const result = await resilient.run('Process this request');
```

### Default values

| Option | Default |
|--------|---------|
| `circuitBreaker.failureThreshold` | `5` |
| `circuitBreaker.resetTimeoutMs` | `30_000` |
| `circuitBreaker.callTimeoutMs` | `60_000` |
| `rateLimit.maxRpm` | `60` |
| `retry.maxRetries` | `2` |
| `retry.backoffMs` | `500` |
| `retry.maxBackoffMs` | `5_000` |

Pass `circuitBreaker: false` or `rateLimit: false` to disable those subsystems.

### Health report

```ts
const report = resilient.health();
// {
//   status:         'healthy' | 'degraded' | 'unhealthy',
//   circuitState:   'closed' | 'open' | 'half-open' | 'disabled',
//   totalRuns:      142,
//   totalFailures:  3,
//   averageLatencyMs: 823,
//   uptime:         3600,
//   lastError?:     'Rate limit exceeded',
//   lastRunAt?:     Date,
// }

// Expose as HTTP endpoint
app.get('/health', (_req, res) => {
  const h = resilient.health();
  res.status(h.status === 'unhealthy' ? 503 : 200).json(h);
});
```

---

## Budget Enforcement {#budget-enforcement}

Cap USD spend per run, per user, and per month:

```ts
import { defineAgent } from 'confused-ai';

const ai = defineAgent()
  .model('gpt-4o')
  .instructions('...')
  .budget({
    maxUsdPerRun:   0.50,   // hard cap per single run
    maxUsdPerUser:  10.00,  // cumulative per sessionId
    maxUsdPerMonth: 500.00, // global monthly cap
    onExceeded:     'throw', // 'throw' | 'warn' | 'stop'
  })
  .build();
```

::: tip Token cost tracking
Budget enforcement uses the `usage` field returned by LLM providers. Make sure your provider returns token counts (all major providers do).
:::

---

## Redis Rate Limiter (distributed)

For multi-instance deployments where you need cross-process rate limiting:

```ts
import Redis from 'ioredis';
import { RedisRateLimiter } from 'confused-ai/guard';

const redis   = new Redis(process.env.REDIS_URL!);
const limiter = new RedisRateLimiter({
  client:      redis,
  windowMs:    60_000, // 1-minute window
  maxRequests: 100,    // per key per window
});

// In your request handler
const key    = `user:${userId}`;
const result = await limiter.check(key);

if (!result.allowed) {
  return res.status(429).json({
    error:      'Rate limit exceeded',
    retryAfter: result.retryAfterMs,
  });
}
```

---

## Fallback chain

Automatically fail over to backup models if the primary is unavailable:

```ts
import { createFallbackChain } from 'confused-ai/model';

const llm = createFallbackChain([
  { model: 'gpt-4o' },
  { model: 'claude-opus-4-5' },
  { model: 'gemini-2.0-flash' },
]);

const ai = agent({ llmProvider: llm, instructions: '...' });
// If gpt-4o fails → claude-opus-4-5 → gemini-2.0-flash
```

---

## Guardrails (quick reference)

→ See the full [Guardrails guide](/guide/guardrails)

```ts
import { createGuardrails } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  allowlist:  ['billing', 'account', 'subscription'], // permitted topics
  blocklist:  ['competitor pricing'],
  validateInput:  async (input) => ({ blocked: /DROP TABLE/i.test(input), reason: 'SQL injection' }),
  validateOutput: async (out)   => ({ blocked: out.includes('SECRET'), reason: 'Leaked credential' }),
});

const ai = agent({ model: 'gpt-4o', instructions: '...', guardrails });
```

---

## Context window management

Automatic truncation when approaching token limits:

```ts
import { ContextWindowManager } from 'confused-ai/model';

const ai = agent({
  model:                 'gpt-4o',
  instructions:          '...',
  contextWindowManager:  new ContextWindowManager({
    maxTokens:       128_000,
    reserveForOutput: 2_000,
    strategy:        'sliding',   // 'sliding' | 'truncate' | 'summarise'
  }),
});
```

---

## Graceful shutdown

Handle `SIGTERM` cleanly — finish in-flight runs before exiting:

```ts
import { withResilience } from 'confused-ai/guard';

const resilient = withResilience(base, { gracefulShutdown: true });

process.on('SIGTERM', async () => {
  console.log('Draining in-flight agent runs...');
  await resilient.shutdown();  // waits for active runs to complete
  process.exit(0);
});
```

---

## HealthMonitor — fleet-level health

Monitor multiple agents at once:

```ts
import { HealthMonitor } from 'confused-ai/guard';

const monitor = new HealthMonitor({
  agents: { support: supportAgent, billing: billingAgent },
  checkIntervalMs: 30_000,
  onUnhealthy: (name, err) => alerting.page(`Agent ${name} is down: ${err.message}`),
});

monitor.start();

// Health endpoint
app.get('/healthz', (_req, res) => {
  const status = monitor.getStatus();
  res.status(status.allHealthy ? 200 : 503).json(status);
});
```

---

## Checkpoint store (crash recovery)

Persist agent state between steps — resume from the last checkpoint if a run crashes:

```ts
import { createSqliteCheckpointStore } from 'confused-ai/guard';

const ai = defineAgent()
  .model('gpt-4o')
  .instructions('...')
  .checkpoint(createSqliteCheckpointStore('./checkpoints.db'))
  .build();

// Run with a stable runId — if it crashes mid-way, rerun with the same runId to resume
const result = await ai.run('Long multi-step analysis task', { runId: 'analysis-run-001' });
```

## `withResilience()`

Wraps any agent with automatic retries, circuit breaking, rate limiting, and health checks:

```ts
import { withResilience } from 'confused-ai/guard';
import { createAgent } from 'confused-ai';

const myAgent = createAgent({ name: 'assistant', llm, instructions: '...' });

const resilient = withResilience(myAgent, {
  circuitBreaker: {
    failureThreshold: 5,     // open circuit after 5 consecutive failures
    resetTimeoutMs:   30_000, // try again after 30s
    callTimeoutMs:    60_000, // abort individual calls after 60s
  },
  rateLimit: {
    maxRpm: 60,              // max runs per minute
  },
  retry: {
    maxRetries:   2,         // retry failed runs up to 2 times
    backoffMs:    500,       // initial retry delay
    maxBackoffMs: 5_000,     // cap on exponential backoff
  },
  healthCheck:      true,   // enable .health() reporting
  gracefulShutdown: true,   // flush in-flight runs on SIGTERM
});

// Drop-in replacement — identical run() interface
const result = await resilient.run('Process this data');
```

### Health report

`withResilience()` returns a `ResilientAgent` with an extra `.health()` method:

```ts
const report = resilient.health();
// {
//   status: 'healthy' | 'degraded' | 'unhealthy',
//   circuitState: 'closed' | 'open' | 'half-open' | 'disabled',
//   totalRuns: 142,
//   totalFailures: 3,
//   averageLatencyMs: 823,
//   uptime: 3600,
//   lastError?: 'Rate limit exceeded',
//   lastRunAt?: Date,
// }

// Expose via HTTP
app.get('/agent/health', (req, res) => {
  const h = resilient.health();
  res.status(h.status === 'unhealthy' ? 503 : 200).json(h);
});
```

### All defaults

All `ResilienceConfig` fields are optional — `withResilience(agent)` with no config is valid and uses these defaults:

| Option | Default |
|--------|---------|
| `circuitBreaker.failureThreshold` | `5` |
| `circuitBreaker.resetTimeoutMs` | `30_000` |
| `circuitBreaker.callTimeoutMs` | `60_000` |
| `rateLimit.maxRpm` | `60` |
| `retry.maxRetries` | `2` |
| `retry.backoffMs` | `500` |
| `retry.maxBackoffMs` | `5_000` |
| `healthCheck` | `true` |
| `gracefulShutdown` | `true` |

Pass `circuitBreaker: false` or `rateLimit: false` to disable those subsystems entirely.

## Guardrails

Control what agents can say and do:

```ts
import { createGuardrails } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  // Input allowlist — only allow topics in this list
  allowlist: ['billing', 'account', 'subscription', 'pricing'],

  // Block topics entirely
  blocklist: ['competitors', 'pricing of other vendors'],

  // Content safety (requires additional configuration)
  contentSafety: {
    enabled: true,
    thresholds: { hate: 0.5, violence: 0.3, sexual: 0.1 },
  },

  // Custom validator
  validate: async (input, output) => {
    if (output.includes('confidential')) {
      return { blocked: true, reason: 'Contains confidential information' };
    }
    return { blocked: false };
  },
});

const myAgent = agent({
  model: 'gpt-4o',
  instructions: 'You are a billing assistant.',
  guardrails,
});
```

## Fallback chain

Automatically fail over to backup models:

```ts
import { createFallbackChain } from 'confused-ai/model';

const llm = createFallbackChain([
  { model: 'gpt-4o', weight: 1 },
  { model: 'claude-3-5-sonnet-latest', weight: 1 },
  { model: 'gemini-2.0-flash-exp', weight: 1 },
]);

const myAgent = agent({ model: llm, instructions: '...' });
```

## Rate limiting (plugin)

```ts
import { rateLimitPlugin } from 'confused-ai/plugins';

const myAgent = defineAgent({ model: 'gpt-4o', instructions: '...' })
  .use(rateLimitPlugin({
    requestsPerMinute: 60,
    tokensPerMinute: 100_000,
    perUser: true,   // rate limit per sessionId
  }));
```

### Redis rate limiter (distributed)

`RedisRateLimiter` — fixed-window rate limiting across multiple server instances. Requires `ioredis`.

```ts
import Redis from 'ioredis';
import { RedisRateLimiter } from 'confused-ai/guard';

const redis = new Redis(process.env.REDIS_URL!);

const limiter = new RedisRateLimiter({
  client: redis,
  windowMs: 60_000,     // 1 minute window
  maxRequests: 100,     // per key per window
});

// Use in your route handler or middleware:
const key = `user:${userId}`;
const result = await limiter.check(key);
if (!result.allowed) {
  res.status(429).json({ error: 'Rate limit exceeded', retryAfter: result.retryAfterMs });
  return;
}
```

## Health checks

Monitor agent health and readiness:

```ts
import { HealthMonitor } from 'confused-ai/guard';

const health = new HealthMonitor({
  agents: [myAgent, teamAgent],
  checkInterval: 30_000, // ms
  onUnhealthy: (agentName, error) => {
    alerting.notify(`Agent ${agentName} unhealthy: ${error.message}`);
  },
});

health.start();

// Express health endpoint
app.get('/health', (req, res) => {
  const status = health.getStatus();
  res.status(status.healthy ? 200 : 503).json(status);
});
```

## Context window management

Automatic truncation when approaching token limits:

```ts
import { ContextWindowManager } from 'confused-ai/model';

const myAgent = agent({
  model: 'gpt-4o',  // 128k context
  instructions: '...',
  contextManager: new ContextWindowManager({
    maxTokens: 100_000,  // stay under limit
    strategy: 'sliding-window', // keep most recent messages
  }),
});
```

## Cost tracking

Track and budget LLM costs:

```ts
import { CostTracker } from 'confused-ai/model';

const tracker = new CostTracker({
  budget: 10.00,  // USD
  onBudgetExceeded: (cost) => {
    throw new Error(`Budget exceeded: $${cost.toFixed(4)}`);
  },
});

const myAgent = agent({
  model: 'gpt-4o',
  instructions: '...',
  costTracker: tracker,
});

// After runs
console.log(tracker.getTotalCost()); // $0.0023
console.log(tracker.getBreakdown());
// { 'gpt-4o': { input: 1000, output: 500, cost: 0.0023 } }
```

---

## Production adapter stack

The recommended way to wire all production infrastructure is `createProductionSetup()`.
It connects sessions, memory, guardrails, rate-limiting, audit logs, observability,
and more with sensible in-memory defaults that you replace progressively:

```ts
import { createAgent } from 'confused-ai';
import { createProductionSetup } from 'confused-ai/adapters';

const setup = createProductionSetup({
  // Replace in-memory defaults with real drivers:
  // cache:        new RedisAdapter({ url: process.env.REDIS_URL! }),
  // sessionStore: new RedisSessionAdapter({ url: process.env.REDIS_URL! }),
  // rateLimit:    new RedisRateLimitAdapter({ url: process.env.REDIS_URL! }),
  // database:     new PostgresAdapter({ connectionString: process.env.DATABASE_URL! }),
  // auditLog:     new PgAuditLogAdapter({ connectionString: process.env.DATABASE_URL! }),
  // guardrail:    new ContentSafetyAdapter({ apiKey: process.env.AZURE_CS_KEY! }),
  // auth:         new JwtAuthAdapter({ secret: process.env.JWT_SECRET! }),
  // observability:new OtelAdapter({ endpoint: process.env.OTEL_ENDPOINT! }),
});

await setup.connect();

const agent = createAgent({
  name: 'assistant',
  model: 'gpt-4o',
  instructions: '...',
  adapters: setup.bindings,
});

// Health endpoint
app.get('/health', async (_req, res) => {
  const health = await setup.healthCheck();
  const ok = Object.values(health).every((h) => h.ok);
  res.status(ok ? 200 : 503).json(health);
});

// Graceful shutdown
process.on('SIGTERM', () => setup.disconnect().then(() => process.exit(0)));
```

See the [Adapters guide](./adapters.md) for the full reference.

---

## Budget enforcement

Hard-stop LLM spend per run, per user (daily), or globally (monthly). Unlike `CostTracker` (which measures), `BudgetEnforcer` **stops execution** when a cap is crossed.

::: code-group

```ts [createAgent()]
import { createAgent } from 'confused-ai';

const agent = createAgent({
  name: 'Safe',
  model: 'gpt-4o',
  instructions: '...',
  budget: {
    maxUsdPerRun:    0.50,   // hard cap per single run
    maxUsdPerUser:   10.00,  // daily cap per userId
    maxUsdPerMonth:  500.00, // monthly cap (all users combined)
    onExceeded:      'throw', // 'throw' | 'warn' | 'truncate'
  },
});
```

```ts [defineAgent()]
import { defineAgent } from 'confused-ai';

const agent = defineAgent()
  .instructions('...')
  .model('gpt-4o')
  .budget({
    maxUsdPerRun:   0.50,
    maxUsdPerUser:  10.00,
    maxUsdPerMonth: 500.00,
    onExceeded:     'throw',
  })
  .build();
```

:::

### Persistent budget store

The default `InMemoryBudgetStore` resets on restart. For persistence, implement `BudgetStore` or use the SQLite default:

```ts
import { InMemoryBudgetStore, BudgetEnforcer } from 'confused-ai/guard';

// Custom Postgres-backed store:
import type { BudgetStore } from 'confused-ai/guard';

class PostgresBudgetStore implements BudgetStore {
  async getUserDailySpend(userId: string) { /* SELECT SUM(usd) WHERE user_id = $1 AND date = today */ }
  async incrementUserDailySpend(userId: string, usd: number) { /* UPSERT */ }
  async getMonthlySpend() { /* SELECT SUM(usd) WHERE month = current_month */ }
  async incrementMonthlySpend(usd: number) { /* UPDATE */ }
}

const agent = createAgent({
  name: 'Safe',
  budget: {
    maxUsdPerUser: 10.00,
    store: new PostgresBudgetStore(),
  },
});
```

### Handling `BudgetExceededError`

```ts
import { BudgetExceededError } from 'confused-ai/guard';

try {
  await agent.run('Analyse 500 documents', { userId: 'user-42' });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(`Cap: ${err.cap}`);        // 'run' | 'user_daily' | 'monthly'
    console.log(`Limit: $${err.limitUsd}`);
    console.log(`Spent: $${err.spentUsd}`);
  }
}
```

---

## Agent checkpointing

For long-running tasks, save execution state after each step. If the process restarts, resume from the last saved step.

::: code-group

```ts [createAgent()]
import { createAgent } from 'confused-ai';
import { createSqliteCheckpointStore } from 'confused-ai/production';

const agent = createAgent({
  name: 'BatchProcessor',
  instructions: 'Process a large dataset...',
  checkpointStore: createSqliteCheckpointStore('./agent.db'),
});

// Provide a stable runId — if the process restarts, execution resumes
const result = await agent.run('Process all 500 records', { runId: 'batch-job-001' });
```

```ts [defineAgent()]
import { defineAgent } from 'confused-ai';
import { createSqliteCheckpointStore } from 'confused-ai/production';

const agent = defineAgent()
  .instructions('Process a large dataset...')
  .checkpoint(createSqliteCheckpointStore('./agent.db'))
  .build();

const result = await agent.run('Process all 500 records', { runId: 'batch-job-001' });
```

:::

### Checkpoint stores

| Store | Import | Notes |
|-------|--------|-------|
| `InMemoryCheckpointStore` | `confused-ai/production` | Dev/test — does not survive restarts |
| `SqliteCheckpointStore` | `confused-ai/production` | Durable default |
| `createSqliteCheckpointStore` | `confused-ai/production` | Factory shorthand |

### Custom checkpoint store

```ts
import type { AgentCheckpointStore, AgentRunState } from 'confused-ai/guard';

class RedisCheckpointStore implements AgentCheckpointStore {
  async save(runId: string, step: number, state: AgentRunState) {
    await redis.set(`checkpoint:${runId}`, JSON.stringify({ step, state }), 'EX', 86400);
  }
  async load(runId: string) {
    const raw = await redis.get(`checkpoint:${runId}`);
    return raw ? JSON.parse(raw) : null;
  }
  async delete(runId: string) {
    await redis.del(`checkpoint:${runId}`);
  }
}
```

---

## HTTP runtime authentication

`createHttpService` supports built-in authentication strategies via the `auth` option. When omitted, the server runs without auth (dev mode only).

```ts
import { createHttpService, listenService } from 'confused-ai/serve';
import { apiKeyAuth, bearerAuth } from 'confused-ai/serve';

// API key (header: x-api-key)
const service = createHttpService({
  agents: { assistant },
  auth: apiKeyAuth(['sk-prod-abc', 'sk-staging-xyz']),
  // or shorthand:
  // auth: { strategy: 'api-key', keys: ['sk-prod-abc'] },
  maxBodyBytes: 512_000, // 512 KB request body limit (default: 1 MB)
});

await listenService(service, 8080);
```

```ts
// Bearer JWT / custom token validation
import { bearerAuth } from 'confused-ai/serve';

const service = createHttpService({
  agents: { assistant },
  auth: bearerAuth(async (token) => {
    const user = await verifyJwt(token);
    return user ? { userId: user.sub, tenantId: user.org } : null;
  }),
});
```

```ts
// Basic auth (username:password)
import { createHttpService } from 'confused-ai/serve';

const service = createHttpService({
  agents: { assistant },
  auth: {
    strategy: 'basic',
    users: { admin: process.env.ADMIN_PASSWORD! },
  },
});
```

**JWT RBAC** — for role-based access control using HS256 JWTs:

```ts
import { jwtAuth, hasRole } from 'confused-ai/serve';

const service = createHttpService({
  agents: { assistant },
  auth: jwtAuth({
    secret: process.env.JWT_SECRET!,
    required: true,
  }),
});

// In a hook or custom middleware, check roles:
const auth = ctx.auth; // { userId, roles: ['admin', 'user'] }
if (!hasRole(auth, 'admin')) throw new Error('Forbidden');
```

### `CreateHttpServiceOptions` reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agents` | `Record<string, Agent>` | required | Named agents to expose |
| `auth` | `AuthMiddlewareOptions` | — | Auth strategy; omit for dev/no-auth |
| `maxBodyBytes` | `number` | `1_048_576` | Max request body size (bytes); returns 413 on exceed |
| `cors` | `string` | — | `Access-Control-Allow-Origin` header |
| `tracing` | `boolean` | `false` | In-memory request audit log |
| `db` | `AgentDb` | — | AgentDb instance; enables live DB health check on `/health` |

### Database health check

Pass a `db` option to `createHttpService` to include a live database connectivity check in the `/health` and `/v1/health` endpoints. When the DB is unreachable the endpoint returns HTTP **503** with `status: 'degraded'`:

```ts
import { createHttpService } from 'confused-ai/serve';
import { SqliteAgentDb } from '@confused-ai/db';

const db      = new SqliteAgentDb({ path: './agent.db' });
const service = createHttpService({
  agents: { assistant },
  db,
});
```

Example healthy response:

```json
{
  "status": "ok",
  "service": "confused-ai",
  "time": "2026-05-04T12:00:00.000Z",
  "db": { "ok": true, "latencyMs": 3 }
}
```

Example degraded response (HTTP 503):

```json
{
  "status": "degraded",
  "service": "confused-ai",
  "time": "2026-05-04T12:00:00.000Z",
  "db": { "ok": false, "latencyMs": 0, "error": "Connection refused" }
}
```

---

## Idempotency

Prevent duplicate side-effects when clients retry failed HTTP requests. Pass an `X-Idempotency-Key` header and the same response is returned on replay — the agent does **not** re-execute.

```ts
import { createHttpService } from 'confused-ai/serve';
import { createSqliteIdempotencyStore } from 'confused-ai/guard';

const service = createHttpService({
  agents: { assistant },
  idempotency: {
    store: createSqliteIdempotencyStore('./agent.db'),
    ttlMs: 24 * 60 * 60 * 1000,  // cache for 24 hours
  },
});
```

Client usage:

```http
POST /v1/chat/assistant
X-Idempotency-Key: order-123-send-email
Content-Type: application/json

{ "message": "Send a confirmation email for order 123" }
```

If the request is retried with the same key within 24 hours, the original response is returned without re-running the agent.

### Custom idempotency store

```ts
import type { IdempotencyStore } from 'confused-ai/guard';

class RedisIdempotencyStore implements IdempotencyStore {
  async get(key: string) { /* fetch from Redis */ }
  async set(key: string, status: number, body: string, ttlMs: number) { /* store in Redis with TTL */ }
}
```

---

## Audit log

Persistent, queryable audit trail for every agent run. Satisfies SOC 2 and HIPAA requirements for tamper-evident logging.

```ts
import { createHttpService } from 'confused-ai/serve';
import { createSqliteAuditStore } from 'confused-ai/guard';

const service = createHttpService({
  agents: { assistant },
  auditStore: createSqliteAuditStore('./agent.db'),
});
```

### Query audit logs

```ts
const entries = await auditStore.query({
  agentName: 'assistant',
  userId: 'user-42',
  since: new Date('2025-01-01'),
  limit: 100,
});

entries.forEach((e) => {
  console.log(`${e.timestamp} ${e.method} ${e.path} → ${e.status} (${e.durationMs}ms)`);
});
```

### `AuditEntry` fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID |
| `timestamp` | `string` | ISO 8601 |
| `method` | `string` | HTTP method |
| `path` | `string` | Request path |
| `status` | `number` | HTTP status code |
| `agentName` | `string?` | Agent that handled the request |
| `sessionId` | `string?` | Session ID |
| `userId` | `string?` | User ID from auth context |
| `tenantId` | `string?` | Tenant ID |
| `promptHash` | `string?` | SHA-256 hash of prompt (never plaintext) |
| `toolsCalled` | `string[]?` | Tool names called |
| `finishReason` | `string?` | How the run ended |
| `durationMs` | `number?` | Total run duration |
| `costUsd` | `number?` | Estimated cost |
| `idempotencyKey` | `string?` | Idempotency key, if any |
| `idempotencyHit` | `boolean?` | Whether this was a cache replay |

---

## Redis rate limiter

For distributed deployments where multiple processes share the same rate limits:

```ts
import Redis from 'ioredis';
import { RedisRateLimiter } from 'confused-ai/guard';

const redis = new Redis(process.env.REDIS_URL!);

const limiter = new RedisRateLimiter({
  redis,
  name: 'api',          // logical limiter name (part of Redis key)
  maxRequests: 100,
  windowSeconds: 60,    // fixed window — 100 req/min
});

// Wrap logic in execute() — throws RateLimitError when limit is exceeded
await limiter.execute(async () => {
  const result = await myAgent.run(prompt);
  res.json({ text: result.text });
});
```

Use `RedisRateLimiter` instead of the in-process `RateLimiter` whenever you run multiple server instances.

---

## Human-in-the-Loop (HITL)

Pause agent execution at high-risk tool calls and require a human decision before proceeding. Build a gate tool using `waitForApproval`:

```ts
import { createSqliteApprovalStore, waitForApproval, ApprovalRejectedError } from 'confused-ai/guard';

const approvalStore = createSqliteApprovalStore('./agent.db');

const requestApproval = defineTool()
  .name('requestApproval')
  .description('Request human approval before a risky action')
  .parameters(z.object({
    toolName:    z.string(),
    description: z.string(),
    riskLevel:   z.enum(['low', 'medium', 'high', 'critical']),
  }))
  .execute(async ({ toolName, description, riskLevel }, ctx) => {
    const req = await approvalStore.create({
      runId: ctx.runId ?? 'run', agentName: 'Agent',
      toolName, toolArguments: {}, riskLevel, description,
    });
    await waitForApproval(approvalStore, req.id, { timeoutMs: 30 * 60 * 1000 });
    return { approved: true };
  })
  .build();
```

See the dedicated [HITL guide](./hitl.md).

---

## Multi-tenancy

Scope sessions, rate limits, and cost tracking per tenant without separate databases.

See the dedicated [Multi-Tenancy guide](./multi-tenancy.md).
