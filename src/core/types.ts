/**
 * Core types and interfaces for the Agent Framework
 */

import type { MemoryStore } from '../memory/types.js';
import type { ToolRegistry } from '../tools/core/types.js';
import type { Planner } from '../planner/types.js';

/**
 * Unique identifier for agents, tasks, and other entities
 */
export type EntityId = string;

/**
 * Agent execution state
 */
export enum AgentState {
    IDLE = 'idle',
    PLANNING = 'planning',
    EXECUTING = 'executing',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

/**
 * Context provided to agents during execution
 */
export interface AgentContext {
    readonly agentId: EntityId;
    readonly memory: MemoryStore;
    readonly tools: ToolRegistry;
    /** Planner is optional — omit for pure reactive/agentic agents that don't need planning */
    readonly planner?: Planner;
    readonly metadata: Record<string, unknown>;
}

/**
 * Configuration for creating an agent
 */
export interface AgentConfig {
    readonly id?: EntityId;
    readonly name: string;
    readonly description?: string;
    readonly persona?: string;
    readonly maxIterations?: number;
    readonly timeoutMs?: number;
    /** Enable debug logging for this agent */
    readonly debug?: boolean;
}

/**
 * Input to an agent execution
 */
export interface AgentInput {
    readonly prompt: string;
    readonly context?: Record<string, unknown>;
    readonly attachments?: Attachment[];
}

/**
 * Output from an agent execution
 */
export interface AgentOutput {
    readonly result: unknown;
    readonly state: AgentState;
    readonly metadata: ExecutionMetadata;
}

/**
 * Attachment for agent input/output
 */
export interface Attachment {
    readonly id: EntityId;
    readonly type: string;
    readonly content: unknown;
    readonly metadata?: Record<string, unknown>;
}

/**
 * Execution metadata
 */
export interface ExecutionMetadata {
    readonly startTime: Date;
    readonly endTime?: Date;
    readonly durationMs?: number;
    readonly iterations: number;
    readonly tokensUsed?: number;
    readonly cost?: number;
}

/**
 * Hook for agent lifecycle events
 */
export interface AgentHooks {
    beforeExecution?: (input: AgentInput, ctx: AgentContext) => Promise<void> | void;
    afterExecution?: (output: AgentOutput, ctx: AgentContext) => Promise<void> | void;
    onError?: (error: Error, ctx: AgentContext) => Promise<void> | void;
    onStateChange?: (oldState: AgentState, newState: AgentState, ctx: AgentContext) => Promise<void> | void;
}

/**
 * Abstract base class for all agents
 */
export abstract class Agent {
    readonly id: EntityId;
    readonly name: string;
    readonly description: string;
    readonly persona?: string;
    readonly config: AgentConfig;
    protected state: AgentState = AgentState.IDLE;
    protected hooks: AgentHooks = {};

    constructor(config: AgentConfig) {
        this.config = config;
        this.id = config.id ?? generateId();
        this.name = config.name;
        this.description = config.description ?? '';
        this.persona = config.persona;
    }

    /**
     * Execute the agent with the given input and context
     */
    abstract run(input: AgentInput, ctx: AgentContext): Promise<AgentOutput>;

    /**
     * Get current agent state
     */
    getState(): AgentState {
        return this.state;
    }

    /**
     * Set lifecycle hooks
     */
    setHooks(hooks: AgentHooks): void {
        this.hooks = hooks;
    }

    /**
     * Update agent state with hook notification
     */
    protected async setState(newState: AgentState, ctx: AgentContext): Promise<void> {
        const oldState = this.state;
        this.state = newState;
        if (this.hooks.onStateChange) {
            await this.hooks.onStateChange(oldState, newState, ctx);
        }
    }
}

/**
 * Generate a unique identifier
 */
function generateId(): EntityId {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}