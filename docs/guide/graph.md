# Graph Engine

The graph engine executes complex, stateful multi-agent workflows as a **directed acyclic graph (DAG)**. It provides topological execution ordering, parallel node execution, event sourcing with deterministic replay, suspend/resume, and a distributed worker model.

## Quick start

```ts
import { createGraph, DAGEngine, NodeKind } from 'confused-ai/graph';
import { z } from 'zod';

const graph = createGraph('report-pipeline')
  .addNode({
    id:   'fetch',
    kind: NodeKind.TASK,
    execute: async (ctx) => {
      const data = await fetchData(ctx.state.url as string);
      return { data };
    },
  })
  .addNode({
    id:   'analyze',
    kind: NodeKind.TASK,
    execute: async (ctx) => {
      const { data } = ctx.state.fetch as { data: unknown[] };
      return { analysis: await analyzeData(data) };
    },
  })
  .addNode({
    id:   'publish',
    kind: NodeKind.TASK,
    execute: async (ctx) => {
      await publishReport(ctx.state.analyze as { analysis: string });
    },
  })
  .chain('fetch', 'analyze') // fetch → analyze → publish
  .chain('analyze', 'publish')
  .build();

const engine = new DAGEngine(graph);
const result = await engine.execute({ url: 'https://api.example.com/data' });

console.log(result.status);        // 'completed' | 'failed' | 'suspended'
console.log(result.state.analyze); // { analysis: '...' }
```

## Node kinds

| `NodeKind` | Description |
|------------|-------------|
| `TASK` | Runs an `execute` function; the workhorse node |
| `ROUTER` | Reads state and returns the next node ID(s) to execute |
| `PARALLEL` | Fans out to multiple child nodes, runs them concurrently |
| `JOIN` | Waits for all incoming parallel branches before continuing |
| `SUBGRAPH` | Embeds another `GraphDef` — composes graphs hierarchically |
| `AGENT` | Runs a confused-ai agent via `AgentNodeConfig` |
| `WAIT` | Suspends execution until `.resume()` is called |
| `START` | Entry point (auto-created by `createGraph`) |
| `END` | Terminal node (auto-created by `createGraph`) |

## Parallel fan-out and join

```ts
import { createGraph, DAGEngine, NodeKind } from 'confused-ai/graph';

const graph = createGraph('parallel-research')
  .addNode({ id: 'news',    kind: NodeKind.TASK, execute: async () => ({ news: await fetchNews() }) })
  .addNode({ id: 'papers',  kind: NodeKind.TASK, execute: async () => ({ papers: await fetchPapers() }) })
  .addNode({ id: 'patents', kind: NodeKind.TASK, execute: async () => ({ patents: await fetchPatents() }) })
  .addNode({
    id:   'synthesize',
    kind: NodeKind.TASK,
    execute: async (ctx) => {
      const { news }    = ctx.state.news    as { news: string };
      const { papers }  = ctx.state.papers  as { papers: string };
      const { patents } = ctx.state.patents as { patents: string };
      return { report: await synthesize({ news, papers, patents }) };
    },
  })
  // Fan out in parallel, join before synthesize
  .addNode({ id: 'fan-out', kind: NodeKind.PARALLEL, children: ['news', 'papers', 'patents'] })
  .addNode({ id: 'join',    kind: NodeKind.JOIN,     waitFor: ['news', 'papers', 'patents'] })
  .chain('fan-out', 'join')
  .chain('join', 'synthesize')
  .build();
```

## Conditional routing

```ts
.addNode({
  id:   'route',
  kind: NodeKind.ROUTER,
  route: async (ctx) => {
    const { type } = ctx.state.classify as { type: string };
    return type === 'code' ? 'handle-code' : 'handle-text';
  },
})
```

## Agent nodes

Wire a confused-ai agent directly into the graph:

```ts
import { createGraph, DAGEngine, NodeKind } from 'confused-ai/graph';
import { createAgent } from 'confused-ai';

const analystAgent = createAgent({ name: 'analyst', llm, instructions: 'Analyze the data.' });

const graph = createGraph('ai-pipeline')
  .addNode({
    id:    'ai-analysis',
    kind:  NodeKind.AGENT,
    agent: analystAgent,
    // The agent receives ctx.state as its prompt context
    buildPrompt: (ctx) => `Analyze this data: ${JSON.stringify(ctx.state.data)}`,
  })
  .build();
```

## Suspend and resume

Use `NodeKind.WAIT` to pause the graph — e.g., while awaiting external approval:

```ts
const graph = createGraph('approval-flow')
  .addNode({ id: 'draft',   kind: NodeKind.TASK, execute: async () => ({ draft: 'My draft...' }) })
  .addNode({ id: 'approve', kind: NodeKind.WAIT })   // ← suspends here
  .addNode({ id: 'publish', kind: NodeKind.TASK, execute: async (ctx) => publish(ctx.state) })
  .chain('draft', 'approve')
  .chain('approve', 'publish')
  .build();

const engine = new DAGEngine(graph);

// First pass — suspends at 'approve'
const r1 = await engine.execute({});
// r1.status === 'suspended'

// Later, after approval — replay + resume
const r2 = await engine.resume(r1.executionId, { approvedBy: 'alice' });
// r2.status === 'completed'
```

## Event sourcing and replay

Every node execution is recorded as an immutable `GraphEvent`. You can deterministically replay any execution up to a given point.

```ts
import { InMemoryEventStore, SqliteEventStore, replayState } from 'confused-ai/graph';

// Durable store (survives restarts)
const eventStore = SqliteEventStore.create('./graph-events.db');

const engine = new DAGEngine(graph, { eventStore });

// Run
const result = await engine.execute({ url: '...' });

// Later — replay to inspect state at step 2
const pastState = await replayState(eventStore, result.executionId, { upToStep: 2 });
```

## Plugins

Graph plugins intercept execution events — telemetry, logging, audit trails, rate limiting:

```ts
import {
  DAGEngine,
  TelemetryPlugin, LoggingPlugin, AuditPlugin, RateLimitPlugin,
} from 'confused-ai/graph';

const engine = new DAGEngine(graph, {
  plugins: [
    new TelemetryPlugin(),                        // OTel spans per node
    new LoggingPlugin({ level: 'info' }),          // structured logs
    new AuditPlugin({ store: myAuditStore }),       // tamper-evident audit trail
    new RateLimitPlugin({ maxConcurrent: 5 }),     // cap concurrent node runs
  ],
});
```

### Available plugins

| Plugin | Key config | Notes |
|--------|-----------|-------|
| `TelemetryPlugin` | `endpoint?: string` — OTLP HTTP endpoint | Tracks per-node p99 latency |
| `LoggingPlugin` | `level: 'debug' \| 'info' \| 'warn' \| 'error'` | Structured JSON to stdout |
| `AuditPlugin` | `maxEvents?: number` (default 10000) | O(1) indexed queries — see below |
| `RateLimitPlugin` | `maxTokensPerSecond: number`, `burst?: number` | Token-bucket rate limiter |
| `OpenTelemetryPlugin` | `tracer?: Tracer` — bring your own OTel tracer | OTel module imported once and cached |

### `AuditPlugin` — O(1) event queries

`AuditPlugin` maintains internal Maps so all three query methods are O(1) regardless of how many events are stored:

```ts
const audit = new AuditPlugin({ maxEvents: 50_000 });
const engine = new DAGEngine(graph, { plugins: [audit] });

await engine.execute({ url: '...' });

// All O(1) — index lookup, not full scan
const nodeEvents = audit.getEventsForNode('step-b');
const execEvents = audit.getEventsForExecution(result.executionId);
const errorEvents = audit.getEventsByType(GraphEventType.NODE_ERROR);
```

## Distributed execution

For high-throughput workloads, distribute node execution across multiple workers:

```ts
import { DistributedEngine, InMemoryTaskQueue, RedisTaskQueue, GraphWorker } from 'confused-ai/graph';

// In-process queue (dev/test)
const queue = new InMemoryTaskQueue();

// Redis-backed queue (production)
import Redis from 'ioredis';
const queue = new RedisTaskQueue({ client: new Redis(process.env.REDIS_URL!) });

// Spawn workers
const worker = new GraphWorker({ queue, concurrency: 4 });
worker.start();

// Run graphs via distributed engine
const engine = new DistributedEngine(graph, { queue });
const result = await engine.execute({ url: '...' });
```

## Multi-agent orchestration

`MultiAgentOrchestrator` executes a graph where each node is an agent, with full message routing:

```ts
import { MultiAgentOrchestrator, agentNode } from 'confused-ai/graph';
import { createAgent } from 'confused-ai';

const router = createAgent({ name: 'router', llm, instructions: 'Route to the right specialist.' });
const coder  = createAgent({ name: 'coder',  llm, instructions: 'Write code.' });
const writer = createAgent({ name: 'writer', llm, instructions: 'Write documentation.' });

const orchestrator = new MultiAgentOrchestrator({
  agents: [
    agentNode({ id: 'router', agent: router, routes: ['coder', 'writer'] }),
    agentNode({ id: 'coder',  agent: coder }),
    agentNode({ id: 'writer', agent: writer }),
  ],
  entrypoint: 'router',
});

const result = await orchestrator.run('Build a TypeScript utility library');
console.log(result.finalText);
console.log(result.rounds);     // per-agent exchange history
```

## `GraphBuilder` API reference

| Method | Description |
|--------|-------------|
| `addNode(config: NodeConfig)` | Add a node to the graph |
| `addEdge(from, to, config?)` | Add a directed edge with optional condition |
| `chain(...nodeIds)` | Shorthand to add sequential edges |
| `build()` | Seal the graph and return an immutable `GraphDef` |

## Event store options

| Store | Import | Notes |
|-------|--------|-------|
| `InMemoryEventStore` | `confused-ai/graph` | Dev/test — events lost on restart |
| `SqliteEventStore` | `confused-ai/graph` | Durable default; `SqliteEventStore.create(path)` |

---

## `DurableExecutor` — persistent durable runs

`DurableExecutor` wraps `DAGEngine` and **automatically persists every event** to an `EventStore`. On failure or restart, call `.resume(executionId)` to skip completed nodes and continue exactly where execution stopped.

```ts
import { createGraph, DurableExecutor, SqliteEventStore, NodeKind } from 'confused-ai/graph';

const graph = createGraph('long-job')
  .addNode({ id: 'step-a', kind: NodeKind.TASK, execute: async () => ({ a: 1 }) })
  .addNode({ id: 'step-b', kind: NodeKind.TASK, execute: async (ctx) => ({ b: (ctx.state['step-a'] as { a: number }).a + 1 }) })
  .chain('step-a', 'step-b')
  .build();

const store    = SqliteEventStore.create('./graph-events.db');
const executor = new DurableExecutor(graph, store);

// First run
const result = await executor.run({ variables: { input: 'hello' } });
console.log(result.executionId); // save this for resume
console.log(result.status);      // 'completed' | 'failed'

// If the process crashes mid-run and restarts:
const resumed = await executor.resume(result.executionId);
// Completed nodes are skipped; execution picks up from the last failed/pending node
```

### `DurableExecutor` API

```ts
class DurableExecutor {
  constructor(graph: GraphDef, eventStore: EventStore);

  // Start a fresh durable execution
  run(options?: Omit<ExecuteOptions, 'eventStore' | 'resumeFrom'>): Promise<ExecutionResult>;

  // Resume a previous execution by ID — replays events and skips completed nodes
  resume(
    executionId: ExecutionId,
    options?: Omit<ExecuteOptions, 'eventStore' | 'resumeFrom' | 'executionId'>,
  ): Promise<ExecutionResult>;
}
```

`ExecuteOptions` fields available on both `run()` and `resume()`:

| Option | Type | Description |
|--------|------|-------------|
| `variables` | `Record<string, unknown>` | Initial state variables |
| `maxConcurrency` | `number` | Max concurrent nodes |
| `signal` | `AbortSignal` | Cancel execution |
| `plugins` | `GraphPlugin[]` | Additional plugins for this run |
| `checkpointInterval` | `number` | Persist checkpoint every N events |
| `loggerFactory` | `(nodeId, name) => NodeLogger` | Per-node logger factory |

`ExecutionResult` fields:

| Field | Type | Description |
|-------|------|-------------|
| `executionId` | `ExecutionId` | Stable ID — pass to `.resume()` |
| `status` | `ExecutionStatus` | `'completed' \| 'failed' \| 'running' \| ...` |
| `state` | `GraphState` | Final state of all nodes |
| `events` | `GraphEvent[]` | All events emitted during this run |
| `durationMs` | `number` | Wall-clock duration |
| `error` | `string \| undefined` | Set when `status === 'failed'` |

---

## Wave-based scheduling with `computeWaves()`

`computeWaves(graph)` performs a topological sort and groups nodes into **execution waves** — sets of nodes with no dependencies on each other that can run in parallel. Useful for analysing graphs or implementing custom schedulers.

```ts
import { createGraph, computeWaves, NodeKind } from 'confused-ai/graph';

const graph = createGraph('pipeline')
  .addNode({ id: 'a', kind: NodeKind.TASK, execute: async () => ({}) })
  .addNode({ id: 'b', kind: NodeKind.TASK, execute: async () => ({}) })
  .addNode({ id: 'c', kind: NodeKind.TASK, execute: async () => ({}) })
  .addNode({ id: 'd', kind: NodeKind.TASK, execute: async () => ({}) })
  .chain('a', 'c')
  .chain('b', 'c')
  .chain('c', 'd')
  .build();

const waves = computeWaves(graph);
// waves[0] → ['a', 'b']  — can run in parallel (no deps)
// waves[1] → ['c']       — depends on a and b
// waves[2] → ['d']       — depends on c
```

```ts
// Signature
function computeWaves(graph: GraphDef): NodeId[][];
```

---

## Concurrency control with `BackpressureController`

`BackpressureController` is a semaphore that limits how many graph nodes (or any async operations) can run concurrently. It enqueues excess work instead of dropping it.

```ts
import { BackpressureController } from 'confused-ai/graph';

const bp = new BackpressureController(4); // max 4 concurrent

async function runNode(id: string) {
  await bp.acquire();  // blocks if 4 are already in-flight
  try {
    await doWork(id);
  } finally {
    bp.release();
  }
}

console.log(bp.inflight);    // currently running
console.log(bp.queueDepth);  // waiting to acquire
```

```ts
class BackpressureController {
  constructor(maxConcurrency: number);
  acquire(): Promise<void>;   // waits until a slot is free
  release(): void;            // frees a slot
  get inflight(): number;     // currently executing
  get queueDepth(): number;   // waiting in queue
  get maxConcurrency(): number;
}
```

`BackpressureController` is used internally by `DAGEngine` (controlled via `ExecuteOptions.maxConcurrency`) and by `GraphWorker` (via `workerOptions.concurrency`).

---

## Testing graphs

`confused-ai/testing` exports graph-specific test utilities:

```ts
import {
  createTestRunner,
  createMockLLMProvider,
  expectEventSequence,
  assertExactEventSequence,
} from 'confused-ai/test';
import { GraphEventType } from 'confused-ai/graph';

const runner = createTestRunner({ maxConcurrency: 2 });

const result = await runner.run(graph, { url: 'https://example.com' });

// result is a GraphTestResult — extends ExecutionResult with extra fields
console.log(result.status);       // 'completed'
console.log(result.eventTypes);   // [GraphEventType.EXECUTION_STARTED, GraphEventType.NODE_STARTED, ...]
console.log(result.storedEvents); // all events written to the in-memory store
console.log(result.eventStore);   // the InMemoryEventStore used for this run

// Assert that specific event types appeared in order (allows gaps)
expectEventSequence(result.eventTypes, [
  GraphEventType.EXECUTION_STARTED,
  GraphEventType.NODE_COMPLETED,
  GraphEventType.EXECUTION_COMPLETED,
]);

// Assert exact event sequence (no extra events allowed)
assertExactEventSequence(result.eventTypes, [
  GraphEventType.EXECUTION_STARTED,
  GraphEventType.NODE_STARTED,
  GraphEventType.NODE_COMPLETED,
  GraphEventType.EXECUTION_COMPLETED,
]);
```

### Mock LLM provider for agent nodes

```ts
import { createMockLLMProvider } from 'confused-ai/test';

const llm = createMockLLMProvider('test-llm', [
  { content: 'First response' },
  { content: 'Second response', toolCalls: [{ id: 'tc1', name: 'search', arguments: { q: 'test' } }] },
]);

// Responses are consumed in order — useful for deterministic graph tests
```

### Test utilities reference

| Export | Description |
|--------|-------------|
| `createTestRunner(opts?)` | Returns a `TestRunner` with an isolated `InMemoryEventStore` |
| `createMockLLMProvider(name, responses)` | `LLMProvider` that replays a pre-set response queue |
| `expectEventSequence(actual, expected)` | Asserts event types appear in order (allows gaps) |
| `assertExactEventSequence(actual, expected)` | Asserts exact event type sequence (no extras) |

---

## CLI commands for graph runs

After executing a graph with `DurableExecutor` (using a `SqliteEventStore`), use the built-in CLI commands to inspect, replay, export, and compare runs:

### `confused-ai replay`

Stream the event timeline for a past run in chronological order:

```bash
confused-ai replay --run-id <executionId> [--db ./graph-events.db] [--json] [--from <seq>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--run-id` | required | Execution ID to replay |
| `--db` | `./agent.db` | Path to the SQLite event store |
| `--json` | `false` | Output raw events as JSON |
| `--from` | `0` | Start from this sequence number |

### `confused-ai inspect`

Print a per-node execution summary — status, retry count, duration, and errors:

```bash
confused-ai inspect --run-id <executionId> [--db ./graph-events.db]
```

```
Run:    exec-abc-123
Status: COMPLETED
Events: 12  (2026-04-27T10:00:00Z → 2026-04-27T10:00:03Z)

NODE ID          STATUS       TRIES  DURATION  ERROR
─────────────────────────────────────────────────────
✓ fetch          completed    1      245ms
✗ analyze        failed       3      1200ms    Connection timeout
○ publish        skipped      0      -
```

### `confused-ai export`

Export all events for a run to a JSON file or stdout:

```bash
confused-ai export --run-id <executionId> [--db ./graph-events.db] [--out events.json] [--pretty]
```

### `confused-ai diff`

Compare two runs node-by-node — useful for regression analysis after code changes:

```bash
confused-ai diff --run-id-a <baselineId> --run-id-b <newId> [--db ./graph-events.db]
```

```
Run A: exec-abc  (10 events, 245ms)
Run B: exec-xyz  (11 events, 420ms)
Duration delta: +175ms

NODE ID    RUN A STATUS  RUN B STATUS  DIFF  DUR A   DUR B   Δ DUR
───────────────────────────────────────────────────────────────────
! analyze  completed     failed        ≠     245ms   420ms   +175ms
  fetch    completed     completed     =     50ms    48ms    -2ms

1 node compared — 1 divergent
```

Exits with code `1` if any nodes diverged (CI-friendly).
