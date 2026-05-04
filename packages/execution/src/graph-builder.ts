/**
 * Execution Graph Builder
 *
 * Builds and manages execution graphs for task dependency resolution
 */

import {
    ExecutionGraph,
    ExecutionNode,
    ExecutionNodeStatus,
} from './types.js';
import {
    Plan,
} from '@confused-ai/planner';
import type { EntityId } from '@confused-ai/core';

/**
 * Options for building an execution graph
 */
export interface GraphBuildOptions {
    readonly validateDependencies?: boolean;
    readonly detectCycles?: boolean;
}

/**
 * Graph validation error
 */
export class GraphValidationError extends Error {
    constructor(message: string, public readonly details: unknown) {
        super(message);
        this.name = 'GraphValidationError';
    }
}

/**
 * Mutable execution graph for internal use
 */
interface MutableExecutionGraph extends ExecutionGraph {
    nodes: Map<EntityId, MutableExecutionNode>;
    readyQueue: EntityId[];
    completedCount: number;
    failedCount: number;
}

/**
 * Mutable execution node for internal use
 */
interface MutableExecutionNode extends ExecutionNode {
    status: ExecutionNodeStatus;
    dependencies: Set<EntityId>;
    dependents: Set<EntityId>;
    startedAt?: Date;
    completedAt?: Date;
}

/**
 * Execution graph builder
 */
export class ExecutionGraphBuilder {
    private options: Required<GraphBuildOptions>;

    constructor(options: GraphBuildOptions = {}) {
        this.options = {
            validateDependencies: true,
            detectCycles: true,
            ...options,
        };
    }

    /**
     * Build an execution graph from a plan
     */
    build(plan: Plan): ExecutionGraph {
        const nodes = new Map<EntityId, MutableExecutionNode>();
        const readyQueue: EntityId[] = [];

        // Create nodes for all tasks
        for (const task of plan.tasks) {
            const node: MutableExecutionNode = {
                task,
                status: ExecutionNodeStatus.PENDING,
                dependencies: new Set(task.dependencies),
                dependents: new Set(),
            };
            nodes.set(task.id, node);

            // Add to ready queue if no dependencies
            if (task.dependencies.length === 0) {
                readyQueue.push(task.id);
            }
        }

        // Build reverse dependency map (dependents)
        for (const [id, node] of nodes) {
            for (const depId of node.dependencies) {
                const depNode = nodes.get(depId);
                if (depNode) {
                    depNode.dependents.add(id);
                } else if (this.options.validateDependencies) {
                    throw new GraphValidationError(
                        `Task ${id} has unknown dependency: ${depId}`,
                        { taskId: id, dependencyId: depId }
                    );
                }
            }
        }

        // Detect cycles if enabled
        if (this.options.detectCycles) {
            const cycle = this.detectCycle(nodes);
            if (cycle) {
                throw new GraphValidationError(
                    `Circular dependency detected: ${cycle.join(' -> ')}`,
                    { cycle }
                );
            }
        }

        const graph: MutableExecutionGraph = {
            planId: plan.id,
            nodes,
            readyQueue,
            completedCount: 0,
            failedCount: 0,
            totalCount: plan.tasks.length,
        };

        return graph as ExecutionGraph;
    }

    /**
     * Detect cycles in the graph using DFS
     */
    private detectCycle(nodes: Map<EntityId, MutableExecutionNode>): EntityId[] | null {
        const visited = new Set<EntityId>();
        const recursionStack = new Set<EntityId>();
        const path: EntityId[] = [];

        const dfs = (nodeId: EntityId): EntityId[] | null => {
            visited.add(nodeId);
            recursionStack.add(nodeId);
            path.push(nodeId);

            const node = nodes.get(nodeId);
            if (node) {
                for (const dependentId of node.dependents) {
                    if (!visited.has(dependentId)) {
                        const cycle = dfs(dependentId);
                        if (cycle) return cycle;
                    } else if (recursionStack.has(dependentId)) {
                        // Found a cycle
                        const cycleStart = path.indexOf(dependentId);
                        return [...path.slice(cycleStart), dependentId];
                    }
                }
            }

            path.pop();
            recursionStack.delete(nodeId);
            return null;
        };

        for (const nodeId of nodes.keys()) {
            if (!visited.has(nodeId)) {
                const cycle = dfs(nodeId);
                if (cycle) return cycle;
            }
        }

        return null;
    }

    /**
     * Get tasks that are ready to execute (all dependencies completed)
     */
    getReadyTasks(graph: ExecutionGraph): EntityId[] {
        const ready: EntityId[] = [];
        const mutableGraph = graph as MutableExecutionGraph;

        for (const [id, node] of mutableGraph.nodes) {
            if (node.status !== ExecutionNodeStatus.PENDING) {
                continue;
            }

            const allDepsCompleted = Array.from(node.dependencies).every(depId => {
                const depNode = mutableGraph.nodes.get(depId);
                return depNode?.status === ExecutionNodeStatus.COMPLETED;
            });

            if (allDepsCompleted) {
                ready.push(id);
            }
        }

        return ready;
    }

    /**
     * Update node status and propagate to dependents
     */
    updateNodeStatus(
        graph: ExecutionGraph,
        nodeId: EntityId,
        status: ExecutionNodeStatus
    ): void {
        const mutableGraph = graph as MutableExecutionGraph;
        const node = mutableGraph.nodes.get(nodeId);
        if (!node) {
            return;
        }

        node.status = status;

        // Update counters
        if (status === ExecutionNodeStatus.COMPLETED) {
            mutableGraph.completedCount++;
        } else if (status === ExecutionNodeStatus.FAILED) {
            mutableGraph.failedCount++;
        }

        // If completed or failed, check dependents
        if (status === ExecutionNodeStatus.COMPLETED || status === ExecutionNodeStatus.FAILED) {
            node.completedAt = new Date();

            // Add ready dependents to queue
            for (const dependentId of node.dependents) {
                const dependent = mutableGraph.nodes.get(dependentId);
                if (dependent && dependent.status === ExecutionNodeStatus.PENDING) {
                    const allDepsCompleted = Array.from(dependent.dependencies).every(depId => {
                        const depNode = mutableGraph.nodes.get(depId);
                        return depNode?.status === ExecutionNodeStatus.COMPLETED;
                    });

                    if (allDepsCompleted && !mutableGraph.readyQueue.includes(dependentId)) {
                        mutableGraph.readyQueue.push(dependentId);
                    }
                }
            }
        }
    }

    /**
     * Get the execution order (topological sort)
     */
    getExecutionOrder(graph: ExecutionGraph): EntityId[] {
        const order: EntityId[] = [];
        const visited = new Set<EntityId>();
        const temp = new Set<EntityId>();
        const mutableGraph = graph as MutableExecutionGraph;

        const visit = (nodeId: EntityId): void => {
            if (temp.has(nodeId)) {
                throw new GraphValidationError('Cycle detected during topological sort', { nodeId });
            }

            if (visited.has(nodeId)) {
                return;
            }

            temp.add(nodeId);
            const node = mutableGraph.nodes.get(nodeId);

            if (node) {
                for (const depId of node.dependencies) {
                    visit(depId);
                }
            }

            temp.delete(nodeId);
            visited.add(nodeId);
            order.push(nodeId);
        };

        for (const nodeId of mutableGraph.nodes.keys()) {
            if (!visited.has(nodeId)) {
                visit(nodeId);
            }
        }

        return order;
    }

    /**
     * Clone a graph
     */
    clone(graph: ExecutionGraph): ExecutionGraph {
        const mutableGraph = graph as MutableExecutionGraph;
        const newNodes = new Map<EntityId, MutableExecutionNode>();

        for (const [id, node] of mutableGraph.nodes) {
            newNodes.set(id, {
                task: node.task,
                status: node.status,
                dependencies: new Set(node.dependencies),
                dependents: new Set(node.dependents),
                result: node.result,
                startedAt: node.startedAt,
                completedAt: node.completedAt,
            });
        }

        const newGraph: MutableExecutionGraph = {
            planId: mutableGraph.planId,
            nodes: newNodes,
            readyQueue: [...mutableGraph.readyQueue],
            completedCount: mutableGraph.completedCount,
            failedCount: mutableGraph.failedCount,
            totalCount: mutableGraph.totalCount,
        };

        return newGraph as ExecutionGraph;
    }

    /**
     * Get graph statistics
     */
    getStats(graph: ExecutionGraph): {
        total: number;
        pending: number;
        running: number;
        completed: number;
        failed: number;
        cancelled: number;
    } {
        const mutableGraph = graph as MutableExecutionGraph;
        let pending = 0;
        let running = 0;
        let completed = 0;
        let failed = 0;
        let cancelled = 0;

        for (const node of mutableGraph.nodes.values()) {
            switch (node.status) {
                case ExecutionNodeStatus.PENDING:
                case ExecutionNodeStatus.READY:
                    pending++;
                    break;
                case ExecutionNodeStatus.RUNNING:
                    running++;
                    break;
                case ExecutionNodeStatus.COMPLETED:
                    completed++;
                    break;
                case ExecutionNodeStatus.FAILED:
                    failed++;
                    break;
                case ExecutionNodeStatus.CANCELLED:
                    cancelled++;
                    break;
            }
        }

        return {
            total: mutableGraph.totalCount,
            pending,
            running,
            completed,
            failed,
            cancelled,
        };
    }
}
