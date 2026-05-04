import type { DefinedAgent } from './defined-agent.js';
import type { WorkflowResult } from './types.js';

/**
 * Create a multi-step workflow builder (task / parallel / sequential).
 */
export function createWorkflow(): WorkflowBuilder {
    return new WorkflowBuilder();
}

export interface WorkflowStep {
    type: 'task' | 'parallel' | 'sequential';
    name?: string;
    agent?: DefinedAgent<unknown, unknown>;
    dependencies?: string[];
}

/**
 * Chains `DefinedAgent` steps with optional parallel groups.
 */
export class WorkflowBuilder {
    private steps: WorkflowStep[] = [];

    task(name: string, agent: DefinedAgent<unknown, unknown>): this {
        this.steps.push({ type: 'task', name, agent });
        return this;
    }

    parallel(): this {
        this.steps.push({ type: 'parallel' });
        return this;
    }

    sequential(): this {
        this.steps.push({ type: 'sequential' });
        return this;
    }

    dependsOn(...taskNames: string[]): this {
        const lastStep = this.steps[this.steps.length - 1];
        if (lastStep && lastStep.type === 'task') {
            lastStep.dependencies = taskNames;
        }
        return this;
    }

    build(): Workflow {
        return new Workflow(this.steps);
    }

    async execute(context?: Record<string, unknown>): Promise<WorkflowResult> {
        const workflow = this.build();
        return workflow.execute(context);
    }
}

/**
 * Immutable workflow: execute with shared context and accumulated results.
 */
export class Workflow {
    private steps: WorkflowStep[];

    constructor(steps: WorkflowStep[]) {
        this.steps = steps;
    }

    async execute(context?: Record<string, unknown>): Promise<WorkflowResult> {
        const results: Record<string, unknown> = {};
        let mode: 'sequential' | 'parallel' = 'sequential';
        let parallelBatch: Array<{ name: string; agent: DefinedAgent<unknown, unknown> }> = [];
        const mergedContext = context ?? {};

        const flushParallel = async (): Promise<void> => {
            if (parallelBatch.length === 0) return;
            const batch = parallelBatch;
            parallelBatch = [];
            const batchResults = await Promise.all(
                batch.map(async (task) => {
                    const result = await task.agent.run({
                        input: mergedContext,
                        context: { ...mergedContext, results },
                    });
                    return [task.name, result] as const;
                })
            );
            for (const [name, value] of batchResults) {
                results[name] = value;
            }
        };

        for (const step of this.steps) {
            if (step.type === 'parallel') {
                mode = 'parallel';
                continue;
            }
            if (step.type === 'sequential') {
                await flushParallel();
                mode = 'sequential';
                continue;
            }
            if (step.type === 'task' && step.agent && step.name) {
                if (mode === 'parallel') {
                    parallelBatch.push({ name: step.name, agent: step.agent });
                } else {
                    const result = await step.agent.run({
                        input: mergedContext,
                        context: { ...mergedContext, results },
                    });
                    results[step.name] = result;
                }
            }
        }
        await flushParallel();

        return { results };
    }
}
