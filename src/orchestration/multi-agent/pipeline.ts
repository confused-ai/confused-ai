/**
 * Pipeline pattern: run agents in sequence, passing output of one as input to the next.
 *
 * Inspired by VoltAgent's pipeline pattern:
 * https://github.com/VoltAgent/voltagent/blob/main/website/blog/2025-07-16-ai-agent-orchestration/index.md
 */

import type { Agent, AgentInput, AgentOutput, AgentContext } from '../core/types.js';
import { AgentState } from '../core/types.js';
import { createRunnableAgent } from '../core/agent-adapter.js';
import { AgentContextBuilder } from '../../core/context-builder.js';
import { InMemoryStore } from '../../memory/in-memory-store.js';
import { ToolRegistryImpl } from '../../tools/core/registry.js';
import { ClassicalPlanner } from '../../planner/classical-planner.js';
import { PlanningAlgorithm } from '../../planner/index.js';

export interface PipelineConfig {
    readonly name: string;
    readonly description?: string;
    /** Agents in execution order; output of step N is passed as input to step N+1 */
    readonly agents: Agent[];
}

/**
 * Creates a pipeline agent that runs the given agents in sequence.
 * Each agent receives the previous agent's output as its input (as JSON in the prompt).
 */
export function createPipeline(config: PipelineConfig): Agent {
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
