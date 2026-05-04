/**
 * Plan validator implementation
 */

import {
    ValidationResult,
    ValidationError,
    Plan,
    Task,
    TaskStatus,
} from './types.js';
import type { EntityId } from '@confused-ai/core';

/**
 * Plan validator with comprehensive checks
 */
export class PlanValidator {
    private customRules: ValidationRule[] = [];

    /**
     * Validate a plan comprehensively
     */
    validate(plan: Plan): ValidationResult {
        const errors: ValidationError[] = [];

        // Check for empty plan
        if (plan.tasks.length === 0) {
            errors.push({
                message: 'Plan contains no tasks',
                severity: 'error',
            });
        }

        // Check for duplicate task IDs
        errors.push(...this.checkDuplicateIds(plan.tasks));

        // Check for circular dependencies
        errors.push(...this.checkCircularDependencies(plan.tasks));

        // Check for orphaned tasks
        errors.push(...this.checkOrphanedTasks(plan.tasks));

        // Check for missing dependencies
        errors.push(...this.checkMissingDependencies(plan.tasks));

        // Check task validity
        for (const task of plan.tasks) {
            errors.push(...this.validateTask(task));
        }

        // Apply custom rules
        for (const rule of this.customRules) {
            const ruleErrors = rule(plan);
            errors.push(...ruleErrors);
        }

        return {
            valid: errors.filter(e => e.severity === 'error').length === 0,
            errors,
        };
    }

    /**
     * Add a custom validation rule
     */
    addRule(rule: ValidationRule): void {
        this.customRules.push(rule);
    }

    /**
     * Remove a custom validation rule
     */
    removeRule(rule: ValidationRule): void {
        const index = this.customRules.indexOf(rule);
        if (index > -1) {
            this.customRules.splice(index, 1);
        }
    }

    /**
     * Check for duplicate task IDs
     */
    private checkDuplicateIds(tasks: Task[]): ValidationError[] {
        const errors: ValidationError[] = [];
        const seenIds = new Set<EntityId>();

        for (const task of tasks) {
            if (seenIds.has(task.id)) {
                errors.push({
                    taskId: task.id,
                    message: `Duplicate task ID: ${task.id}`,
                    severity: 'error',
                });
            }
            seenIds.add(task.id);
        }

        return errors;
    }

    /**
     * Check for circular dependencies using DFS
     */
    private checkCircularDependencies(tasks: Task[]): ValidationError[] {
        const errors: ValidationError[] = [];
        const visited = new Set<EntityId>();
        const recursionStack = new Set<EntityId>();

        const hasCycle = (taskId: EntityId, path: EntityId[], taskMap: Map<EntityId, Task>): boolean => {
            visited.add(taskId);
            recursionStack.add(taskId);

            const task = taskMap.get(taskId);
            if (task) {
                for (const depId of task.dependencies) {
                    if (!visited.has(depId)) {
                        if (hasCycle(depId, [...path, depId], taskMap)) {
                            return true;
                        }
                    } else if (recursionStack.has(depId)) {
                        // Found cycle
                        const cycleStart = path.indexOf(depId);
                        const cycle = path.slice(cycleStart).concat([taskId]);
                        errors.push({
                            taskId,
                            message: `Circular dependency detected: ${cycle.join(' -> ')}`,
                            severity: 'error',
                        });
                        return true;
                    }
                }
            }

            recursionStack.delete(taskId);
            return false;
        };

        for (const task of tasks) {
            if (!visited.has(task.id)) {
                // Create task map for cycle detection
                const taskMapForCycle = new Map(tasks.map(t => [t.id, t]));
                hasCycle(task.id, [task.id], taskMapForCycle);
            }
        }

        return errors;
    }

    /**
     * Check for orphaned tasks (tasks not reachable from any root)
     */
    private checkOrphanedTasks(tasks: Task[]): ValidationError[] {
        const errors: ValidationError[] = [];
        const reachable = new Set<EntityId>();

        // Find all root tasks (no dependencies)
        const roots = tasks.filter(t => t.dependencies.length === 0);

        // BFS from roots to find all reachable tasks
        const queue = [...roots];
        while (queue.length > 0) {
            const task = queue.shift()!;
            reachable.add(task.id);

            // Find tasks that depend on this task
            for (const otherTask of tasks) {
                if (otherTask.dependencies.includes(task.id) && !reachable.has(otherTask.id)) {
                    queue.push(otherTask);
                }
            }
        }

        // Check for unreachable tasks
        for (const task of tasks) {
            if (!reachable.has(task.id)) {
                errors.push({
                    taskId: task.id,
                    message: `Orphaned task: ${task.name} is not reachable from any root task`,
                    severity: 'warning',
                });
            }
        }

        return errors;
    }

    /**
     * Check for missing dependencies
     */
    private checkMissingDependencies(tasks: Task[]): ValidationError[] {
        const errors: ValidationError[] = [];
        const taskIds = new Set(tasks.map(t => t.id));

        for (const task of tasks) {
            for (const depId of task.dependencies) {
                if (!taskIds.has(depId)) {
                    errors.push({
                        taskId: task.id,
                        message: `Missing dependency: ${depId} does not exist in the plan`,
                        severity: 'error',
                    });
                }
            }
        }

        return errors;
    }

    /**
     * Validate a single task
     */
    private validateTask(task: Task): ValidationError[] {
        const errors: ValidationError[] = [];

        // Check name
        if (!task.name || task.name.trim().length === 0) {
            errors.push({
                taskId: task.id,
                message: 'Task name is required',
                severity: 'error',
            });
        } else if (task.name.length > 100) {
            errors.push({
                taskId: task.id,
                message: 'Task name exceeds 100 characters',
                severity: 'warning',
            });
        }

        // Check description
        if (!task.description || task.description.trim().length === 0) {
            errors.push({
                taskId: task.id,
                message: 'Task description is required',
                severity: 'warning',
            });
        }

        // Check estimated duration
        if (task.estimatedDurationMs !== undefined) {
            if (task.estimatedDurationMs <= 0) {
                errors.push({
                    taskId: task.id,
                    message: 'Estimated duration must be positive',
                    severity: 'error',
                });
            } else if (task.estimatedDurationMs > 86400000) { // 24 hours
                errors.push({
                    taskId: task.id,
                    message: 'Estimated duration exceeds 24 hours, consider breaking into smaller tasks',
                    severity: 'warning',
                });
            }
        }

        // Check metadata
        if (task.metadata.maxRetries !== undefined && task.metadata.maxRetries < 0) {
            errors.push({
                taskId: task.id,
                message: 'Max retries must be non-negative',
                severity: 'error',
            });
        }

        if (task.metadata.timeoutMs !== undefined && task.metadata.timeoutMs <= 0) {
            errors.push({
                taskId: task.id,
                message: 'Timeout must be positive',
                severity: 'error',
            });
        }

        return errors;
    }

    /**
     * Validate task execution result
     */
    validateTaskResult(task: Task, result: { status: TaskStatus; error?: { message: string } }): ValidationError[] {
        const errors: ValidationError[] = [];

        if (result.status === TaskStatus.FAILED && !result.error) {
            errors.push({
                taskId: task.id,
                message: 'Failed task result must include error information',
                severity: 'error',
            });
        }

        return errors;
    }
}

/**
 * Custom validation rule type
 */
type ValidationRule = (plan: Plan) => ValidationError[];