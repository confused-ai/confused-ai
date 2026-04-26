/**
 * Benchmark: per-node executor overhead
 *
 * Target: < 1ms per node (no I/O) — per the AgentFlow spec.
 *
 * Run:
 *   bun bench benchmarks/executor.bench.ts
 */

import { bench, describe } from 'vitest';
import { createGraph, DAGEngine } from '../src/graph/index.js';

// Build graphs once — we only want to measure execution overhead, not graph compilation.

const linear10 = createGraph('linear-10');
for (let i = 0; i < 10; i++) {
  linear10.addNode(`n${i}`, { kind: 'task', execute: async () => i });
  if (i > 0) linear10.addEdge(`n${i - 1}`, `n${i}`);
}
const linearGraph = linear10.build();

const parallel10 = createGraph('parallel-10');
parallel10.addNode('start', { kind: 'start' });
for (let i = 0; i < 10; i++) {
  parallel10.addNode(`p${i}`, { kind: 'task', execute: async () => i });
  parallel10.addEdge('start', `p${i}`);
}
const parallelGraph = parallel10.build();

const linear100 = createGraph('linear-100');
for (let i = 0; i < 100; i++) {
  linear100.addNode(`n${i}`, { kind: 'task', execute: async () => i });
  if (i > 0) linear100.addEdge(`n${i - 1}`, `n${i}`);
}
const linear100Graph = linear100.build();

describe('DAGEngine overhead (no I/O)', () => {
  bench('10-node linear graph', async () => {
    const engine = new DAGEngine(linearGraph);
    await engine.execute();
  });

  bench('10-node parallel fan-out', async () => {
    const engine = new DAGEngine(parallelGraph);
    await engine.execute();
  });

  bench('100-node linear graph', async () => {
    const engine = new DAGEngine(linear100Graph);
    await engine.execute();
    // Target: < 100ms total = < 1ms per node
  });
});
