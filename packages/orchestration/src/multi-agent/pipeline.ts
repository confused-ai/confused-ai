/**
 * Pipeline pattern: run agents in sequence, passing output of one as input to the next.
 */

import type { AgentInput, AgentOutput, AgentContext } from '../core/types.js';
import type { OrchestrableAgent } from '../core/types.js';
import { AgentState } from '../core/types.js';
import { createRunnableAgent } from '../core/agent-adapter.js';
import { AgentContextBuilder } from '../_context-builder.js';
import { InMemoryStore } from '@confused-ai/memory';
import { ToolRegistryImpl } from '@confused-ai/tools';
import { ClassicalPlanner } from '@confused-ai/planner';
import { PlanningAlgorithm } from '@confused-ai/planner';

export interface PipelineConfig {
    readonly name: string;
    readonly description?: string;
    /** Agents in execution order; output of step N is passed as input to step N+1 */
    readonly agents: OrchestrableAgent[];
}

/**
 * Creates a pipeline agent that runs the given agents in sequence.
 * Each agent receives the previous agent's output as its input (as JSON in the prompt).
 */
export function createPipeline(config: PipelineConfig): OrchestrableAgent {
    const run = async (input: AgentInput, _ctx: AgentContext): Promise<AgentOutput> => {
        const results: unknown[] = [];
        let currentPrompt = input.prompt;
        const sharedContext = new AgentContextBuilder()
            .withAgentId(`pipeline-${config.name}`)
            .withMemory(new InMemoryStore())
            .withTools(new ToolRegistryImpl())
            .withPlanner(new ClassicalPlanner({ algorithm: PlanningAlgorithm.HIERARCHICAL }))
            .build();

        for (const agent of config.agents) {
            const agentInput: AgentInput = {
                prompt: currentPrompt,
                context: input.context,
            };
            const output = await agent.run(agentInput, sharedContext);
            const result = output.result;
            results.push(result);
            currentPrompt = typeof result === 'string' ? result : JSON.stringify(result);
        }

        return {
            result: results.length === 1 ? results[0] : { steps: results, final: results[results.length - 1] },
            state: AgentState.COMPLETED,
            metadata: {
                startTime: new Date(),
                durationMs: 0,
                iterations: config.agents.length,
            },
        };
    };

    return createRunnableAgent({
        name: config.name,
        description: config.description ?? `Pipeline of ${config.agents.length} agents`,
        run,
    });
}
