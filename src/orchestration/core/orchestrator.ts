/**
 * Multi-Agent Orchestrator Implementation
 *
 * Coordinates multiple agents with message passing and load balancing
 */

import {
    Orchestrator,
    AgentRegistration,
    AgentRole,
    MessageType,
    MessagePriority,
    DelegationTask,
    DelegationResult,
    DelegationStatus,
    DelegationPriority,
    CoordinationTask,
    CoordinationResult,
    CoordinationType,
    CoordinationStatus,
} from './types.js';
import type { MessageBus, Subscription } from './types.js';
import { MessageBusImpl } from './message-bus.js';
import { RoundRobinLoadBalancer } from './load-balancer.js';
import type { Agent, AgentInput, AgentContext } from '../../core/types.js';
import type { AgentOutput } from '../../core/types.js';
import { AgentState } from '../../core/types.js';
import type { EntityId } from '../../core/types.js';
import type { LoadBalancer } from './types.js';
import { AgentContextBuilder } from '../../core/context-builder.js';
import { InMemoryStore } from '../../memory/in-memory-store.js';
import { ToolRegistryImpl } from '../../tools/core/registry.js';
import { ClassicalPlanner } from '../../planner/classical-planner.js';
import { PlanningAlgorithm } from '../../planner/types.js';

const ORCHESTRATOR_ID = 'orchestrator' as EntityId;

/**
 * Orchestrator implementation
 */
export class OrchestratorImpl implements Orchestrator {
    private agents: Map<EntityId, AgentRegistration> = new Map();
    private subscriptions: Map<EntityId, Subscription> = new Map();
    private messageBus: MessageBus;
    private loadBalancer: LoadBalancer;
    private _isRunning = false;

    constructor(
        messageBus?: MessageBus,
        loadBalancer?: LoadBalancer
    ) {
        this.messageBus = messageBus ?? new MessageBusImpl();
        this.loadBalancer = loadBalancer ?? new RoundRobinLoadBalancer();
    }

    async registerAgent(agent: Agent, role: AgentRole): Promise<void> {
        const registration: AgentRegistration = {
            agent,
            role,
            capabilities: role.responsibilities,
            metadata: {
                registeredAt: new Date(),
                totalTasksCompleted: 0,
                totalTasksFailed: 0,
                averageExecutionTimeMs: 0,
                currentLoad: 0,
                maxConcurrentTasks: role.permissions.canExecuteTools ? 5 : 1,
            },
        };

        this.agents.set(agent.id, registration);

        const subscription = this.messageBus.subscribe(
            agent.id,
            { types: [MessageType.QUERY] },
            async (msg) => {
                const payload = msg.payload as { type?: string; task?: AgentInput };
                const taskInput = (payload?.task ?? payload) as AgentInput;
                const ctx = createMinimalContext(agent);
                try {
                    const output = await agent.run(taskInput, ctx);
                    await this.messageBus.send({
                        from: agent.id,
                        to: ORCHESTRATOR_ID,
                        type: MessageType.TASK_RESPONSE,
                        payload: output,
                        correlationId: msg.correlationId,
                        priority: MessagePriority.NORMAL,
                    });
                } catch (err) {
                    const errorOutput: AgentOutput = {
                        result: err instanceof Error ? err.message : String(err),
                        state: AgentState.FAILED,
                        metadata: { startTime: new Date(), iterations: 0 },
                    };
                    await this.messageBus.send({
                        from: agent.id,
                        to: ORCHESTRATOR_ID,
                        type: MessageType.TASK_RESPONSE,
                        payload: errorOutput,
                        correlationId: msg.correlationId,
                        priority: MessagePriority.NORMAL,
                    });
                }
            }
        );
        this.subscriptions.set(agent.id, subscription);

        // Notify other agents
        await this.broadcast({
            type: 'agent_registered',
            agentId: agent.id,
            role: role.name,
        }, MessageType.EVENT);
    }

    async unregisterAgent(agentId: EntityId): Promise<void> {
        const registration = this.agents.get(agentId);
        if (!registration) {
            throw new Error(`Agent ${agentId} not found`);
        }

        const subscription = this.subscriptions.get(agentId);
        if (subscription) {
            this.messageBus.unsubscribe(subscription);
            this.subscriptions.delete(agentId);
        }
        this.agents.delete(agentId);

        await this.broadcast({
            type: 'agent_unregistered',
            agentId,
        }, MessageType.EVENT);
    }

    getAgent(agentId: EntityId): AgentRegistration | undefined {
        return this.agents.get(agentId);
    }

    listAgents(): AgentRegistration[] {
        return Array.from(this.agents.values());
    }

    findAgentsByRole(roleName: string): AgentRegistration[] {
        return Array.from(this.agents.values()).filter(
            reg => reg.role.name === roleName
        );
    }

    findAgentsByCapability(capability: string): AgentRegistration[] {
        return Array.from(this.agents.values()).filter(
            reg => reg.capabilities.includes(capability)
        );
    }

    async delegateTask(task: DelegationTask, options?: { timeoutMs?: number; retryCount?: number }): Promise<DelegationResult> {
        const startTime = Date.now();

        // Find candidates with required capabilities
        const candidates = this.findAgentsByCapabilities(task.requiredCapabilities);

        if (candidates.length === 0) {
            return {
                taskId: task.id,
                assignedAgentId: '',
                status: DelegationStatus.FAILED,
                error: 'No agents found with required capabilities',
                executionTimeMs: Date.now() - startTime,
            };
        }

        // Select best agent using load balancer
        const selected = this.loadBalancer.selectAgent(candidates, task);

        if (!selected) {
            return {
                taskId: task.id,
                assignedAgentId: '',
                status: DelegationStatus.REJECTED,
                error: 'No agent available to handle task',
                executionTimeMs: Date.now() - startTime,
            };
        }

        try {
            // Send task to selected agent
            const response = await this.messageBus.request(
                selected.agent.id,
                {
                    type: 'task',
                    task: task.input,
                },
                options?.timeoutMs ?? 30000
            );

            // Update metrics
            this.loadBalancer.updateMetrics(
                selected.agent.id,
                Date.now() - startTime,
                true
            );

            return {
                taskId: task.id,
                assignedAgentId: selected.agent.id,
                status: DelegationStatus.COMPLETED,
                output: response as AgentOutput,
                executionTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            // Update metrics
            this.loadBalancer.updateMetrics(
                selected.agent.id,
                Date.now() - startTime,
                false
            );

            return {
                taskId: task.id,
                assignedAgentId: selected.agent.id,
                status: DelegationStatus.FAILED,
                error: error instanceof Error ? error.message : String(error),
                executionTimeMs: Date.now() - startTime,
            };
        }
    }

    async broadcast(payload: unknown, type: MessageType = MessageType.NOTIFICATION): Promise<void> {
        for (const [agentId] of this.agents) {
            await this.messageBus.send({
                from: ORCHESTRATOR_ID,
                to: agentId,
                type,
                payload,
                priority: MessagePriority.NORMAL,
            });
        }
    }

    getMessageBus(): MessageBus {
        return this.messageBus;
    }

    async start(): Promise<void> {
        this._isRunning = true;
    }

    async stop(): Promise<void> {
        this._isRunning = false;
    }

    /**
     * Check if orchestrator is running
     */
    isRunning(): boolean {
        return this._isRunning;
    }

    /**
     * Coordinate multiple agents for a complex task
     */
    async coordinate(agents: AgentRegistration[], task: CoordinationTask): Promise<CoordinationResult> {
        const startTime = Date.now();
        const results = new Map<EntityId, AgentOutput>();

        switch (task.coordinationType) {
            case CoordinationType.SEQUENTIAL:
                for (const agentReg of agents) {
                    const result = await this.delegateTask({
                        id: `${task.id}-${agentReg.agent.id}`,
                        description: task.description,
                        requiredCapabilities: agentReg.capabilities,
                        input: { prompt: task.description },
                        priority: DelegationPriority.NORMAL,
                    });

                    if (result.output) {
                        results.set(agentReg.agent.id, result.output);
                    }
                }
                break;

            case CoordinationType.PARALLEL:
                const promises = agents.map(agentReg =>
                    this.delegateTask({
                        id: `${task.id}-${agentReg.agent.id}`,
                        description: task.description,
                        requiredCapabilities: agentReg.capabilities,
                        input: { prompt: task.description },
                        priority: DelegationPriority.NORMAL,
                    })
                );

                const parallelResults = await Promise.all(promises);
                for (let i = 0; i < agents.length; i++) {
                    const output = parallelResults[i].output;
                    if (output) {
                        results.set(agents[i].agent.id, output);
                    }
                }
                break;

            default:
                // Default to sequential
                for (const agentReg of agents) {
                    const result = await this.delegateTask({
                        id: `${task.id}-${agentReg.agent.id}`,
                        description: task.description,
                        requiredCapabilities: agentReg.capabilities,
                        input: { prompt: task.description },
                        priority: DelegationPriority.NORMAL,
                    });

                    if (result.output) {
                        results.set(agentReg.agent.id, result.output);
                    }
                }
        }

        return {
            taskId: task.id,
            status: results.size === agents.length
                ? CoordinationStatus.SUCCESS
                : results.size > 0
                    ? CoordinationStatus.PARTIAL
                    : CoordinationStatus.FAILED,
            results,
            executionTimeMs: Date.now() - startTime,
        };
    }

    private findAgentsByCapabilities(requiredCapabilities: string[]): AgentRegistration[] {
        if (!Array.isArray(requiredCapabilities) || requiredCapabilities.length === 0) {
            return Array.from(this.agents.values());
        }
        return Array.from(this.agents.values()).filter(reg =>
            requiredCapabilities.every(cap => Array.isArray(reg.capabilities) && reg.capabilities.includes(cap))
        );
    }
}

/**
 * Create a minimal AgentContext for in-process agent execution
 */
function createMinimalContext(agent: Agent): AgentContext {
    return new AgentContextBuilder()
        .withAgentId(agent.id)
        .withMemory(new InMemoryStore())
        .withTools(new ToolRegistryImpl())
        .withPlanner(new ClassicalPlanner({ algorithm: PlanningAlgorithm.HIERARCHICAL }))
        .build();
}
