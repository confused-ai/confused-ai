/**
 * Base agent implementation
 */

import {
    Agent,
    AgentConfig,
    AgentContext,
    AgentHooks,
    AgentInput,
    AgentLifecycleHooks,
    AgentOutput,
    AgentRunOptions,
    AgentRunResult,
    AgentState,
    EntityId,
    ExecutionMetadata,
    Message,
    MultiModalInput,
    StreamChunk,
} from './types.js';
import { generateEntityId } from './types.js';
import { DebugLogger, createDebugLogger } from '../shared/index.js';

/**
 * Abstract base class providing common agent functionality
 */
export abstract class BaseAgent implements Agent {
    readonly id: EntityId;
    name: string;
    instructions: string = '';
    state: AgentState = AgentState.IDLE;
    readonly config: AgentConfig;
    readonly hooks: AgentHooks;
    protected startTime?: Date;
    protected iterationCount = 0;
    protected logger: DebugLogger;

    constructor(config: AgentConfig) {
        this.config = config;
        this.id = config.id ?? generateEntityId();
        this.name = config.name;
        this.hooks = {};
        this.logger = createDebugLogger(`Agent:${this.name}`, config.debug ?? false);
    }

    async setState(newState: AgentState, _ctx: AgentContext): Promise<void> {
        const old = this.state;
        this.state = newState;
        if (this.hooks.onStateChange) await this.hooks.onStateChange(old, newState, _ctx);
    }

    // These must be implemented by concrete subclasses (Agent interface)
    abstract run(prompt: string | MultiModalInput, options?: AgentRunOptions): Promise<AgentRunResult>;
    abstract stream(prompt: string | MultiModalInput, options?: Omit<AgentRunOptions, 'onChunk'>): AsyncIterable<string>;
    abstract streamEvents(prompt: string | MultiModalInput, options?: Omit<AgentRunOptions, 'onChunk'>): AsyncIterable<StreamChunk>;
    abstract createSession(userId?: string): Promise<string>;
    abstract getSessionMessages(sessionId: string): Promise<Message[]>;
    abstract withSession(sessionId: string): { run: BaseAgent['run']; stream: BaseAgent['stream']; streamEvents: BaseAgent['streamEvents'] };

    /**
     * Internal execution method with lifecycle hooks (contracts-level AgentInput/AgentOutput).
     * Subclasses that use the older AgentInput/AgentOutput contract should call this.
     */
    async runWithContext(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
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