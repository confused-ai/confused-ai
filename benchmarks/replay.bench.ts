/**
 * Benchmark: replayState speed
 *
 * Target: > 10,000 events/sec in-memory — per the AgentFlow spec.
 *
 * Run:
 *   bun bench benchmarks/replay.bench.ts
 */

import { bench, describe } from 'vitest';
import { replayState, GraphEventType, createGraph } from '../src/graph/index.js';
import type { GraphEvent } from '../src/graph/types.js';

// Build a reference graph with 100 nodes for the replay test
const builder = createGraph('replay-bench');
for (let i = 0; i < 100; i++) {
  builder.addNode(`n${i}`, { kind: 'task', execute: async () => i });
  if (i > 0) builder.addEdge(`n${i - 1}`, `n${i}`);
}
const graph = builder.build();
const nodeIds = Array.from(graph.nodes.keys());

function makeNodeEvents(
  nodeId: string,
  seqStart: number,
): GraphEvent[] {
  const ts = 1_700_000_000_000 + seqStart * 10;
  return [
    {
      id: `ev_s_${seqStart}`,
      type: GraphEventType.NODE_STARTED,
      executionId: 'r1' as any,
      graphId: graph.id,
      timestamp: ts,
      sequence: seqStart,
      nodeId: nodeId as any,
      data: { attempt: 1 },
    },
    {
      id: `ev_c_${seqStart + 1}`,
      type: GraphEventType.NODE_COMPLETED,
      executionId: 'r1' as any,
      graphId: graph.id,
      timestamp: ts + 5,
      sequence: seqStart + 1,
      nodeId: nodeId as any,
      data: { durationMs: 5 },
    },
  ];
}

// Pre-build event arrays
const executionStarted: GraphEvent = {
  id: 'ev_start',
  type: GraphEventType.EXECUTION_STARTED,
  executionId: 'r1' as any,
  graphId: graph.id,
  timestamp: 1_700_000_000_000,
  sequence: 0,
};

const events100: GraphEvent[] = [executionStarted];
for (let i = 0; i < 100; i++) {
  events100.push(...makeNodeEvents(nodeIds[i], 1 + i * 2));
}
events100.push({
  id: 'ev_end',
  type: GraphEventType.EXECUTION_COMPLETED,
  executionId: 'r1' as any,
  graphId: graph.id,
  timestamp: 1_700_000_002_000,
  sequence: 201,
});

// 10k events: 100 nodes * 100 replay invocations worth of node pairs
const events10k: GraphEvent[] = [executionStarted];
for (let r = 0; r < 50; r++) {
  for (let i = 0; i < 100; i++) {
    const seq = 1 + r * 200 + i * 2;
    events10k.push({
      id: `ev_s_${seq}`,
      type: GraphEventType.NODE_STARTED,
      executionId: 'r1' as any,
      graphId: graph.id,
      timestamp: 1_700_000_000_000 + seq,
      sequence: seq,
      nodeId: nodeIds[i % nodeIds.length] as any,
      data: { attempt: 1 },
    });
    events10k.push({
      id: `ev_c_${seq + 1}`,
      type: GraphEventType.NODE_COMPLETED,
      executionId: 'r1' as any,
      graphId: graph.id,
      timestamp: 1_700_000_000_000 + seq + 5,
      sequence: seq + 1,
      nodeId: nodeIds[i % nodeIds.length] as any,
      data: { durationMs: 5 },
    });
  }
}

describe('replayState throughput', () => {
  bench('replay 202 events (100-node run)', () => {
    replayState(events100, graph);
  });

  bench('replay 10,001 events (stress)', () => {
    replayState(events10k, graph);
    // Target: < 1 second for 10k events → > 10,000 events/sec
  });
});
