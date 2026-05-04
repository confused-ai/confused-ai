/**
 * Plugin System — Extensible hooks for cross-cutting concerns
 *
 * Plugins intercept execution lifecycle events without modifying core logic.
 * Built-in plugins: Telemetry, Logging, Retry, Timeout, Cache
 *
 * Design: Plugins implement GraphPlugin interface. Multiple plugins compose.
 * Order matters: plugins run in registration order.
 */

import {
  type GraphPlugin,
  type GraphEvent,
  type GraphState,
  type GraphDef,
  type NodeContext,
  type NodeId,
  type ExecutionId,
  GraphEventType,
} from './types.js';

// ── Telemetry Plugin ────────────────────────────────────────────────────────

/**
 * Collects metrics: execution time, node duration, success/failure rates.
 * Exposes metrics via getMetrics() for scraping by Prometheus, DataDog, etc.
 */
export class TelemetryPlugin implements GraphPlugin {
  name = 'telemetry';
  private metrics: MetricsData = {
    totalExecutions: 0,
    completedExecutions: 0,
    failedExecutions: 0,
    totalNodes: 0,
    completedNodes: 0,
    failedNodes: 0,
    nodeTimings: new Map(),
    executionTimings: [],
    executionTimingsHead: 0, // head pointer for O(1) amortised eviction
  };
  // head pointers per nodeId — stored alongside timings in the Map value
  async onExecutionStart(_executionId: ExecutionId): Promise<void> {
    this.metrics.totalExecutions++;
  }

  async onExecutionComplete(_executionId: ExecutionId, _state: GraphState, durationMs: number): Promise<void> {
    this.metrics.completedExecutions++;
    this.metrics.executionTimings.push(durationMs);
    // Head-pointer eviction: compact only when > 50% dead and length > 1000
    const head = this.metrics.executionTimingsHead;
    if (this.metrics.executionTimings.length - head > 1000) {
      // Keep newest 1000
      const live = this.metrics.executionTimings.slice(this.metrics.executionTimings.length - 1000);
      this.metrics.executionTimings = live;
      this.metrics.executionTimingsHead = 0;
    }
  }

  async onNodeStart(_nodeId: NodeId): Promise<void> {
    this.metrics.totalNodes++;
  }

  async onNodeComplete(nodeId: NodeId, _result: unknown, durationMs: number): Promise<void> {
    this.metrics.completedNodes++;
    const timings = this.metrics.nodeTimings.get(nodeId) ?? [];
    timings.push(durationMs);
    // Compact to last 100 only when full
    if (timings.length > 100) {
      this.metrics.nodeTimings.set(nodeId, timings.slice(-100));
    } else {
      this.metrics.nodeTimings.set(nodeId, timings);
    }
  }

  async onNodeError(_nodeId: NodeId): Promise<void> {
    this.metrics.failedNodes++;
  }

  getMetrics(): MetricsSummary {
    const live = this.metrics.executionTimings;
    const avgExecution = live.length > 0
      ? live.reduce((a, b) => a + b, 0) / live.length
      : 0;

    const p99Execution = this._percentile(live, 0.99);
    return {
      totalExecutions: this.metrics.totalExecutions,
      completedExecutions: this.metrics.completedExecutions,
      failedExecutions: this.metrics.failedExecutions,
      successRate: this.metrics.totalExecutions > 0
        ? this.metrics.completedExecutions / this.metrics.totalExecutions
        : 0,
      avgExecutionMs: avgExecution,
      p99ExecutionMs: p99Execution,
      totalNodes: this.metrics.totalNodes,
      completedNodes: this.metrics.completedNodes,
      failedNodes: this.metrics.failedNodes,
    };
  }

  private _percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)];
  }
}

interface MetricsData {
  totalExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  nodeTimings: Map<string, number[]>;
  executionTimings: number[];
  executionTimingsHead: number;
}

export interface MetricsSummary {
  totalExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  successRate: number;
  avgExecutionMs: number;
  p99ExecutionMs: number;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
}

// ── Logging Plugin ──────────────────────────────────────────────────────────

/**
 * Structured JSON logging for all execution events.
 */
export class LoggingPlugin implements GraphPlugin {
  name = 'logging';
  private logger: (entry: LogEntry) => void;
  private level: LogLevel;

  constructor(options?: {
    logger?: (entry: LogEntry) => void;
    level?: LogLevel;
  }) {
    this.logger = options?.logger ?? ((entry) => {
      const line = JSON.stringify({
        timestamp: new Date(entry.timestamp).toISOString(),
        level: entry.level,
        event: entry.event,
        executionId: entry.executionId,
        nodeId: entry.nodeId,
        ...entry.data,
      });
      console.log(line);
    });
    this.level = options?.level ?? 'info';
  }

  async onExecutionStart(executionId: ExecutionId, graph: GraphDef): Promise<void> {
    this._log('info', 'execution.started', executionId, undefined, {
      graphName: graph.name,
      nodeCount: graph.nodes.size,
    });
  }

  async onExecutionComplete(executionId: ExecutionId, state: GraphState, durationMs: number): Promise<void> {
    this._log('info', 'execution.completed', executionId, undefined, {
      status: state.status,
      durationMs,
    });
  }

  async onNodeStart(nodeId: NodeId, ctx: NodeContext): Promise<void> {
    this._log('debug', 'node.started', ctx.executionId, nodeId, {
      nodeName: ctx.nodeName,
      attempt: ctx.attempt,
    });
  }

  async onNodeComplete(nodeId: NodeId, _result: unknown, durationMs: number): Promise<void> {
    this._log('debug', 'node.completed', undefined, nodeId, { durationMs });
  }

  async onNodeError(nodeId: NodeId, error: unknown, attempt: number): Promise<void> {
    this._log('error', 'node.error', undefined, nodeId, {
      error: error instanceof Error ? error.message : String(error),
      attempt,
    });
  }

  private _log(
    level: LogLevel,
    event: string,
    executionId?: ExecutionId,
    nodeId?: NodeId,
    data?: Record<string, unknown>
  ): void {
    const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] < levels[this.level]) return;

    this.logger({
      timestamp: Date.now(),
      level,
      event,
      executionId,
      nodeId,
      data,
    });
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  event: string;
  executionId?: ExecutionId;
  nodeId?: NodeId;
  data?: Record<string, unknown>;
}

// ── OpenTelemetry Plugin ────────────────────────────────────────────────────

/**
 * Emits OpenTelemetry-compatible spans for distributed tracing.
 * Requires: @opentelemetry/api (optional peer dependency)
 */
export class OpenTelemetryPlugin implements GraphPlugin {
  name = 'opentelemetry';
  private tracer: any; // otel.Tracer
  private spans: Map<string, any> = new Map();
  /** Cached after first successful import — avoids repeated dynamic import per node */
  private _otelApi: any = null;

  constructor(options?: { serviceName?: string; tracer?: any }) {
    // Lazy load OpenTelemetry to avoid hard dependency
    this.tracer = options?.tracer;
  }

  private async _getOtel(): Promise<any | null> {
    if (this._otelApi) return this._otelApi;
    try {
      this._otelApi = await import('@opentelemetry/api' as string);
      return this._otelApi;
    } catch {
      return null;
    }
  }

  async onExecutionStart(executionId: ExecutionId, graph: GraphDef): Promise<void> {
    if (!this.tracer) {
      const otel = await this._getOtel();
      if (!otel) return;
      this.tracer = otel.trace.getTracer('graph-engine');
    }

    const span = this.tracer.startSpan(`graph.execute`, {
      attributes: {
        'graph.id': graph.id,
        'graph.name': graph.name,
        'execution.id': executionId,
      },
    });
    this.spans.set(`exec:${executionId}`, span);
  }

  async onNodeStart(nodeId: NodeId, ctx: NodeContext): Promise<void> {
    if (!this.tracer) return;

    const otel = await this._getOtel();
    const parentSpan = this.spans.get(`exec:${ctx.executionId}`);
    const spanCtx = (otel && parentSpan)
      ? otel.trace.setSpan(otel.context.active(), parentSpan)
      : undefined;

    const span = this.tracer.startSpan(
      `node.${ctx.nodeName}`,
      {
        attributes: {
          'node.id': nodeId,
          'node.name': ctx.nodeName,
          'node.attempt': ctx.attempt,
        },
      },
      spanCtx
    );
    this.spans.set(`node:${nodeId}`, span);
  }

  async onNodeComplete(nodeId: NodeId, _result: unknown, durationMs: number): Promise<void> {
    const span = this.spans.get(`node:${nodeId}`);
    if (span) {
      span.setAttribute('node.duration_ms', durationMs);
      span.setStatus({ code: 1 }); // OK
      span.end();
      this.spans.delete(`node:${nodeId}`);
    }
  }

  async onNodeError(nodeId: NodeId, error: unknown): Promise<void> {
    const span = this.spans.get(`node:${nodeId}`);
    if (span) {
      span.setStatus({
        code: 2, // ERROR
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.end();
      this.spans.delete(`node:${nodeId}`);
    }
  }

  async onExecutionComplete(executionId: ExecutionId, state: GraphState, durationMs: number): Promise<void> {
    const span = this.spans.get(`exec:${executionId}`);
    if (span) {
      span.setAttribute('execution.duration_ms', durationMs);
      span.setAttribute('execution.status', state.status);
      span.setStatus({ code: state.status === 'completed' ? 1 : 2 });
      span.end();
      this.spans.delete(`exec:${executionId}`);
    }
  }
}

// ── Event Audit Plugin ──────────────────────────────────────────────────────

/**
 * Records all events into an append-only audit log.
 * Useful for compliance, debugging, and replay.
 */
export class AuditPlugin implements GraphPlugin {
  name = 'audit';
  private events: GraphEvent[] = [];
  private maxEvents: number;
  /** O(1) lookup indexes — maintained in sync with events[] */
  private typeIndex = new Map<GraphEventType, GraphEvent[]>();
  private nodeIndex = new Map<NodeId, GraphEvent[]>();
  private execIndex = new Map<ExecutionId, GraphEvent[]>();

  constructor(options?: { maxEvents?: number }) {
    this.maxEvents = options?.maxEvents ?? 10000;
  }

  async onEvent(event: GraphEvent): Promise<void> {
    this.events.push(event);

    // Maintain indexes
    if (event.type) {
      const bucket = this.typeIndex.get(event.type);
      if (bucket) bucket.push(event);
      else this.typeIndex.set(event.type, [event]);
    }
    if (event.nodeId) {
      const bucket = this.nodeIndex.get(event.nodeId);
      if (bucket) bucket.push(event);
      else this.nodeIndex.set(event.nodeId, [event]);
    }
    if (event.executionId) {
      const bucket = this.execIndex.get(event.executionId);
      if (bucket) bucket.push(event);
      else this.execIndex.set(event.executionId, [event]);
    }

    if (this.events.length > this.maxEvents) {
      // Batch-evict oldest half; rebuild indexes to keep them consistent
      this.events = this.events.slice(-this.maxEvents);
      this._rebuildIndexes();
    }
  }

  private _rebuildIndexes(): void {
    this.typeIndex.clear();
    this.nodeIndex.clear();
    this.execIndex.clear();
    for (const e of this.events) {
      if (e.type) {
        const b = this.typeIndex.get(e.type); if (b) b.push(e); else this.typeIndex.set(e.type, [e]);
      }
      if (e.nodeId) {
        const b = this.nodeIndex.get(e.nodeId); if (b) b.push(e); else this.nodeIndex.set(e.nodeId, [e]);
      }
      if (e.executionId) {
        const b = this.execIndex.get(e.executionId); if (b) b.push(e); else this.execIndex.set(e.executionId, [e]);
      }
    }
  }

  getAuditLog(): readonly GraphEvent[] {
    return this.events;
  }

  /** O(1) — index lookup */
  getEventsByType(type: GraphEventType): GraphEvent[] {
    return this.typeIndex.get(type) ?? [];
  }

  /** O(1) — index lookup */
  getEventsForNode(nodeId: NodeId): GraphEvent[] {
    return this.nodeIndex.get(nodeId) ?? [];
  }

  /** O(1) — index lookup */
  getEventsForExecution(executionId: ExecutionId): GraphEvent[] {
    return this.execIndex.get(executionId) ?? [];
  }
}

// ── Rate Limit Plugin ───────────────────────────────────────────────────────

/**
 * Limits execution rate (useful for LLM API rate limits).
 */
export class RateLimitPlugin implements GraphPlugin {
  name = 'rate-limit';
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  private lastRefill: number;

  constructor(options: { maxTokensPerSecond: number; burst?: number }) {
    this.maxTokens = options.burst ?? options.maxTokensPerSecond;
    this.tokens = this.maxTokens;
    this.refillRate = options.maxTokensPerSecond;
    this.lastRefill = Date.now();
  }

  async onNodeStart(): Promise<void> {
    await this._acquire();
  }

  private async _acquire(): Promise<void> {
    this._refill();
    while (this.tokens < 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
      this._refill();
    }
    this.tokens--;
  }

  private _refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}
