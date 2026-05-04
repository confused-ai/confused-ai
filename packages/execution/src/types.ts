/**
 * Execution engine types and interfaces
 */

import type { EntityId } from '@confused-ai/core';
import type { Task, TaskResult, Plan, PlanExecutionResult } from '@confused-ai/planner';

/**
 * Execution engine configuration
 */
export interface ExecutionEngineConfig {
    readonly maxConcurrency: number;
    readonly defaultTimeoutMs: number;
    readonly enableParallelExecution: boolean;
    readonly workerPoolSize?: number;
    readonly retryPolicy?: ExecutionRetryPolicy;
}

/**
 * Execution retry policy
 */
export interface ExecutionRetryPolicy {
    readonly maxRetries: number;
    readonly backoffStrategy: BackoffStrategy;
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
}

/**
 * Backoff strategies
 */
export enum BackoffStrategy {
    FIXED = 'fixed',
    LINEAR = 'linear',
    EXPONENTIAL = 'exponential',
}

/**
 * Execution context passed to tasks
 */
export interface ExecutionContext {
    readonly executionId: EntityId;
    readonly taskId: EntityId;
    readonly planId: EntityId;
    readonly inputs: Map<EntityId, unknown>;
    readonly sharedState: Map<string, unknown>;
    readonly metadata: TaskExecutionMetadata;
}

/**
 * Task execution metadata
 */
export interface TaskExecutionMetadata {
    readonly startedAt: Date;
    readonly timeoutAt?: Date;
    readonly attemptNumber: number;
    readonly previousAttempts?: TaskResult[];
}

/**
 * Task executor interface
 */
export interface TaskExecutor {
    /**
     * Execute a single task
     */
    execute(task: Task, context: ExecutionContext): Promise<TaskResult>;

    /**
     * Check if this executor can handle the task
     */
    canExecute(task: Task): boolean;
}

/**
 * Execution graph node
 */
export interface ExecutionNode {
    readonly task: Task;
    readonly status: ExecutionNodeStatus;
    readonly dependencies: Set<EntityId>;
    readonly dependents: Set<EntityId>;
    readonly result?: TaskResult;
    readonly startedAt?: Date;
    readonly completedAt?: Date;
}

/**
 * Execution node status
 */
export enum ExecutionNodeStatus {
    PENDING = 'pending',
    READY = 'ready',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

/**
 * Execution graph representing task dependencies
 */
export interface ExecutionGraph {
    readonly planId: EntityId;
    readonly nodes: Map<EntityId, ExecutionNode>;
    readonly readyQueue: EntityId[];
    readonly completedCount: number;
    readonly failedCount: number;
    readonly totalCount: number;
}

/**
 * Execution engine interface
 */
export interface ExecutionEngine {
    /**
     * Execute a plan
     */
    execute(plan: Plan, options?: ExecutionOptions): Promise<PlanExecutionResult>;

    /**
     * Cancel an ongoing execution
     */
    cancel(executionId: EntityId): Promise<boolean>;

    /**
     * Get execution status
     */
    getStatus(executionId: EntityId): ExecutionStatus | undefined;

    /**
     * Register a task executor
     */
    registerExecutor(executor: TaskExecutor): void;

    /**
     * Subscribe to execution events
     */
    on(event: ExecutionEventType, handler: ExecutionEventHandler): void;

    /**
     * Unsubscribe from execution events
     */
    off(event: ExecutionEventType, handler: ExecutionEventHandler): void;
}

/**
 * Execution options
 */
export interface ExecutionOptions {
    readonly executionId?: EntityId;
    readonly timeoutMs?: number;
    readonly onTaskStart?: (taskId: EntityId) => void;
    readonly onTaskComplete?: (taskId: EntityId, result: TaskResult) => void;
    readonly onTaskError?: (taskId: EntityId, error: Error) => void;
}

/**
 * Execution status
 */
export interface ExecutionStatus {
    readonly executionId: EntityId;
    readonly planId: EntityId;
    readonly state: ExecutionState;
    readonly progress: ExecutionProgress;
    readonly currentTasks: EntityId[];
    readonly startedAt: Date;
    readonly estimatedCompletionAt?: Date;
}

/**
 * Execution state
 */
export enum ExecutionState {
    PENDING = 'pending',
    RUNNING = 'running',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

/**
 * Execution progress
 */
export interface ExecutionProgress {
    readonly total: number;
    readonly completed: number;
    readonly failed: number;
    readonly pending: number;
    readonly running: number;
    readonly percentage: number;
}

/**
 * Execution event types
 */
export type ExecutionEventType =
    | 'execution:start'
    | 'execution:complete'
    | 'execution:fail'
    | 'execution:cancel'
    | 'task:start'
    | 'task:complete'
    | 'task:fail'
    | 'task:retry';

/**
 * Execution event handler
 */
export type ExecutionEventHandler = (event: ExecutionEvent) => void;

/**
 * Execution event
 */
export interface ExecutionEvent {
    readonly type: ExecutionEventType;
    readonly executionId: EntityId;
    readonly timestamp: Date;
    readonly data: unknown;
}

/**
 * Worker pool configuration
 */
export interface WorkerPoolConfig {
    readonly minWorkers: number;
    readonly maxWorkers: number;
    readonly idleTimeoutMs: number;
    readonly taskTimeoutMs: number;
}

/**
 * Parallel executor interface
 */
export interface ParallelExecutor {
    /**
     * Execute multiple independent tasks in parallel
     */
    executeParallel(tasks: Task[], context: ExecutionContext): Promise<TaskResult[]>;

    /**
     * Get current pool status
     */
    getPoolStatus(): WorkerPoolStatus;
}

/**
 * Worker pool status
 */
export interface WorkerPoolStatus {
    readonly totalWorkers: number;
    readonly activeWorkers: number;
    readonly idleWorkers: number;
    readonly pendingTasks: number;
    readonly completedTasks: number;
}