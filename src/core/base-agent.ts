/**
 * Base agent implementation
 */

import {
    Agent,
    AgentConfig,
    AgentContext,
    AgentInput,
    AgentOutput,
    AgentState,
    ExecutionMetadata,
} from './types.js';
import { DebugLogger, createDebugLogger } from '../shared/debug-logger.js';

/**
 * Abstract base class providing common agent functionality
 */
export abstract class BaseAgent extends Agent {
    protected startTime?: Date;
    protected iterationCount = 0;
    protected logger: DebugLogger;

    constructor(config: AgentConfig) {
        super(config);
        this.logger = createDebugLogger(`Agent:${this.name}`, config.debug ?? false);
    }

    /**
     * Main execution method with lifecycle hooks
     */
    async run(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
        this.startTime = new Date();
        this.iterationCount = 0;

        this.logger.logStart('Agent execution', {
            agentId: this.id,
            prompt: input.prompt.slice(0, 100),
        });

        try {
            // Before execution hook
            if (this.hooks.beforeExecution) {
                this.logger.debug('Running beforeExecution hook');
                await this.hooks.beforeExecution(input, ctx);
            }

            // Set state to planning
            this.logger.logStateChange('Agent', this.state, AgentState.PLANNING);
            await this.setState(AgentState.PLANNING, ctx);

            // Execute the agent-specific logic
            this.logger.debug('Executing agent logic');
            const result = await this.execute(input, ctx);

            // Set state to completed
            this.logger.logStateChange('Agent', this.state, AgentState.COMPLETED);
            await this.setState(AgentState.COMPLETED, ctx);

            const output = this.createOutput(result, AgentState.COMPLETED);

            // After execution hook
            if (this.hooks.afterExecution) {
                this.logger.debug('Running afterExecution hook');
                await this.hooks.afterExecution(output, ctx);
            }

            this.logger.logComplete('Agent execution', output.metadata?.durationMs);
            return output;
        } catch (error) {
            // Set state to failed
            this.logger.logStateChange('Agent', this.state, AgentState.FAILED);
            await this.setState(AgentState.FAILED, ctx);

            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Agent execution failed', undefined, { error: errorMessage });

            const errorOutput = this.createOutput(errorMessage, AgentState.FAILED);

            // Error hook
            if (this.hooks.onError) {
                await this.hooks.onError(error instanceof Error ? error : new Error(errorMessage), ctx);
            }

            return errorOutput;
        }
    }

    /**
     * Execute the agent's core logic - must be implemented by subclasses
     */
    protected abstract execute(input: AgentInput, ctx: AgentContext): Promise<unknown>;

    /**
     * Increment iteration counter
     */
    protected incrementIteration(): void {
        this.iterationCount++;
    }

    /**
     * Check if max iterations reached
     */
    protected isMaxIterationsReached(): boolean {
        if (!this.config.maxIterations) return false;
        return this.iterationCount >= this.config.maxIterations;
    }

    /**
     * Create an agent output with metadata
     */
    protected createOutput(result: unknown, state: AgentState): AgentOutput {
        const endTime = new Date();
        const startTime = this.startTime ?? endTime;
        const durationMs = endTime.getTime() - startTime.getTime();

        const metadata: ExecutionMetadata = {
            startTime,
            endTime,
            durationMs,
            iterations: this.iterationCount,
        };

        return {
            result,
            state,
            metadata,
        };
    }

    /**
     * Check if agent is currently executing
     */
    isExecuting(): boolean {
        return this.state === AgentState.EXECUTING || this.state === AgentState.PLANNING;
    }

    /**
     * Check if agent has completed
     */
    isCompleted(): boolean {
        return this.state === AgentState.COMPLETED;
    }

    /**
     * Check if agent has failed
     */
    hasFailed(): boolean {
        return this.state === AgentState.FAILED;
    }
}