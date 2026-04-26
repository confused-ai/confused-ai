/**
 * Graph Test Runner — first-class testing utilities for the graph engine.
 *
 * Exports:
 *   createTestRunner()          — run a graph with an embedded event store
 *   createMockLLMProvider()     — LLMProvider that drains a canned-response queue
 *   expectEventSequence()       — assert an event type is present (subsequence)
 *   assertExactEventSequence()  — assert exact ordered event type list
 */

import {
  DAGEngine,
  InMemoryEventStore,
  GraphEventType,
  type GraphDef,
  type ExecutionResult,
  type LLMProvider,
  type LLMMessage,
  type LLMResponse,
} from '../graph/index.js';
import type { GraphEvent } from '../graph/types.js';

// ── Mock LLM ────────────────────────────────────────────────────────────────

export interface MockLLMResponse {
  content: string;
  /**
   * Optional tool calls. When present, the provider signals `finishReason: 'tool_calls'`.
   */
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

/**
 * Create a mock LLM provider that returns canned responses in sequence.
 *
 * The response queue is drained one entry per call. When exhausted, the
 * last entry is repeated indefinitely — making it safe to call more times
 * than there are canned responses.
 *
 * @example
 *   const llm = createMockLLMProvider('gpt-4o', [
 *     { content: 'Step 1 answer' },
 *     { content: 'Final answer' },
 *   ]);
 */
export function createMockLLMProvider(
  name: string,
  responses: MockLLMResponse[],
): LLMProvider {
  if (responses.length === 0) {
    throw new Error(`createMockLLMProvider("${name}"): responses array must not be empty`);
  }
  let index = 0;
  return {
    name,
    async generate(_messages: LLMMessage[]): Promise<LLMResponse> {
      const response = responses[Math.min(index, responses.length - 1)];
      index++;
      return {
        content: response.content,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: response.toolCalls?.length ? 'tool_calls' : 'stop',
      };
    },
  };
}

// ── Test Runner ─────────────────────────────────────────────────────────────

export interface TestRunnerOptions {
  /** Override the graph's maxConcurrency for tests. */
  maxConcurrency?: number;
}

/** Result returned by TestRunner.run(), enriched with event introspection helpers. */
export interface GraphTestResult extends ExecutionResult {
  /** Ordered list of event types emitted during the run (from the event store). */
  eventTypes: GraphEventType[];
  /** Full event objects stored in the embedded InMemoryEventStore. */
  storedEvents: GraphEvent[];
  /** The event store instance — for custom low-level assertions. */
  eventStore: InMemoryEventStore;
}

export interface TestRunner {
  /**
   * Run a graph with an embedded InMemoryEventStore.
   *
   * @param graph        — the GraphDef produced by GraphBuilder.build()
   * @param initialState — optional initial variables injected into the run
   */
  run<S extends Record<string, unknown>>(
    graph: GraphDef,
    initialState?: Partial<S>,
  ): Promise<GraphTestResult>;
}

/**
 * Create a reusable test runner that wraps DAGEngine with an in-process
 * event store for event sequence assertions.
 *
 * @example
 *   const runner = createTestRunner();
 *   const result = await runner.run(myGraph, { userId: 'u1' });
 *
 *   expect(result.status).toBe(ExecutionStatus.COMPLETED);
 *   expectEventSequence(result.eventTypes, [
 *     GraphEventType.EXECUTION_STARTED,
 *     GraphEventType.NODE_STARTED,
 *     GraphEventType.NODE_COMPLETED,
 *     GraphEventType.EXECUTION_COMPLETED,
 *   ]);
 */
export function createTestRunner(options?: TestRunnerOptions): TestRunner {
  return {
    async run(graph, initialState) {
      const eventStore = new InMemoryEventStore();
      const engine = new DAGEngine(graph);

      const result = await engine.execute({
        eventStore,
        variables: (initialState as Record<string, unknown>) ?? {},
        maxConcurrency: options?.maxConcurrency,
      });

      const storedEvents = await eventStore.load(result.executionId);

      return {
        ...result,
        eventTypes: storedEvents.map(e => e.type),
        storedEvents,
        eventStore,
      };
    },
  };
}

// ── Assertion Helpers ────────────────────────────────────────────────────────

/**
 * Assert that `actual` contains every type in `expected` as an in-order
 * subsequence (extra events between expected items are allowed).
 *
 * @throws if any expected event type is missing or out of order.
 *
 * @example
 *   expectEventSequence(result.eventTypes, [
 *     GraphEventType.EXECUTION_STARTED,
 *     GraphEventType.NODE_COMPLETED,
 *     GraphEventType.EXECUTION_COMPLETED,
 *   ]);
 */
export function expectEventSequence(
  actual: Array<GraphEventType | string>,
  expected: Array<GraphEventType | string>,
): void {
  let ei = 0;
  for (const type of actual) {
    if (ei >= expected.length) break;
    if (type === expected[ei]) ei++;
  }
  if (ei < expected.length) {
    throw new Error(
      `expectEventSequence: could not find "${expected[ei]}" in event stream.\n` +
      `Expected subsequence: [${expected.join(', ')}]\n` +
      `Actual sequence:      [${actual.join(', ')}]`,
    );
  }
}

/**
 * Assert that the event type sequence matches exactly — same length, same
 * order, no extras permitted.
 *
 * @throws if lengths differ or any event type mismatches.
 */
export function assertExactEventSequence(
  actual: Array<GraphEventType | string>,
  expected: Array<GraphEventType | string>,
): void {
  if (actual.length !== expected.length) {
    throw new Error(
      `assertExactEventSequence: length mismatch — expected ${expected.length}, got ${actual.length}.\n` +
      `Expected: [${expected.join(', ')}]\n` +
      `Actual:   [${actual.join(', ')}]`,
    );
  }
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        `assertExactEventSequence: mismatch at index ${i} — expected "${expected[i]}", got "${actual[i]}".\n` +
        `Expected: [${expected.join(', ')}]\n` +
        `Actual:   [${actual.join(', ')}]`,
      );
    }
  }
}
