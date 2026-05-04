/**
 * Planner types and interfaces
 */

import type { EntityId } from '@confused-ai/core';

/**
 * Task definition in a plan
 */
export interface Task {
    readonly id: EntityId;
    readonly name: string;
    readonly description: string;
    readonly dependencies: EntityId[];
    readonly estimatedDurationMs?: number;
    readonly priority: TaskPriority;
    readonly metadata: TaskMetadata;
}

/**
 * Task priority levels
 */
export enum TaskPriority {
    CRITICAL = 0,
    HIGH = 1,
    MEDIUM = 2,
    LOW = 3,
}

/**
 * Task metadata
 */
export interface TaskMetadata {
    readonly toolIds?: EntityId[];
    readonly requiredMemory?: string[];
    readonly outputKey?: string;
    readonly maxRetries?: number;
    readonly timeoutMs?: number;
    readonly custom?: Record<string, unknown>;
}

/**
 * Task execution status
 */
export enum TaskStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    SKIPPED = 'skipped',
}

/**
 * Task result
 */
export interface TaskResult {
    readonly taskId: EntityId;
    readonly status: TaskStatus;
    readonly output?: unknown;
    readonly error?: TaskError;
    readonly executionTimeMs: number;
    readonly startedAt: Date;
    readonly completedAt?: Date;
}

/**
 * Task error details
 */
export interface TaskError {
    readonly code: string;
    readonly message: string;
    readonly stack?: string;
    readonly retryable: boolean;
}

/**
 * A plan consisting of tasks with dependencies
 */
export interface Plan {
    readonly id: EntityId;
    readonly goal: string;
    readonly tasks: Task[];
    readonly createdAt: Date;
    readonly metadata: PlanMetadata;
}

/**
 * Plan metadata
 */
export interface PlanMetadata {
    readonly plannerType: string;
    readonly estimatedTotalDurationMs?: number;
    readonly confidence?: number;
    readonly context?: Record<string, unknown>;
}

/**
 * Plan execution result
 */
export interface PlanExecutionResult {
    readonly planId: EntityId;
    readonly status: PlanExecutionStatus;
    readonly taskResults: Map<EntityId, TaskResult>;
    readonly startedAt: Date;
    readonly completedAt?: Date;
    readonly totalExecutionTimeMs: number;
}

/**
 * Plan execution status
 */
export enum PlanExecutionStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    PARTIAL = 'partial',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

/**
 * Planner configuration
 */
export interface PlannerConfig {
    readonly maxIterations?: number;
    readonly timeoutMs?: number;
    readonly allowParallelExecution?: boolean;
    readonly retryPolicy?: RetryPolicy;
}

/**
 * Retry policy for tasks
 */
export interface RetryPolicy {
    readonly maxRetries: number;
    readonly backoffMs: number;
    readonly maxBackoffMs: number;
    readonly exponentialBase: number;
}

/**
 * Abstract planner interface
 */
export interface Planner {
    /**
     * Create a plan from a goal
     */
    plan(goal: string, context?: PlanContext): Promise<Plan>;

    /**
     * Refine an existing plan based on feedback
     */
    refine(plan: Plan, feedback: PlanFeedback): Promise<Plan>;

    /**
     * Validate if a plan is executable
     */
    validate(plan: Plan): ValidationResult;
}

/**
 * Context for planning
 */
export interface PlanContext {
    readonly availableTools?: string[];
    readonly memory?: string[];
    readonly constraints?: string[];
    readonly previousPlans?: Plan[];
    readonly metadata?: Record<string, unknown>;
}

/**
 * Feedback for plan refinement
 */
export interface PlanFeedback {
    readonly failedTaskId?: EntityId;
    readonly error?: string;
    readonly suggestions?: string[];
    readonly additionalContext?: Record<string, unknown>;
}

/**
 * Validation result
 */
export interface ValidationResult {
    readonly valid: boolean;
    readonly errors: ValidationError[];
}

/**
 * Validation error
 */
export interface ValidationError {
    readonly taskId?: EntityId;
    readonly message: string;
    readonly severity: 'error' | 'warning';
}

/**
 * LLM-based planner configuration
 */
export interface LLMPlannerConfig extends PlannerConfig {
    readonly model: string;
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly systemPrompt?: string;
}

/**
 * Classical planner configuration
 */
export interface ClassicalPlannerConfig extends PlannerConfig {
    readonly algorithm: PlanningAlgorithm;
    readonly heuristic?: string;
}

/**
 * Planning algorithms
 */
export enum PlanningAlgorithm {
    A_STAR = 'a_star',
    BFS = 'bfs',
    DFS = 'dfs',
    GREEDY = 'greedy',
    HIERARCHICAL = 'hierarchical',
}