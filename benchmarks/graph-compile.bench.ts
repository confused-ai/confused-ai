/**
 * Benchmark: graph compilation time
 *
 * Target: < 5ms for a 100-node graph — per the AgentFlow spec.
 *
 * Run:
 *   bun bench benchmarks/graph-compile.bench.ts
 */

import { bench, describe } from 'vitest';
import { createGraph, computeWaves } from '../src/graph/index.js';

describe('GraphBuilder.build() compilation', () => {
  bench('10-node linear graph', () => {
    const b = createGraph('compile-10');
    for (let i = 0; i < 10; i++) {
      b.addNode(`n${i}`, { kind: 'task', execute: async () => i });
      if (i > 0) b.addEdge(`n${i - 1}`, `n${i}`);
    }
    b.build();
  });

  bench('100-node linear graph', () => {
    const b = createGraph('compile-100');
    for (let i = 0; i < 100; i++) {
      b.addNode(`n${i}`, { kind: 'task', execute: async () => i });
      if (i > 0) b.addEdge(`n${i - 1}`, `n${i}`);
    }
    b.build(); // Target: < 5ms
  });

  bench('100-node wide fan-out graph', () => {
    const b = createGraph('fanout-100');
    b.addNode('start', { kind: 'start' });
    for (let i = 0; i < 99; i++) {
      b.addNode(`w${i}`, { kind: 'task', execute: async () => i });
      b.addEdge('start', `w${i}`);
    }
    b.build();
  });
});

describe('computeWaves()', () => {
  const graph10 = (() => {
    const b = createGraph('waves-10');
    for (let i = 0; i < 10; i++) {
      b.addNode(`n${i}`, { kind: 'task', execute: async () => i });
      if (i > 0) b.addEdge(`n${i - 1}`, `n${i}`);
    }
    return b.build();
  })();

  const graph100 = (() => {
    const b = createGraph('waves-100');
    for (let i = 0; i < 100; i++) {
      b.addNode(`n${i}`, { kind: 'task', execute: async () => i });
      if (i > 0) b.addEdge(`n${i - 1}`, `n${i}`);
    }
    return b.build();
  })();

  bench('computeWaves — 10 nodes', () => {
    computeWaves(graph10);
  });

  bench('computeWaves — 100 nodes', () => {
    computeWaves(graph100); // Target: < 1ms
  });
});
