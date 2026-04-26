/**
 * Benchmark: InMemoryEventStore write throughput
 *
 * Target: > 5,000 events/sec — per the AgentFlow spec.
 *
 * Run:
 *   bun bench benchmarks/event-store.bench.ts
 */

import { bench, describe } from 'vitest';
import { InMemoryEventStore, GraphEventType } from '../src/graph/index.js';
import type { GraphEvent } from '../src/graph/types.js';

function makeEvent(seq: number): GraphEvent {
  return {
    id: `ev_${seq}`,
    type: GraphEventType.NODE_COMPLETED,
    executionId: 'bench_run' as any,
    graphId: 'bench_graph' as any,
    timestamp: Date.now(),
    sequence: seq,
    nodeId: `n${seq % 10}` as any,
    data: { durationMs: 5 },
  };
}

const BATCH_100  = Array.from({ length: 100  }, (_, i) => makeEvent(i));
const BATCH_1000 = Array.from({ length: 1000 }, (_, i) => makeEvent(i));

describe('InMemoryEventStore throughput', () => {
  bench('append 100 events (single batch)', async () => {
    const store = new InMemoryEventStore();
    await store.append(BATCH_100);
  });

  bench('append 1,000 events (single batch)', async () => {
    const store = new InMemoryEventStore();
    await store.append(BATCH_1000);
  });

  bench('append 1,000 events (one-by-one)', async () => {
    const store = new InMemoryEventStore();
    for (const ev of BATCH_1000) {
      await store.append([ev]);
    }
    // Target: 1000 events in < 200ms → > 5,000 events/sec
  });

  bench('load 1,000 events', async () => {
    const store = new InMemoryEventStore();
    await store.append(BATCH_1000);
    await store.load('bench_run' as any);
  });
});
