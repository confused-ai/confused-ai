/**
 * Observability and telemetry types and interfaces
 */

import type { EntityId } from '../core/types.js';
import type { AgentState } from '../core/types.js';
import type { TaskStatus } from '@confused-ai/planner';

/**
 * Log levels
 */
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    FATAL = 'fatal',
}

/**
 * Log entry
 */
export interface LogEntry {
    readonly id: EntityId;
    readonly timestamp: Date;
    readonly level: LogLevel;
    readonly message: string;
    readonly source: string;
    readonly context: LogContext;
    readonly metadata?: Record<string, unknown>;
}

/**
 * Log context
 */
export interface LogContext {
    readonly agentId?: EntityId;
    readonly taskId?: EntityId;
    readonly planId?: EntityId;
    readonly executionId?: EntityId;
    readonly sessionId?: string;
    readonly traceId?: string;
    readonly spanId?: string;
    readonly parentSpanId?: string;
}

/**
 * Logger interface
 */
export interface Logger {
    /**
     * Log a debug message
     */
    debug(message: string, context?: Partial<LogContext>, metadata?: Record<string, unknown>): void;

    /**
     * Log an info message
     */
    info(message: string, context?: Partial<LogContext>, metadata?: Record<string, unknown>): void;

    /**
     * Log a warning message
     */
    warn(message: string, context?: Partial<LogContext>, metadata?: Record<string, unknown>): void;

    /**
     * Log an error message
     */
    error(message: string, context?: Partial<LogContext>, metadata?: Record<string, unknown>): void;

    /**
     * Log a fatal message
     */
    fatal(message: string, context?: Partial<LogContext>, metadata?: Record<string, unknown>): void;

    /**
     * Create a child logger with additional context
     */
    child(additionalContext: Partial<LogContext>): Logger;
}

/**
 * Log transport for outputting logs
 */
export interface LogTransport {
    /**
     * Write a log entry
     */
    write(entry: LogEntry): Promise<void>;

    /**
     * Flush any buffered logs
     */
    flush(): Promise<void>;
}

/**
 * Trace span representing an operation
 */
export interface TraceSpan {
    readonly id: EntityId;
    readonly traceId: string;
    readonly parentId?: EntityId;
    readonly name: string;
    readonly startTime: Date;
    readonly endTime?: Date;
    readonly status: SpanStatus;
    readonly attributes: Record<string, unknown>;
    readonly events: SpanEvent[];
}

/**
 * Span status
 */
export enum SpanStatus {
    OK = 'ok',
    ERROR = 'error',
    UNSET = 'unset',
}

/**
 * Span event
 */
export interface SpanEvent {
    readonly timestamp: Date;
    readonly name: string;
    readonly attributes?: Record<string, unknown>;
}

/**
 * Tracer interface for distributed tracing
 */
export interface Tracer {
    /**
     * Start a new span
     */
    startSpan(name: string, parentId?: EntityId): TraceSpan;

    /**
     * End a span
     */
    endSpan(spanId: EntityId, status?: SpanStatus): void;

    /**
     * Add an event to a span
     */
    addEvent(spanId: EntityId, event: Omit<SpanEvent, 'timestamp'>): void;

    /**
     * Set span attributes
     */
    setAttributes(spanId: EntityId, attributes: Record<string, unknown>): void;

    /**
     * Get a span by ID
     */
    getSpan(spanId: EntityId): TraceSpan | undefined;

    /**
     * Get the current active span
     */
    getCurrentSpan(): TraceSpan | undefined;

    /**
     * Get all spans for a trace
     */
    getTrace(traceId: string): TraceSpan[];
}

/**
 * Metric types
 */
export enum MetricType {
    COUNTER = 'counter',
    GAUGE = 'gauge',
    HISTOGRAM = 'histogram',
    SUMMARY = 'summary',
}

/**
 * Metric value
 */
export interface MetricValue {
    readonly name: string;
    readonly type: MetricType;
    readonly value: number;
    readonly labels: Record<string, string>;
    readonly timestamp: Date;
}

/**
 * Metrics collector
 */
export interface MetricsCollector {
    /**
     * Record a counter metric
     */
    counter(name: string, value?: number, labels?: Record<string, string>): void;

    /**
     * Record a gauge metric
     */
    gauge(name: string, value: number, labels?: Record<string, string>): void;

    /**
     * Record a histogram metric
     */
    histogram(name: string, value: number, labels?: Record<string, string>): void;

    /**
     * Get all recorded metrics
     */
    getMetrics(): MetricValue[];

    /**
     * Clear all metrics
     */
    clear(): void;
}

/**
 * Agent event for telemetry
 */
export interface AgentEvent {
    readonly timestamp: Date;
    readonly agentId: EntityId;
    readonly eventType: AgentEventType;
    readonly previousState?: AgentState;
    readonly currentState?: AgentState;
    readonly metadata?: Record<string, unknown>;
}

/**
 * Agent event types
 */
export enum AgentEventType {
    CREATED = 'created',
    STARTED = 'started',
    STATE_CHANGED = 'state_changed',
    COMPLETED = 'completed',
    FAILED = 'failed',
    DESTROYED = 'destroyed',
}

/**
 * Task event for telemetry
 */
export interface TaskEvent {
    readonly timestamp: Date;
    readonly taskId: EntityId;
    readonly agentId: EntityId;
    readonly eventType: TaskEventType;
    readonly previousStatus?: TaskStatus;
    readonly currentStatus?: TaskStatus;
    readonly executionTimeMs?: number;
    readonly metadata?: Record<string, unknown>;
}

/**
 * Task event types
 */
export enum TaskEventType {
    CREATED = 'created',
    STARTED = 'started',
    STATUS_CHANGED = 'status_changed',
    COMPLETED = 'completed',
    FAILED = 'failed',
    RETRYING = 'retrying',
    CANCELLED = 'cancelled',
}

/**
 * Telemetry collector interface
 */
export interface TelemetryCollector {
    /**
     * Record an agent event
     */
    recordAgentEvent(event: Omit<AgentEvent, 'timestamp'>): void;

    /**
     * Record a task event
     */
    recordTaskEvent(event: Omit<TaskEvent, 'timestamp'>): void;

    /**
     * Get agent events
     */
    getAgentEvents(agentId?: EntityId): AgentEvent[];

    /**
     * Get task events
     */
    getTaskEvents(taskId?: EntityId): TaskEvent[];

    /**
     * Get agent statistics
     */
    getAgentStats(agentId: EntityId): AgentStats;

    /**
     * Export telemetry data
     */
    export(format: ExportFormat): string;
}

/**
 * Agent statistics
 */
export interface AgentStats {
    readonly agentId: EntityId;
    readonly totalExecutions: number;
    readonly successfulExecutions: number;
    readonly failedExecutions: number;
    readonly averageExecutionTimeMs: number;
    readonly totalTokensUsed: number;
    readonly totalCost: number;
    readonly lastExecutionAt?: Date;
}

/**
 * Export formats
 */
export enum ExportFormat {
    JSON = 'json',
    CSV = 'csv',
    OTLP = 'otlp',
}

/**
 * Observability configuration
 */
export interface ObservabilityConfig {
    readonly logLevel: LogLevel;
    readonly enableTracing: boolean;
    readonly enableMetrics: boolean;
    readonly enableTelemetry: boolean;
    readonly samplingRate: number;
    readonly transports: LogTransport[];
    readonly exportIntervalMs?: number;
}