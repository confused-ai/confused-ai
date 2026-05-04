/**
 * Classical planner implementation using task decomposition
 */

import {
    Planner,
    Plan,
    PlanContext,
    PlanFeedback,
    ValidationResult,
    Task,
    TaskPriority,
    ClassicalPlannerConfig,
    PlanningAlgorithm,
} from './types.js';
import type { EntityId } from '@confused-ai/core';

/**
 * Classical planner using rule-based task decomposition
 */
export class ClassicalPlanner implements Planner {
    private plannerConfig: Required<ClassicalPlannerConfig>;
    private taskPatterns: Map<string, TaskPattern> = new Map();

    constructor(config: ClassicalPlannerConfig) {
        this.plannerConfig = {
            maxIterations: config.maxIterations ?? 10,
            timeoutMs: config.timeoutMs ?? 30000,
            allowParallelExecution: config.allowParallelExecution ?? true,
            retryPolicy: config.retryPolicy ?? {
                maxRetries: 3,
                backoffMs: 1000,
                maxBackoffMs: 30000,
                exponentialBase: 2,
            },
            algorithm: config.algorithm ?? PlanningAlgorithm.HIERARCHICAL,
            heuristic: config.heuristic ?? 'default',
        };

        this.registerDefaultPatterns();
    }

    /**
     * Get planner configuration
     */
    getConfig(): Required<ClassicalPlannerConfig> {
        return this.plannerConfig;
    }

    async plan(goal: string, context?: PlanContext): Promise<Plan> {
        const planId = this.generateId();
        const tasks: Task[] = [];

        // Analyze goal and match against patterns
        const matchedPattern = this.findMatchingPattern(goal, context);

        if (matchedPattern) {
            // Use pattern to generate tasks
            const patternTasks = matchedPattern.generateTasks(goal, context);
            tasks.push(...patternTasks);
        } else {
            // Fallback: create a single task for the goal
            tasks.push(this.createSimpleTask(goal));
        }

        // Build dependency graph
        this.buildDependencies(tasks);

        // Estimate durations
        this.estimateDurations(tasks);

        const plan: Plan = {
            id: planId,
            goal,
            tasks,
            createdAt: new Date(),
            metadata: {
                plannerType: 'classical',
                estimatedTotalDurationMs: this.calculateTotalDuration(tasks),
                confidence: matchedPattern ? 0.8 : 0.5,
                ...(context?.metadata !== undefined ? { context: context.metadata } : {}),
            },
        };

        return plan;
    }

    async refine(plan: Plan, feedback: PlanFeedback): Promise<Plan> {
        const refinedTasks: Task[] = [];

        for (const task of plan.tasks) {
            if (task.id === feedback.failedTaskId) {
                // Add retry or alternative task
                refinedTasks.push({
                    ...task,
                    metadata: {
                        ...task.metadata,
                        maxRetries: (task.metadata.maxRetries ?? 0) + 1,
                    },
                });

                // Add alternative task if suggested
                if (feedback.suggestions && feedback.suggestions.length > 0) {
                    const suggestion = feedback.suggestions[0];
                    if (suggestion !== undefined) {
                        refinedTasks.push(
                            this.createAlternativeTask(task, suggestion)
                        );
                    }
                }
            } else {
                refinedTasks.push(task);
            }
        }

        // Rebuild dependencies
        this.buildDependencies(refinedTasks);

        return {
            ...plan,
            tasks: refinedTasks,
            metadata: {
                ...plan.metadata,
                confidence: (plan.metadata.confidence ?? 0.5) * 0.9, // Reduce confidence on refinement
            },
        };
    }

    validate(plan: Plan): ValidationResult {
        const errors: ValidationResult['errors'] = [];

        // Check for circular dependencies
        const visited = new Set<EntityId>();
        const recursionStack = new Set<EntityId>();

        const hasCycle = (taskId: EntityId, taskMap: Map<EntityId, Task>): boolean => {
            visited.add(taskId);
            recursionStack.add(taskId);

            const task = taskMap.get(taskId);
            if (task) {
                for (const depId of task.dependencies) {
                    if (!visited.has(depId)) {
                        if (hasCycle(depId, taskMap)) {
                            return true;
                        }
                    } else if (recursionStack.has(depId)) {
                        return true;
                    }
                }
            }

            recursionStack.delete(taskId);
            return false;
        };

        const taskMap = new Map(plan.tasks.map(t => [t.id, t]));

        for (const task of plan.tasks) {
            if (!visited.has(task.id)) {
                if (hasCycle(task.id, taskMap)) {
                    errors.push({
                        taskId: task.id,
                        message: 'Circular dependency detected',
                        severity: 'error',
                    });
                }
            }

            // Check for missing dependencies
            for (const depId of task.dependencies) {
                if (!taskMap.has(depId)) {
                    errors.push({
                        taskId: task.id,
                        message: `Missing dependency: ${depId}`,
                        severity: 'error',
                    });
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Register a task pattern
     */
    registerPattern(pattern: TaskPattern): void {
        this.taskPatterns.set(pattern.name, pattern);
    }

    /**
     * Find a matching pattern for the goal
     */
    private findMatchingPattern(goal: string, context?: PlanContext): TaskPattern | undefined {
        for (const pattern of this.taskPatterns.values()) {
            if (pattern.matches(goal, context)) {
                return pattern;
            }
        }
        return undefined;
    }

    /**
     * Create a simple task for a goal
     */
    private createSimpleTask(goal: string): Task {
        return {
            id: this.generateId(),
            name: 'Execute Goal',
            description: goal,
            dependencies: [],
            priority: TaskPriority.MEDIUM,
            metadata: {},
        };
    }

    /**
     * Create an alternative task based on feedback
     */
    private createAlternativeTask(originalTask: Task, suggestion: string): Task {
        return {
            id: this.generateId(),
            name: `${originalTask.name} (Alternative)`,
            description: suggestion,
            dependencies: originalTask.dependencies,
            priority: originalTask.priority,
            metadata: {
                ...originalTask.metadata,
                custom: {
                    ...originalTask.metadata.custom,
                    isAlternative: true,
                    originalTaskId: originalTask.id,
                },
            },
        };
    }

    /**
     * Build task dependencies based on patterns and context
     */
    private buildDependencies(tasks: Task[]): void {
        // Simple sequential dependency for now
        // In a real implementation, this would analyze task relationships
        for (let i = 1; i < tasks.length; i++) {
            const task = tasks[i];
            if (task === undefined) continue;
            const prevTask = tasks[i - 1];
            if (task.dependencies.length === 0 && prevTask !== undefined) {
                // Add dependency on previous task
                Object.assign(task, {
                    dependencies: [prevTask.id],
                });
            }
        }
    }

    /**
     * Estimate task durations
     */
    private estimateDurations(tasks: Task[]): void {
        for (const task of tasks) {
            if (!task.estimatedDurationMs) {
                // Simple heuristic based on description length
                const baseDuration = 5000;
                const complexityFactor = Math.min(task.description.length / 100, 5);
                Object.assign(task, {
                    estimatedDurationMs: baseDuration * complexityFactor,
                });
            }
        }
    }

    /**
     * Calculate total plan duration
     */
    private calculateTotalDuration(tasks: Task[]): number {
        return tasks.reduce((sum, task) => sum + (task.estimatedDurationMs ?? 5000), 0);
    }

    /**
     * Generate a unique ID
     */
    private generateId(): EntityId {
        return `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * Register default task patterns
     */
    private registerDefaultPatterns(): void {
        // Research pattern
        this.registerPattern({
            name: 'research',
            matches: (goal) => /research|investigate|find|search/i.test(goal),
            generateTasks: (goal, context) => [
                {
                    id: this.generateId(),
                    name: 'Gather Information',
                    description: `Search for information about: ${goal}`,
                    dependencies: [],
                    priority: TaskPriority.HIGH,
                    metadata: {
                        ...(context?.availableTools !== undefined ? { toolIds: context.availableTools.filter(t =>
                            t.includes('search') || t.includes('web')
                        ) } : {}),
                    },
                },
                {
                    id: this.generateId(),
                    name: 'Analyze Findings',
                    description: 'Analyze and synthesize gathered information',
                    dependencies: [], // Will be set by buildDependencies
                    priority: TaskPriority.HIGH,
                    metadata: {},
                },
                {
                    id: this.generateId(),
                    name: 'Generate Report',
                    description: 'Create a comprehensive report from the analysis',
                    dependencies: [],
                    priority: TaskPriority.MEDIUM,
                    metadata: {
                        outputKey: 'report',
                    },
                },
            ],
        });

        // Data processing pattern
        this.registerPattern({
            name: 'data-processing',
            matches: (goal) => /process|analyze|transform|convert/i.test(goal),
            generateTasks: (goal, context) => [
                {
                    id: this.generateId(),
                    name: 'Fetch Data',
                    description: `Retrieve data for: ${goal}`,
                    dependencies: [],
                    priority: TaskPriority.HIGH,
                    metadata: {
                        ...(context?.availableTools !== undefined ? { toolIds: context.availableTools.filter(t =>
                            t.includes('db') || t.includes('api') || t.includes('file')
                        ) } : {}),
                    },
                },
                {
                    id: this.generateId(),
                    name: 'Validate Data',
                    description: 'Validate data integrity and format',
                    dependencies: [],
                    priority: TaskPriority.HIGH,
                    metadata: {},
                },
                {
                    id: this.generateId(),
                    name: 'Process Data',
                    description: 'Apply transformations and processing logic',
                    dependencies: [],
                    priority: TaskPriority.HIGH,
                    metadata: {},
                },
                {
                    id: this.generateId(),
                    name: 'Store Results',
                    description: 'Save processed results',
                    dependencies: [],
                    priority: TaskPriority.MEDIUM,
                    metadata: {
                        outputKey: 'results',
                    },
                },
            ],
        });
    }
}

/**
 * Task pattern interface for rule-based planning
 */
interface TaskPattern {
    name: string;
    matches(goal: string, context?: PlanContext): boolean;
    generateTasks(goal: string, context?: PlanContext): Task[];
}