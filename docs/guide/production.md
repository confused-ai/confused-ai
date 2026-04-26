# Production

Production-grade resilience: circuit breakers, rate limiting, retries, and graceful degradation.

## ResilientAgent

Wraps any agent with automatic retries, circuit breaking, fallback models, and health checks:

```ts
import { ResilientAgent } from 'confused-ai/production';
import { agent } from 'confused-ai';

const myAgent = agent({ model: 'gpt-4o', instructions: '...' });

const resilient = new ResilientAgent(myAgent, {
  retries: 3,                    // retry failed runs up to 3 times
  retryDelay: 1000,              // ms between retries (exponential backoff)
  circuitBreaker: {
    threshold: 5,                // open circuit after 5 consecutive failures
    resetAfter: 30_000,          // try again after 30s
  },
  fallbackModel: 'claude-3-haiku-20240307',  // use this model when primary fails
  timeout: 60_000,               // abort after 60s
  onFallback: (error) => console.warn('Falling back:', error.message),
});

// Use exactly like a normal agent
const result = await resilient.run('Process this data');
```

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
import { createFallbackChain } from 'confused-ai/llm';

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
import { RedisRateLimiter } from 'confused-ai/production';

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
import { HealthMonitor } from 'confused-ai/production';

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
import { ContextWindowManager } from 'confused-ai/llm';

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
import { CostTracker } from 'confused-ai/llm';

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

```ts
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

### Persistent budget store

The default `InMemoryBudgetStore` resets on restart. For persistence, implement `BudgetStore` or use the SQLite default:

```ts
import { InMemoryBudgetStore, BudgetEnforcer } from 'confused-ai/production';

// Custom Postgres-backed store:
import type { BudgetStore } from 'confused-ai/production';

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
import { BudgetExceededError } from 'confused-ai/production';

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

```ts
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

### Checkpoint stores

| Store | Import | Notes |
|-------|--------|-------|
| `InMemoryCheckpointStore` | `confused-ai/production` | Dev/test — does not survive restarts |
| `SqliteCheckpointStore` | `confused-ai/production` | Durable default |
| `createSqliteCheckpointStore` | `confused-ai/production` | Factory shorthand |

### Custom checkpoint store

```ts
import type { AgentCheckpointStore, AgentRunState } from 'confused-ai/production';

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
import { createHttpService, listenService } from 'confused-ai/runtime';
import { apiKeyAuth, bearerAuth } from 'confused-ai/runtime';

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
import { bearerAuth } from 'confused-ai/runtime';

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
import { createHttpService } from 'confused-ai/runtime';

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
import { jwtAuth, hasRole } from 'confused-ai/runtime';

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

---

## Idempotency

Prevent duplicate side-effects when clients retry failed HTTP requests. Pass an `X-Idempotency-Key` header and the same response is returned on replay — the agent does **not** re-execute.

```ts
import { createHttpService } from 'confused-ai/runtime';
import { createSqliteIdempotencyStore } from 'confused-ai/production';

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
import type { IdempotencyStore } from 'confused-ai/production';

class RedisIdempotencyStore implements IdempotencyStore {
  async get(key: string) { /* fetch from Redis */ }
  async set(key: string, status: number, body: string, ttlMs: number) { /* store in Redis with TTL */ }
}
```

---

## Audit log

Persistent, queryable audit trail for every agent run. Satisfies SOC 2 and HIPAA requirements for tamper-evident logging.

```ts
import { createHttpService } from 'confused-ai/runtime';
import { createSqliteAuditStore } from 'confused-ai/production';

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
import { RedisRateLimiter } from 'confused-ai/production';

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
import { createSqliteApprovalStore, waitForApproval, ApprovalRejectedError } from 'confused-ai/production';

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
