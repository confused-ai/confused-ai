/**
 * Agent context builder for fluent context creation
 */

import {
    AgentContext,
    EntityId,
} from './types.js';
import type { MemoryStore } from '../memory/types.js';
import type { ToolRegistry } from '../tools/core/types.js';
import type { Planner } from '../planner/types.js';
import { InMemoryStore } from '../memory/in-memory-store.js';
import { ToolRegistryImpl } from '../tools/core/registry.js';

/**
 * Builder for creating AgentContext instances
 */
export class AgentContextBuilder {
    private agentId: EntityId = `agent-${Date.now()}`;
    private memory?: MemoryStore;
    private tools?: ToolRegistry;
    private planner?: Planner;
    private metadata: Record<string, unknown> = {};

    /**
     * Set the agent ID
     */
    withAgentId(agentId: EntityId): this {
        this.agentId = agentId;
        return this;
    }

    /**
     * Set the memory store
     */
    withMemory(memory: MemoryStore): this {
        this.memory = memory;
        return this;
    }

    /**
     * Set the tool registry
     */
    withTools(tools: ToolRegistry): this {
        this.tools = tools;
        return this;
    }

    /**
     * Set the planner
     */
    withPlanner(planner: Planner): this {
        this.planner = planner;
        return this;
    }

    /**
     * Add metadata
     */
    withMetadata(key: string, value: unknown): this {
        this.metadata[key] = value;
        return this;
    }

    /**
     * Add multiple metadata entries
     */
    withMetadataEntries(entries: Record<string, unknown>): this {
        this.metadata = { ...this.metadata, ...entries };
        return this;
    }

    /**
     * Build the AgentContext.
     *
     * Defaults:
     * - memory → InMemoryStore (auto-created if not set)
     * - tools  → empty ToolRegistryImpl (auto-created if not set)
     * - planner → undefined (optional; omit for reactive/agentic agents)
     */
    build(): AgentContext {
        return {
            agentId: this.agentId,
            memory: this.memory ?? new InMemoryStore(),
            tools: this.tools ?? new ToolRegistryImpl(),
            ...(this.planner !== undefined && { planner: this.planner }),
            metadata: { ...this.metadata },
        };
    }

    /**
     * Create a builder from an existing context
     */
    static fromContext(context: AgentContext): AgentContextBuilder {
        const builder = new AgentContextBuilder();
        builder.agentId = context.agentId;
        builder.memory = context.memory;
        builder.tools = context.tools;
        builder.planner = context.planner;
        builder.metadata = { ...context.metadata };
        return builder;
    }
}