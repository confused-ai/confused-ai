# Graph Engine

The graph engine executes complex, stateful multi-agent workflows as a **directed acyclic graph (DAG)**. It provides topological execution ordering, parallel node execution, event sourcing with deterministic replay, suspend/resume, and a distributed worker model.

## Quick start

```ts
import { createGraph, DAGEngine, NodeKind } from 'fluxion/graph';
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
| `AGENT` | Runs a fluxion agent via `AgentNodeConfig` |
| `WAIT` | Suspends execution until `.resume()` is called |
| `START` | Entry point (auto-created by `createGraph`) |
| `END` | Terminal node (auto-created by `createGraph`) |

## Parallel fan-out and join

```ts
import { createGraph, DAGEngine, NodeKind } from 'fluxion/graph';

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

Wire a fluxion agent directly into the graph:

```ts
import { createGraph, DAGEngine, NodeKind } from 'fluxion/graph';
import { createAgent } from 'fluxion';

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
import { InMemoryEventStore, SqliteEventStore, replayState } from 'fluxion/graph';

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
} from 'fluxion/graph';

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

| Plugin | Key config |
|--------|-----------|
| `TelemetryPlugin` | `endpoint?: string` — OTLP HTTP endpoint |
| `LoggingPlugin` | `level: 'debug' \| 'info' \| 'warn' \| 'error'` |
| `AuditPlugin` | `store: AuditStore` |
| `RateLimitPlugin` | `maxConcurrent?: number`, `maxPerMinute?: number` |
| `OpenTelemetryPlugin` | `tracer?: Tracer` — bring your own OTel tracer |

## Distributed execution

For high-throughput workloads, distribute node execution across multiple workers:

```ts
import { DistributedEngine, InMemoryTaskQueue, RedisTaskQueue, GraphWorker } from 'fluxion/graph';

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
import { MultiAgentOrchestrator, agentNode } from 'fluxion/graph';
import { createAgent } from 'fluxion';

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
| `InMemoryEventStore` | `fluxion/graph` | Dev/test — events lost on restart |
| `SqliteEventStore` | `fluxion/graph` | Durable default; `SqliteEventStore.create(path)` |
