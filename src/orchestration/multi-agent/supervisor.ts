/**
 * Supervisor pattern: a "boss" agent that delegates to specialist sub-agents
 * and coordinates their results.
 */

import type { OrchestrableAgent, AgentInput, AgentOutput, AgentContext } from '../core/types.js';
import { AgentState } from '../core/types.js';
import type { AgentRole } from '../core/types.js';
import { CoordinationType } from '../core/types.js';
import { OrchestratorImpl } from '../core/orchestrator.js';
import { createRunnableAgent } from '../core/agent-adapter.js';

export interface SupervisorConfig {
    readonly name: string;
    readonly description?: string;
    /** Sub-agents with their roles (each agent will be registered with the orchestrator) */
    readonly subAgents: Array<{ agent: OrchestrableAgent; role: AgentRole }>;
    /** Optional guidelines for the supervisor (e.g. "Always assign the right task to the right agent") */
    readonly guidelines?: string[];
    /** Coordination strategy: SEQUENTIAL (default) or PARALLEL */
    readonly coordinationType?: CoordinationType;
}

/**
 * Creates a supervisor agent that coordinates multiple specialist agents.
 * When run, it delegates the task to all sub-agents (in sequence or parallel)
 * and combines their results.
 */
export function createSupervisor(config: SupervisorConfig): OrchestrableAgent {
    const orchestrator = new OrchestratorImpl();
    const coordinationType = config.coordinationType ?? 'sequential' as CoordinationType;

    for (const { agent, role } of config.subAgents) {
        orchestrator.registerAgent(agent, role);
    }

    const run = async (input: AgentInput, _ctx: AgentContext): Promise<AgentOutput> => {
        await orchestrator.start();

        const agents = orchestrator.listAgents();
        const taskId = `task-${Date.now()}`;

        const result = await orchestrator.coordinate(agents, {
            id: taskId,
            description: input.prompt,
            subtasks: [],
            coordinationType:
                coordinationType === 'parallel' ? CoordinationType.PARALLEL : CoordinationType.SEQUENTIAL,
        });

        await orchestrator.stop();

        const outputs: Record<string, unknown> = {};
        result.results.forEach((output, agentId) => {
            outputs[agentId] = output.result;
        });

        return {
            result: {
                combined: outputs,
                status: result.status,
                executionTimeMs: result.executionTimeMs,
                guidelines: config.guidelines,
            },
            state: result.status === 'success' ? AgentState.COMPLETED : AgentState.FAILED,
            metadata: {
                startTime: new Date(Date.now() - result.executionTimeMs),
                durationMs: result.executionTimeMs,
                iterations: agents.length,
            },
        };
    };

    return createRunnableAgent({
        name: config.name,
        description: config.description ?? `Supervisor coordinating ${config.subAgents.length} agents`,
        run,
    });
}

/**
 * Create a default AgentRole for a specialist agent
 */
export function createRole(
    name: string,
    responsibilities: string[],
    options?: { description?: string; canExecuteTools?: boolean }
): AgentRole {
    const id = `role-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    return {
        id,
        name,
        description: options?.description ?? `${name} specialist`,
        responsibilities,
        permissions: {
            canExecuteTools: options?.canExecuteTools ?? true,
            canAccessMemory: true,
            canCreateSubAgents: false,
            canModifyPlan: false,
        },
        canDelegate: false,
        canCommunicateWith: [],
    };
}
