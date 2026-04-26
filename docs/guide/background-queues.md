# Background Queues

The Background Queue system lets you dispatch long-running hook work to an external queue backend instead of running it inside the agentic loop. This keeps agent latency low even when post-processing (analytics, billing, notifications) takes seconds.

> **Import path:** `confused-ai/background`

---

## Why background queues?

By default, `afterRun` hooks run **synchronously** in the agentic loop. If your hook takes 2 seconds to write to a data warehouse, the user waits 2 extra seconds. With `queueHook`, the task is enqueued and the agent returns immediately. A worker picks it up asynchronously.

```
agent.run() ──► LLM loop ──► result returned to user   ← fast
                              └──► queue.enqueue(task)   ← background
                                       └──► worker processes it
```

---

## Quick start

```ts
import { agent } from 'confused-ai';
import { queueHook, InMemoryBackgroundQueue } from 'confused-ai/background';

// Default: in-memory worker pool (no extra deps, great for dev/test)
const queue = new InMemoryBackgroundQueue({ concurrency: 5 });

const ai = agent({
  model: 'gpt-4o',
  instructions: 'You are a helpful assistant.',
  hooks: {
    afterRun: queueHook(queue, 'analytics', (result) => ({
      steps: result.steps,
      tokens: result.usage?.totalTokens,
      finishReason: result.finishReason,
    })),
  },
});

// Register a worker handler — same process or separate service
await queue.consume('analytics', async (task) => {
  await analytics.track('agent.run', task.payload);
});
```

---

## Queue backends

Replace `InMemoryBackgroundQueue` with a production backend. All implement the same `BackgroundQueue` interface.

### In-memory (default)

```ts
import { InMemoryBackgroundQueue } from 'confused-ai/background';

const queue = new InMemoryBackgroundQueue({
  concurrency: 10,   // parallel workers
});
```

Good for: dev, tests, single-process apps. Does not survive restarts.

### BullMQ (Redis-backed, recommended for production)

```bash
bun add bullmq
```

```ts
import { BullMQBackgroundQueue } from 'confused-ai/background';

const queue = new BullMQBackgroundQueue({
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});
```

Good for: durable tasks, retries, delays, scheduled jobs, fan-out.

### Kafka

```bash
bun add kafkajs
```

```ts
import { KafkaBackgroundQueue } from 'confused-ai/background';

const queue = new KafkaBackgroundQueue({
  clientId: 'agent-framework',
  brokers: ['kafka:9092'],
  groupId: 'agent-workers',
});
```

Good for: high-throughput pipelines, ordered processing, event replay.

### RabbitMQ

```bash
bun add amqplib
```

```ts
import { RabbitMQBackgroundQueue } from 'confused-ai/background';

const queue = new RabbitMQBackgroundQueue({
  url: 'amqp://localhost',
  exchange: 'agent-events',
  exchangeType: 'direct',
});
```

Good for: routing, dead-letter exchanges, priority queues.

### AWS SQS

```bash
bun add @aws-sdk/client-sqs
```

```ts
import { SQSBackgroundQueue } from 'confused-ai/background';

const queue = new SQSBackgroundQueue({
  region: 'us-east-1',
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/agent-tasks',
});
```

Good for: serverless, AWS-native infrastructure.

### Redis Pub/Sub (lightweight fanout)

```bash
bun add ioredis
```

```ts
import { RedisPubSubBackgroundQueue } from 'confused-ai/background';
import Redis from 'ioredis';

const pub = new Redis(process.env.REDIS_URL);
const sub = pub.duplicate();

const queue = new RedisPubSubBackgroundQueue({ publisher: pub, subscriber: sub });
```

Good for: fire-and-forget fanout, multiple consumers for the same event.

---

## `queueHook()` API

```ts
import { queueHook } from 'confused-ai/background';
import type { BackgroundQueue } from 'confused-ai/background';

queueHook(
  queue,          // BackgroundQueue instance
  topicName,      // string — task topic / queue name
  payloadFn,      // (hookArg) => payload — transform the hook argument into a task payload
  options?,       // EnqueueOptions
)
```

### `EnqueueOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `delay` | `number` | `0` | Delay before task is available (ms). Backend-dependent. |
| `priority` | `number` | `0` | Higher = processed first. Backend-dependent. |
| `attempts` | `number` | `3` | Max retry attempts on failure. |
| `deduplicationId` | `string` | — | Deduplicate identical tasks within a time window. |

---

## Custom `BackgroundQueue`

Implement the interface to bring any backend:

```ts
import type { BackgroundQueue, BackgroundTask, BackgroundTaskHandler, EnqueueOptions, WorkerOptions } from 'confused-ai/background';

class MyQueue implements BackgroundQueue {
  async enqueue<T>(topic: string, payload: T, opts?: EnqueueOptions): Promise<string> {
    // push to your backend, return taskId
    return 'task-id';
  }

  async consume<T>(topic: string, handler: BackgroundTaskHandler<T>, opts?: WorkerOptions): Promise<void> {
    // start consuming from your backend
  }

  async close(): Promise<void> {
    // clean up connections
  }
}
```

---

## Multiple hooks, multiple topics

```ts
import { queueHook, InMemoryBackgroundQueue } from 'confused-ai/background';

const queue = new InMemoryBackgroundQueue();

const ai = agent({
  model: 'gpt-4o',
  instructions: '...',
  hooks: {
    afterRun: queueHook(queue, 'analytics', (r) => ({
      steps: r.steps,
      tokens: r.usage?.totalTokens,
    })),
    onError: queueHook(queue, 'error-alerts', (err) => ({
      message: err.message,
      stack: err.stack,
    })),
  },
});

// Workers
await queue.consume('analytics', async (task) => {
  await db.insert('runs', task.payload);
});

await queue.consume('error-alerts', async (task) => {
  await pagerduty.trigger(task.payload);
});
```

---

## Exports

| Export | Description |
|--------|-------------|
| `queueHook` | Wrap a hook to dispatch tasks to a queue |
| `InMemoryBackgroundQueue` | In-process queue (dev/test) |
| `BullMQBackgroundQueue` | Redis-backed durable queue |
| `KafkaBackgroundQueue` | Kafka high-throughput queue |
| `RabbitMQBackgroundQueue` | AMQP queue |
| `SQSBackgroundQueue` | AWS SQS queue |
| `RedisPubSubBackgroundQueue` | Redis Pub/Sub fanout queue |
| `BackgroundQueue` | Interface — implement to bring any backend |
| `BackgroundTask` | Task shape |
| `BackgroundTaskHandler` | Worker handler type |
| `EnqueueOptions` | Enqueue options type |
| `WorkerOptions` | Worker options type |
| `QueuedHook` | Hook wrapper return type |
