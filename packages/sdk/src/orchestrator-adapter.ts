import type { AgentInput, AgentOutput, EntityId } from '@confused-ai/core';
import { AgentState } from '@confused-ai/core';
import type { OrchestrableAgent } from '@confused-ai/orchestration';
import type { DefinedAgent } from './defined-agent.js';

class DefinedAgentAdapter implements OrchestrableAgent {
    readonly id: EntityId;
    readonly name: string;
    readonly description?: string;

    constructor(private readonly definedAgent: DefinedAgent<unknown, unknown>) {
        this.id = `defined-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.name = definedAgent.getConfig().name;
        this.description = definedAgent.getConfig().description ?? undefined;
    }

    async run(input: AgentInput, _ctx: unknown): Promise<AgentOutput> {
        const parsedInput =
            typeof input.prompt === 'string' && (input.prompt.startsWith('{') || input.prompt.startsWith('['))
                ? (JSON.parse(input.prompt) as unknown)
                : input.prompt;
        const result = await this.definedAgent.run({
            input: parsedInput,
            context: input.context ?? {},
        });
        return {
            result,
            state: AgentState.COMPLETED,
            metadata: {
                startTime: new Date(),
                iterations: 0,
            },
        };
    }
}

/**
 * Adapts a `DefinedAgent` to the `OrchestrableAgent` type for orchestration (supervisor, pipeline, etc.).
 */
export function asOrchestratorAgent(definedAgent: DefinedAgent<unknown, unknown>): OrchestrableAgent {
    return new DefinedAgentAdapter(definedAgent);
}
