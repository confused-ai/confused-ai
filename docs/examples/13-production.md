# 13 · Production Resilience 🔴

Production agents need to survive API outages, rate limits, slow responses,
and cascading failures. This example shows the patterns that keep agents
running when things go wrong.

## What you'll learn

- Fallback chains (if GPT-4 is down, use Claude)
- Retry with exponential backoff
- Circuit breakers (stop hammering a failing service)
- Timeout guards
- Graceful degradation

## 1 · LLM Fallback Chain

If your primary model is unavailable, automatically fall back to alternatives:

```ts
import { createAgent } from 'confused-ai';
import { FallbackChain } from 'confused-ai/llm';

// Tries models in order — uses first one that responds
const resilientModel = new FallbackChain([
  { provider: 'openai',    model: 'gpt-4o',               timeout: 30_000 },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', timeout: 30_000 },
  { provider: 'openai',    model: 'gpt-4o-mini',          timeout: 15_000 }, // cheaper fallback
]);

const agent = createAgent({
  name: 'resilient-agent',
  model: resilientModel,
  instructions: 'You are a helpful assistant.',
});

// If gpt-4o is down → tries Claude → tries gpt-4o-mini
const result = await agent.run('Explain quantum entanglement simply.');
console.log(result.text);
console.log('Used model:', result.modelUsed); // whichever succeeded
```

## 2 · Retry with Backoff

```ts
import { createAgent } from 'confused-ai';

const agent = createAgent({
  model: 'gpt-4o-mini',
  retry: {
    maxAttempts: 3,
    initialDelayMs: 1_000,
    backoffMultiplier: 2,   // 1s → 2s → 4s
    retryOn: [              // only retry these errors
      'rate_limit',
      'server_error',
      'timeout',
    ],
  },
});
```

Manual retry wrapper for tools:

```ts
async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, delayMs = 1000 } = {}
): Promise<T> {
  let lastErr: Error = new Error('unknown');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        console.warn(`Attempt ${attempt} failed, retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

// Usage
const result = await withRetry(() => agent.run('Summarize this article: ...'));
```

## 3 · Circuit Breaker

After N failures, the circuit "opens" — all requests fail fast for a cooldown
period instead of continuing to hammer a broken service.

```ts
// npm install confused-ai (includes circuit breaker)
import { CircuitBreaker } from 'confused-ai';

const breaker = new CircuitBreaker({
  name: 'openai-api',
  threshold: 5,          // open after 5 failures
  timeout: 60_000,       // stay open for 60s
  halfOpenRequests: 2,   // allow 2 test requests when half-open
});

// Wrap any async operation
const result = await breaker.execute(async () => {
  return await agent.run('Hello');
});

// Monitor state
console.log(breaker.state);  // 'closed' | 'open' | 'half-open'
console.log(breaker.stats);  // { failures, successes, rejections }
```

## 4 · Timeout Guard

Never let an agent hang forever:

```ts
function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Agent call with 30-second hard timeout
const result = await withTimeout(
  agent.run('Research and summarize the latest AI news'),
  30_000,
  'agent.run'
);
```

Or configure it directly:

```ts
const agent = createAgent({
  model: 'gpt-4o-mini',
  timeoutMs: 30_000,       // agent-level timeout
  toolTimeoutMs: 10_000,   // per-tool timeout
});
```

## 5 · Graceful Degradation

When the agent fails, fall back to a static response:

```ts
async function safeAgentRun(message: string, userId: string) {
  try {
    const result = await withTimeout(
      agent.run(message, { userId }),
      20_000
    );
    return { text: result.text, source: 'agent' };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    
    // Log the failure
    console.error('[agent] failed:', error.message, { userId, message });
    
    // Return a graceful fallback
    if (error.message.includes('rate_limit')) {
      return {
        text: "We're experiencing high demand. Please try again in a moment.",
        source: 'fallback',
      };
    }
    return {
      text: "I'm temporarily unavailable. Our team has been notified. Please try again shortly.",
      source: 'fallback',
    };
  }
}
```

## 6 · Health Check Endpoint

```ts
import { createServer } from 'node:http';

let agentHealthy = true;
let lastSuccessAt = Date.now();

// Probe the agent every 30s
setInterval(async () => {
  try {
    await withTimeout(agent.run('ping'), 5_000);
    agentHealthy = true;
    lastSuccessAt = Date.now();
  } catch {
    agentHealthy = false;
    console.error('[health] agent probe failed');
  }
}, 30_000);

const server = createServer((req, res) => {
  if (req.url === '/health') {
    const status = agentHealthy ? 200 : 503;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: agentHealthy ? 'ok' : 'degraded',
      lastSuccessAt: new Date(lastSuccessAt).toISOString(),
    }));
  }
});
```

## 7 · Full ResilientAgent Pattern

Combine everything:

```ts
import { createAgent } from 'confused-ai';
import { FallbackChain } from 'confused-ai/llm';

const agent = createAgent({
  name: 'production-agent',
  model: new FallbackChain([
    { provider: 'openai',    model: 'gpt-4o',       timeout: 25_000 },
    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', timeout: 25_000 },
    { provider: 'openai',    model: 'gpt-4o-mini',  timeout: 15_000 },
  ]),
  retry: { maxAttempts: 2, backoffMultiplier: 2 },
  timeoutMs: 45_000,
  toolTimeoutMs: 10_000,
  hooks: {
    onError: (err, ctx) => {
      // Send to your alerting system
      void alerting.notify({ error: err.message, userId: ctx.userId });
    },
  },
});
```

## What's next?

- [14 · MCP Filesystem Agent](./14-mcp) — Model Context Protocol tools
- [15 · Full-Stack App](./15-full-stack) — put it all together
