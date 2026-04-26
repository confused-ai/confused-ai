/**
 * Load Balancer Implementation
 *
 * Distributes tasks across agents based on various strategies
 */

import { LoadBalancer, AgentRegistration, DelegationTask } from './types.js';
import type { EntityId } from '../../core/types.js';

/**
 * Round-robin load balancer
 */
export class RoundRobinLoadBalancer implements LoadBalancer {
    private lastIndex = 0;
    private agentMetrics: Map<EntityId, { totalTasks: number; failedTasks: number; totalExecutionTime: number }> = new Map();

    selectAgent(candidates: AgentRegistration[], _task: DelegationTask): AgentRegistration | undefined {
        if (candidates.length === 0) {
            return undefined;
        }

        // Filter to agents under their max load
        const available = candidates.filter(reg =>
            reg.metadata.currentLoad < reg.metadata.maxConcurrentTasks
        );

        if (available.length === 0) {
            // All agents at capacity, pick the one with lowest load
            return candidates.sort((a, b) => a.metadata.currentLoad - b.metadata.currentLoad)[0];
        }

        // Round-robin selection
        const index = this.lastIndex % available.length;
        this.lastIndex = (this.lastIndex + 1) % available.length;

        return available[index];
    }

    updateMetrics(agentId: EntityId, executionTimeMs: number, success: boolean): void {
        const metrics = this.agentMetrics.get(agentId) ?? {
            totalTasks: 0,
            failedTasks: 0,
            totalExecutionTime: 0,
        };

        metrics.totalTasks++;
        metrics.totalExecutionTime += executionTimeMs;
        if (!success) {
            metrics.failedTasks++;
        }

        this.agentMetrics.set(agentId, metrics);
    }

    /**
     * Get metrics for an agent
     */
    getMetrics(agentId: EntityId): { totalTasks: number; failedTasks: number; averageExecutionTime: number } | undefined {
        const metrics = this.agentMetrics.get(agentId);
        if (!metrics) return undefined;

        return {
            totalTasks: metrics.totalTasks,
            failedTasks: metrics.failedTasks,
            averageExecutionTime: metrics.totalTasks > 0
                ? metrics.totalExecutionTime / metrics.totalTasks
                : 0,
        };
    }
}

/**
 * Least connections load balancer
 */
export class LeastConnectionsLoadBalancer implements LoadBalancer {
    private agentMetrics: Map<EntityId, { totalTasks: number; failedTasks: number; totalExecutionTime: number }> = new Map();

    selectAgent(candidates: AgentRegistration[], _task: DelegationTask): AgentRegistration | undefined {
        if (candidates.length === 0) {
            return undefined;
        }

        // Sort by current load (ascending)
        return candidates.sort((a, b) => a.metadata.currentLoad - b.metadata.currentLoad)[0];
    }

    updateMetrics(agentId: EntityId, executionTimeMs: number, success: boolean): void {
        const metrics = this.agentMetrics.get(agentId) ?? {
            totalTasks: 0,
            failedTasks: 0,
            totalExecutionTime: 0,
        };

        metrics.totalTasks++;
        metrics.totalExecutionTime += executionTimeMs;
        if (!success) {
            metrics.failedTasks++;
        }

        this.agentMetrics.set(agentId, metrics);
    }
}

/**
 * Weighted response time load balancer
 */
export class WeightedResponseTimeLoadBalancer implements LoadBalancer {
    private agentMetrics: Map<EntityId, { totalTasks: number; failedTasks: number; totalExecutionTime: number }> = new Map();

    selectAgent(candidates: AgentRegistration[], _task: DelegationTask): AgentRegistration | undefined {
        if (candidates.length === 0) {
            return undefined;
        }

        // Calculate score based on average response time and current load
        const scored = candidates.map(reg => {
            const metrics = this.agentMetrics.get(reg.agent.id);
            const avgResponseTime = metrics && metrics.totalTasks > 0
                ? metrics.totalExecutionTime / metrics.totalTasks
                : 1000; // Default to 1s if no data

            const loadFactor = reg.metadata.currentLoad / reg.metadata.maxConcurrentTasks;

            // Lower score is better
            const score = avgResponseTime * (1 + loadFactor);

            return { reg, score };
        });

        // Sort by score (ascending)
        scored.sort((a, b) => a.score - b.score);

        return scored[0].reg;
    }

    updateMetrics(agentId: EntityId, executionTimeMs: number, success: boolean): void {
        const metrics = this.agentMetrics.get(agentId) ?? {
            totalTasks: 0,
            failedTasks: 0,
            totalExecutionTime: 0,
        };

        metrics.totalTasks++;
        metrics.totalExecutionTime += executionTimeMs;
        if (!success) {
            metrics.failedTasks++;
        }

        this.agentMetrics.set(agentId, metrics);
    }
}
