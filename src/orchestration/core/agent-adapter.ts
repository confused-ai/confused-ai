/**
 * Agent adapter for orchestration
 *
 * Wraps a run function as a core Agent so it can be registered with the Orchestrator.
 */

import { Agent, AgentInput, AgentOutput, AgentContext } from '../../core/types.js';

export interface RunnableAgentConfig {
    readonly name: string;
    readonly description?: string;
    readonly run: (input: AgentInput, ctx: AgentContext) => Promise<AgentOutput>;
}

/**
 * Creates a core Agent from a run function for use with the Orchestrator.
 */
export function createRunnableAgent(config: RunnableAgentConfig): Agent {
    return new RunnableAgentAdapter(config);
}

class RunnableAgentAdapter extends Agent {
    constructor(private readonly runConfig: RunnableAgentConfig) {
        super({
            name: runConfig.name,
            description: runConfig.description,
        });
    }

    async run(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
        return this.runConfig.run(input, ctx);
    }
}
