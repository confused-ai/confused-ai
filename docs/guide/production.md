---
title: Production & Resilience
description: Circuit breakers, rate limiting, retries, health checks, graceful shutdown, budget enforcement, and checkpointing.
outline: [2, 3]
---

# Production & Resilience

`@confused-ai/production` provides everything needed to run agents reliably in production.

## Circuit breaker

Stop cascading failures when the LLM API is degraded:

```ts
import { CircuitBreaker, createLLMCircuitBreaker } from 'confused-ai/production';

// Pre-configured for LLM APIs
const cb = createLLMCircuitBreaker({
  failureThreshold: 5,      // open after 5 consecutive failures
  resetTimeoutMs: 30_000,   // try again after 30s
  halfOpenRequests: 2,      // allow 2 test requests when half-open
});

const result = await cb.execute(() => llm.generateText(messages));
console.log(cb.state);  // 'closed' | 'open' | 'half-open'
```

## Rate limiter

Cap requests per minute (token bucket):

```ts
import { RateLimiter, createOpenAIRateLimiter } from 'confused-ai/production';

// OpenAI defaults: 60 RPM, 90k TPM
const limiter = createOpenAIRateLimiter({ tier: 'tier-1' });

// Custom
const custom = new RateLimiter({
  maxRpm: 60,
  maxTpm: 100_000,
});

// Blocks until a slot is available (no request dropped)
await limiter.acquire();
const result = await llm.generateText(messages);
```

### Redis rate limiter (distributed)

```ts
import { RedisRateLimiter } from 'confused-ai/production';

const limiter = new RedisRateLimiter({
  redis: redisClient,
  key: 'openai-rate',
  maxRpm: 60,
});
```

## `withResilience()` — all-in-one wrapper

Wrap any agent with circuit breaker + rate limit + retries:

```ts
import { agent } from 'confused-ai';
import { withResilience } from 'confused-ai/guard';

const base = agent({ model: 'gpt-4o' });

const resilient = withResilience(base, {
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
  rateLimit:      { maxRpm: 60 },
  retry:          { maxRetries: 3, backoffMs: 1_000, exponential: true },
  timeout:        { ms: 60_000 },
});

const result = await resilient.run({ prompt: 'Process this' });

// Health check
const health = resilient.health();
console.log(health.status);        // 'healthy' | 'degraded' | 'unhealthy'
console.log(health.circuitState);  // 'closed' | 'open' | 'half-open'
```

## Budget enforcement

Hard-stop agents when they exceed cost or token budgets:

```ts
import { agent } from 'confused-ai';
import { BudgetEnforcer } from 'confused-ai/production';

const enforcer = new BudgetEnforcer({
  maxCostUsd: 0.10,       // $0.10 per run
  maxTokens: 50_000,      // 50k tokens per run
  maxCostPerUser: 1.00,   // $1.00 per user per day
});

const ai = agent({
  model: 'gpt-4o',
  budget: { maxCostUsd: 0.10, maxTokens: 50_000 },
});
```

## Health checks

Monitor all agent dependencies:

```ts
import {
  HealthCheckManager,
  createLLMHealthCheck,
  createHttpHealthCheck,
  createSessionStoreHealthCheck,
} from 'confused-ai/production';

const health = new HealthCheckManager({
  checks: [
    createLLMHealthCheck('openai', llmProvider),
    createSessionStoreHealthCheck('sessions', sessionStore),
    createHttpHealthCheck('database', 'http://db:5432/health'),
  ],
  intervalMs: 30_000,
});

await health.start();

// GET /health → { status: 'healthy', components: {...} }
const status = await health.check();
```

## Graceful shutdown

Drain in-flight requests before shutting down:

```ts
import { createGracefulShutdown, withShutdownGuard } from 'confused-ai/production';

const shutdown = createGracefulShutdown({
  timeoutMs: 30_000,
  onShutdown: async () => {
    await db.close();
    await sessions.close();
  },
});

// Register SIGTERM/SIGINT handlers
process.on('SIGTERM', () => shutdown.initiate());
process.on('SIGINT',  () => shutdown.initiate());
```

## Checkpointing (resume long runs)

Persist agent state so runs can be resumed after crashes:

```ts
import { agent } from 'confused-ai';
import { createCheckpointStore } from 'confused-ai/production';

const checkpointStore = createCheckpointStore({
  url: 'file:./checkpoints.db',
});

const ai = agent({
  model: 'gpt-4o',
  checkpointStore,
});

// Run with a stable runId for idempotency
const result = await ai.run({
  prompt: 'Process this large document...',
  runId: 'job-2024-001',
});

// If the process crashes, resume from checkpoint
const resumed = await ai.resume('job-2024-001');
```

## Resumable streaming

Stream tokens with checkpoint recovery:

```ts
import { createResumableStream } from 'confused-ai/production';

const stream = createResumableStream(ai, {
  prompt: 'Write a detailed report...',
  streamId: 'report-001',
  checkpointStore,
});

// If connection drops, client reconnects and stream resumes from last checkpoint
for await (const chunk of stream) {
  res.write(`data: ${chunk}\n\n`);
}
```

## Retry policies

```ts
import { retry } from 'confused-ai/guard';

const result = await retry(
  () => llm.generateText(messages),
  {
    maxRetries: 3,
    backoffMs: 500,
    exponential: true,
    retryOn: (err) => err.status === 429 || err.status >= 500,
  }
);
```

## Secret manager

Load secrets from cloud vaults at startup:

```ts
import { createSecretManager } from 'confused-ai/config';

// AWS Secrets Manager
const secrets = createSecretManager({
  provider: 'aws',
  region: 'us-east-1',
  secretId: 'my-app/production',
});

const apiKey = await secrets.get('OPENAI_API_KEY');
```

Supported providers: `aws`, `azure`, `gcp`, `vault`, `env`.
