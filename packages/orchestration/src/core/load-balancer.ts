/**
 * Load Balancer Implementation
 *
 * Distributes tasks across agents based on various strategies
 */

import { LoadBalancer, AgentRegistration, DelegationTask } from './types.js';
import type { EntityId } from '@confused-ai/core';

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
            // All agents at capacity — linear scan for minimum load, O(n) vs O(n log n) sort
            let minLoad = Infinity;
            let best = candidates[0];
            for (const reg of candidates) {
                if (reg.metadata.currentLoad < minLoad) {
                    minLoad = reg.metadata.currentLoad;
                    best = reg;
                }
            }
            return best;
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

        // Linear scan for minimum current load — O(n) vs O(n log n) sort
        let minLoad = Infinity;
        let best = candidates[0];
        for (const reg of candidates) {
            if (reg.metadata.currentLoad < minLoad) {
                minLoad = reg.metadata.currentLoad;
                best = reg;
            }
        }
        return best;
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

        // Linear scan for minimum weighted score — O(n) vs O(n log n) sort
        let minScore = Infinity;
        let best = candidates[0];
        for (const reg of candidates) {
            const metrics = this.agentMetrics.get(reg.agent.id);
            const avgResponseTime = metrics && metrics.totalTasks > 0
                ? metrics.totalExecutionTime / metrics.totalTasks
                : 1000;
            const loadFactor = reg.metadata.currentLoad / reg.metadata.maxConcurrentTasks;
            const score = avgResponseTime * (1 + loadFactor);
            if (score < minScore) {
                minScore = score;
                best = reg;
            }
        }
        return best;
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
