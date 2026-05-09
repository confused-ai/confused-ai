---
title: Graph / DAG Engine
description: Build and execute directed acyclic graphs of agent nodes with durable execution, event replay, and backpressure.
outline: [2, 3]
---

# Graph / DAG Engine

`@confused-ai/graph` is a production DAG execution engine for complex agent workflows. Features include durable execution, event store, wave scheduling, and backpressure control.

## Build a graph

```ts
import { createGraph, NodeKind } from 'confused-ai/graph';

const graph = createGraph({
  nodes: [
    { id: 'fetch',    kind: NodeKind.Agent, config: { agent: fetchAgent } },
    { id: 'analyse',  kind: NodeKind.Agent, config: { agent: analyseAgent } },
    { id: 'report',   kind: NodeKind.Agent, config: { agent: reportAgent } },
    { id: 'notify',   kind: NodeKind.Agent, config: { agent: notifyAgent } },
  ],
  edges: [
    { from: 'fetch',   to: 'analyse' },
    { from: 'analyse', to: 'report' },
    { from: 'analyse', to: 'notify' },  // parallel branch
  ],
});
```

## Execute the graph

```ts
import { DAGEngine } from 'confused-ai/graph';

const engine = new DAGEngine(graph);
const result = await engine.run({ input: 'Analyse Q3 sales data' });

console.log(result.outputs);   // per-node outputs
console.log(result.status);    // 'completed' | 'failed' | 'partial'
```

## Durable execution (resume after crash)

```ts
import { DurableExecutor } from 'confused-ai/graph';
import { InMemoryEventStore } from 'confused-ai/graph';

const eventStore = new InMemoryEventStore();
const executor = new DurableExecutor(graph, eventStore);

// Start a new run
const executionId = await executor.run({ input: '...' });

// If process crashes, resume from last checkpoint
const result = await executor.resume(executionId);
// Completed nodes are skipped; in-flight nodes restart from the beginning
```

## Wave scheduling (topological levels)

```ts
import { computeWaves } from 'confused-ai/graph';

// Returns nodes grouped by execution level
const waves = computeWaves(graph);
// wave[0]: ['fetch']           — runs first
// wave[1]: ['analyse']         — runs after fetch
// wave[2]: ['report', 'notify'] — run in parallel after analyse
```

## Backpressure

Limit how many nodes execute concurrently:

```ts
import { BackpressureController } from 'confused-ai/graph';

const bp = new BackpressureController({ maxConcurrent: 4 });

await bp.acquire();
try {
  await executeNode(node);
} finally {
  bp.release();
}

console.log(bp.inflight);    // currently executing
console.log(bp.queueDepth);  // waiting for slot
```

## Node types

| NodeKind | Description |
|---|---|
| `Agent` | Runs an agent with the current state as input |
| `Tool` | Calls a tool directly |
| `Router` | Chooses a branch based on LLM or rule output |
| `Parallel` | Runs multiple sub-graphs concurrently |
| `Wait` | Pauses until a signal is received |
| `Transform` | Pure function — transform state without LLM |

## Router node (conditional branching)

```ts
const graph = createGraph({
  nodes: [
    {
      id: 'classify',
      kind: NodeKind.Router,
      config: {
        agent: classifyAgent,
        routes: {
          'billing':   'billing-node',
          'technical': 'tech-node',
          'general':   'general-node',
        },
      },
    },
    { id: 'billing-node', kind: NodeKind.Agent, config: { agent: billingAgent } },
    { id: 'tech-node',    kind: NodeKind.Agent, config: { agent: techAgent } },
    { id: 'general-node', kind: NodeKind.Agent, config: { agent: generalAgent } },
  ],
  edges: [
    { from: 'classify', to: 'billing-node' },
    { from: 'classify', to: 'tech-node' },
    { from: 'classify', to: 'general-node' },
  ],
});
```

## Event store (replay and audit)

```ts
import { InMemoryEventStore } from 'confused-ai/graph';

const store = new InMemoryEventStore();

// Events are appended automatically during execution
await executor.run({ input: '...' });

// Load all events for an execution
const events = await store.load(executionId);

// Load events after a sequence number (for incremental replay)
const recent = await store.loadAfter(executionId, lastSeqNo);
```

## Graph plugins

Attach cross-cutting concerns to every node execution:

```ts
import { AuditPlugin, OpenTelemetryPlugin } from 'confused-ai/graph';

const graph = createGraph({
  nodes: [...],
  edges: [...],
  plugins: [
    new AuditPlugin({ store: auditLog }),
    new OpenTelemetryPlugin({ tracer }),
  ],
});
```

## CLI commands

```bash
# Replay a durable execution (debug)
npx confused-ai replay --run-id <executionId>

# Inspect execution state
npx confused-ai inspect --run-id <executionId>

# Export execution events to JSON
npx confused-ai export --run-id <executionId> --output events.json

# Diff two executions
npx confused-ai diff --run-id-a <id1> --run-id-b <id2>
```
