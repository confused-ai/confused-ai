/**
 * Agent adapter for orchestration
 *
 * Wraps a run function as an OrchestrableAgent so it can be registered
 * with the Orchestrator. Use OrchestrableAgent (not the public Agent) for
 * orchestration-internal wiring.
 */

import type { AgentInput, AgentOutput, AgentContext, EntityId } from '@confused-ai/core';
import type { OrchestrableAgent } from './types.js';

export interface RunnableAgentConfig {
    readonly id?: EntityId;
    readonly name: string;
    readonly description?: string;
    readonly run: (input: AgentInput, ctx: AgentContext) => Promise<AgentOutput>;
}

/**
 * Creates an OrchestrableAgent from a plain run function.
 */
export function createRunnableAgent(config: RunnableAgentConfig): OrchestrableAgent {
    return {
        id: config.id ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: config.name,
        description: config.description,
        run: config.run,
    };
}

export type { OrchestrableAgent };
