# Lifecycle Hooks

Hooks let you inject logic at any point in an agent's execution without modifying the agent itself. Perfect for logging, tracing, analytics, and custom middleware.

## Available hooks

```ts
interface AgenticLifecycleHooks {
  /**
   * Called before the run starts.
   * Return a modified prompt string to override the input.
   */
  beforeRun?: (prompt: string, config: AgenticRunConfig) => Promise<string> | string;

  /**
   * Called after the run completes.
   * Return a modified result to override what the caller receives.
   */
  afterRun?: (result: AgenticRunResult) => Promise<AgenticRunResult> | AgenticRunResult;

  /**
   * Called before each LLM step.
   * Return a modified messages array to override (e.g. inject context, compress history).
   */
  beforeStep?: (step: number, messages: Message[]) => Promise<Message[]> | Message[];

  /**
   * Called after each LLM step — observe only, no override.
   */
  afterStep?: (step: number, messages: Message[], text: string) => Promise<void> | void;

  /**
   * Called before each tool executes.
   * Return modified args to override what the tool receives.
   */
  beforeToolCall?: (
    name: string,
    args: Record<string, unknown>,
    step: number,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;

  /**
   * Called after each tool executes.
   * Return a modified result to override what the LLM sees.
   */
  afterToolCall?: (
    name: string,
    result: unknown,
    args: Record<string, unknown>,
    step: number,
  ) => Promise<unknown> | unknown;

  /**
   * Override the system prompt.
   * Receives the base instructions and optional RAG context.
   */
  buildSystemPrompt?: (
    instructions: string,
    ragContext?: string,
  ) => Promise<string> | string;

  /**
   * Called on any error in the loop.
   */
  onError?: (error: Error, step: number) => Promise<void> | void;
}
```

## Attaching hooks

### Via `agent()` options

```ts
import { agent } from 'confused-ai';

const myAgent = agent({
  instructions: '...',
  hooks: {
    beforeRun: async (prompt) => {
      console.log('Starting run:', prompt);
      return prompt; // return (optionally modified) prompt
    },

    afterRun: async (result) => {
      console.log(`Completed in ${result.steps} steps`);
      await analytics.track('agent_run', { text: result.text });
      return result;
    },

    onError: async (error, step) => {
      console.error(`Step ${step} error:`, error.message);
      await alerting.notify(error);
    },
  },
});
```

### Via `defineAgent().hooks()`

```ts
import { defineAgent } from 'confused-ai';

const myAgent = defineAgent({
  model: 'gpt-4o',
  instructions: '...',
}).hooks({
  beforeRun: async (prompt) => {
    console.log('Starting run:', prompt);
    return prompt;
  },
  afterRun: async (result) => {
    console.log('Done. Steps:', result.steps);
    return result;
  },
});
```

### Via run options (per-run)

Override or supplement agent-level hooks for a single run:

```ts
const result = await myAgent.run('Do something', {
  hooks: {
    beforeToolCall: async (name, args, step) => {
      console.log(`Step ${step} → calling tool: ${name}`, args);
      return args; // return (optionally modified) args
    },
    afterToolCall: async (name, result, args, step) => {
      console.log(`Tool result: ${name}`, result);
      return result;
    },
  },
});
```

## Common patterns

### Request/response logging

```ts
const loggingHooks = {
  beforeRun: async (prompt: string) => {
    console.time('agent-run');
    console.log('[agent] start:', prompt.slice(0, 80));
    return prompt;
  },
  afterRun: async (result: AgenticRunResult) => {
    console.timeEnd('agent-run');
    console.log('[agent] done, steps:', result.steps, 'finish:', result.finishReason);
    return result;
  },
};
```

### Tool call guard (approval gate)

```ts
const approvalHooks = {
  beforeToolCall: async (name: string, args: Record<string, unknown>, step: number) => {
    if (dangerousTools.includes(name)) {
      const approved = await humanApprovalService.ask(name, args);
      if (!approved) throw new Error(`Tool ${name} rejected by human at step ${step}`);
    }
    return args;
  },
};
```

### Dynamic system prompt injection

```ts
const dynamicPromptHooks = {
  buildSystemPrompt: async (base: string, ragContext?: string) => {
    const user = await userDb.get(currentUserId);
    const context = ragContext ? `\n\nKnowledge:\n${ragContext}` : '';
    return `${base}\n\nUser: ${user.name} (${user.plan} plan). Region: ${user.region}.${context}`;
  },
};
```

### OpenTelemetry tracing

```ts
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('my-agent');
let activeSpan: ReturnType<typeof tracer.startSpan> | undefined;

const tracingHooks = {
  beforeRun: async (prompt: string) => {
    activeSpan = tracer.startSpan('agent.run', { attributes: { 'prompt.length': prompt.length } });
    return prompt;
  },
  afterRun: async (result: AgenticRunResult) => {
    activeSpan?.setAttribute('steps', result.steps);
    activeSpan?.end();
    return result;
  },
  onError: async (error: Error, step: number) => {
    activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    activeSpan?.setAttribute('error.step', step);
    activeSpan?.end();
  },
};
```

## Queue-backed hooks (long-running tasks)

For truly long-running or resource-intensive work — audit logging, analytics pipelines, CRM sync, ML model retraining triggers — the `background()` helper still executes inside the same process. **Queue-backed hooks** go a step further: they serialise the hook payload and dispatch it to an external queue so a worker process handles it, with durable delivery, retries, dead-letter, and back-pressure.

### Quick start — no extra dependencies

```ts
import { agent, queueHook, InMemoryBackgroundQueue } from 'confused-ai';

const queue = new InMemoryBackgroundQueue({ concurrency: 5 });

const ai = agent({
  model: 'gpt-4o',
  instructions: '...',
  hooks: {
    // caller gets the result immediately; analytics runs in a worker
    afterRun: queueHook(queue, 'analytics:run', (result) => ({
      steps:        result.steps,
      finishReason: result.finishReason,
      totalTokens:  result.usage?.totalTokens,
    })),

    afterStep: queueHook(queue, 'telemetry:step', (step, messages) => ({
      step,
      messageCount: messages.length,
    })),

    onError: queueHook(queue, 'errors:capture', (err, step) => ({
      message: err.message,
      stack:   err.stack,
      step,
    })),
  },
});

// Register worker handlers (same or separate process)
await queue.consume('analytics:run', async (task) => {
  await analytics.track('agent.run', task.payload);
});

await queue.consume('errors:capture', async (task) => {
  await sentry.captureException(task.payload);
}, { concurrency: 20 });
```

### Swap to a production backend

Replace `InMemoryBackgroundQueue` with any backend — the hook code never changes:

#### BullMQ (Redis-backed, durable, retries)

```ts
import { BullMQBackgroundQueue, queueHook } from 'confused-ai/background';

const queue = new BullMQBackgroundQueue({
  redis: process.env.REDIS_URL!,          // or { host, port, password }
  queueName: 'agent-hooks',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

// Enqueue with per-task options
const hook = queueHook(
  queue,
  'audit:afterRun',
  (result) => ({ steps: result.steps, text: result.text }),
  { retries: 5, delay: 0 },              // 5 retries, no delay
  { agentId: 'support-bot' },            // static meta on every task
);
```

Install peer dep: `bun add bullmq`

#### Kafka (high-throughput, ordered, replay)

```ts
import { KafkaBackgroundQueue, queueHook } from 'confused-ai/background';

const queue = new KafkaBackgroundQueue({
  brokers:        ['kafka:9092'],
  topic:          'agent-hooks',
  clientId:       'my-agent-app',
  groupId:        'agent-workers',
  partitionKey:   'meta.agentId',   // route same agent to same partition
});
```

Install peer dep: `bun add kafkajs`

#### RabbitMQ / AMQP (routing, dead-letter exchanges)

```ts
import { RabbitMQBackgroundQueue, queueHook } from 'confused-ai/background';

const queue = new RabbitMQBackgroundQueue({
  url:                'amqp://localhost',
  queue:              'agent-hooks',
  durable:            true,
  deadLetterExchange: 'agent-hooks-dlx',
});
```

Install peer dep: `bun add amqplib`

#### Redis Pub/Sub (lightweight fanout, no durability)

```ts
import Redis from 'ioredis';
import { RedisPubSubBackgroundQueue, queueHook } from 'confused-ai/background';

const queue = new RedisPubSubBackgroundQueue({
  publisher:  new Redis(process.env.REDIS_URL!),
  subscriber: new Redis(process.env.REDIS_URL!),
  channel:    'agent-hooks',
});
```

Install peer dep: `bun add ioredis`

#### AWS SQS (managed, serverless, Lambda-friendly)

```ts
import { SQSBackgroundQueue, queueHook } from 'confused-ai/background';

const queue = new SQSBackgroundQueue({
  queueUrl:          process.env.SQS_QUEUE_URL!,
  region:            'us-east-1',
  visibilityTimeout: 60,
  waitTimeSeconds:   20,
});
```

Install peer dep: `bun add @aws-sdk/client-sqs`

### Build your own adapter

Implement the `BackgroundQueue` interface to connect any other system (Inngest, Trigger.dev, Upstash QStash, Azure Service Bus, Google Pub/Sub, etc.):

```ts
import type { BackgroundQueue, BackgroundTask, BackgroundTaskHandler, EnqueueOptions, WorkerOptions } from 'confused-ai/background';

class MyCustomQueue implements BackgroundQueue {
  readonly name = 'my-custom-queue';

  async enqueue<TPayload>(
    task: Omit<BackgroundTask<TPayload>, 'id' | 'enqueuedAt'>,
    options?: EnqueueOptions,
  ): Promise<void> {
    // push task to your backend
  }

  async consume<TPayload>(
    type: string,
    handler: BackgroundTaskHandler<TPayload>,
    options?: WorkerOptions,
  ): Promise<() => Promise<void>> {
    // start consuming, return a stop function
    return async () => { /* stop */ };
  }

  async close(): Promise<void> {
    // drain + disconnect
  }
}
```

### Decision guide

| Backend | Durability | Retries | Ordering | Replay | When to use |
|---------|-----------|---------|---------|--------|-------------|
| `InMemoryBackgroundQueue` | ❌ in-process | ✅ basic | ❌ | ❌ | Dev, test, single-node |
| `BullMQBackgroundQueue` | ✅ Redis | ✅ configurable | ✅ per-queue | ✅ | Most production use cases |
| `KafkaBackgroundQueue` | ✅ disk | ✅ via retry-topic | ✅ per-partition | ✅ | High-throughput, analytics, event sourcing |
| `RabbitMQBackgroundQueue` | ✅ disk | ✅ DLX | ❌ | ❌ | Microservice task delegation |
| `RedisPubSubBackgroundQueue` | ❌ in-flight | ❌ | ❌ | ❌ | Real-time fanout, dashboards |
| `SQSBackgroundQueue` | ✅ AWS | ✅ DLQ | ❌ | ❌ | Serverless, Lambda workers, AWS-native |

### `queueHook()` signature

```ts
queueHook<TArgs, TPayload>(
  queue:     BackgroundQueue,
  type:      string,               // task type / worker route key
  payloadFn: (...args: TArgs) => TPayload, // extract serialisable payload from hook args
  options?:  EnqueueOptions,       // { delay?, retries?, backendOptions? }
  meta?:     { agentId?, runId?, traceId?, sessionId? },
): (...args: TArgs) => void        // hook-compatible, never blocks
```

::: tip What to put in the payload
`payloadFn` runs in the hot path, so keep it lightweight.  Only extract what the worker
actually needs — avoid serialising entire `Message[]` arrays unless necessary.
:::

::: warning Ordering of queue-backed hooks vs `background()`
`queueHook` dispatches **before** `background()` since they wrap the hook at different levels.
Blocking hooks (`beforeRun`, `beforeStep`, etc.) must NOT be wrapped with either wrapper.
:::



Every hook is `await`ed by the agentic loop, so a slow `afterRun` or `onError` handler delays the caller. Use `background()` to fire-and-forget a **void-returning** hook — the loop moves on immediately while the async work runs in the background. Errors are caught and logged, never crashing the run.

```ts
import { agent, background } from 'confused-ai';

const ai = agent({
  model: 'gpt-4o',
  instructions: '...',
  hooks: {
    // analytics — never adds latency to the caller
    afterStep: background(async (step, messages) => {
      await analytics.track('agent.step', { step, tokens: messages.length });
    }),

    // fire-and-forget telemetry on completion
    afterRun: background(async (result) => {
      await telemetry.record({ steps: result.steps, tokens: result.usage?.totalTokens });
    }),

    // non-blocking error reporting
    onError: background(async (err, step) => {
      await errorTracker.capture(err, { step });
    }),
  },
});
```

### Rules

| Hook | Background-safe? | Notes |
|------|-----------------|-------|
| `afterStep` | ✅ yes | always void |
| `onError` | ✅ yes | always void |
| `afterRun` | ✅ yes (fire-and-forget) | return value is ignored; caller gets original result |
| `beforeRun` | ❌ no | must be blocking — transforms the prompt |
| `beforeStep` | ❌ no | must be blocking — transforms messages |
| `beforeToolCall` | ❌ no | must be blocking — transforms tool args |
| `afterToolCall` | ❌ no | must be blocking — transforms tool result |
| `buildSystemPrompt` | ❌ no | must be blocking — transforms system prompt |

::: warning Errors in background hooks
Rejections from background hooks are caught and written to `console.error`. They will **not** surface as run failures — pass an error tracking function explicitly if you need alerting.
:::

## Composing hooks

Use `compose()` to merge multiple hook objects. Agent-level hooks run first, per-run hooks after:

```ts
import { agent } from 'confused-ai';

// Provide multiple hook objects at agent construction — they are merged
const ai = agent({
  instructions: '...',
  hooks: {
    ...loggingHooks,
    ...tracingHooks,
  },
});
```

See [Compose & Pipe](/guide/compose) for multi-agent pipelines.
