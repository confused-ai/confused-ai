/**
 * Tool registry implementation and tool provider helpers.
 */

import { ToolRegistry, Tool, ToolCategory } from './types.js';
import type { EntityId } from '../../core/types.js';

/** Pass an array or registry when configuring agents. */
export type ToolProvider = Tool[] | ToolRegistry;

/** Normalize tools to a ToolRegistry (extensible: plug any tools). */
export function toToolRegistry(tools: ToolProvider): ToolRegistry {
    if (Array.isArray(tools)) {
        const reg = new ToolRegistryImpl();
        for (const t of tools) reg.register(t);
        return reg;
    }
    return tools;
}

/**
 * Implementation of ToolRegistry
 */
export class ToolRegistryImpl implements ToolRegistry {
    private tools: Map<EntityId, Tool> = new Map();
    private nameIndex: Map<string, EntityId> = new Map();
    // Inverted index: category → Set<EntityId> for O(1) listByCategory
    private categoryIndex: Map<ToolCategory, Set<EntityId>> = new Map();

    /**
     * Register a tool
     */
    register(tool: Tool): void {
        if (this.tools.has(tool.id)) {
            throw new Error(`Tool with ID ${tool.id} is already registered`);
        }

        if (this.nameIndex.has(tool.name)) {
            throw new Error(`Tool with name ${tool.name} is already registered`);
        }

        this.tools.set(tool.id, tool);
        this.nameIndex.set(tool.name, tool.id);

        // Update category index
        if (tool.category) {
            const catSet = this.categoryIndex.get(tool.category) ?? new Set<EntityId>();
            catSet.add(tool.id);
            this.categoryIndex.set(tool.category, catSet);
        }
    }

    /**
     * Unregister a tool by ID
     */
    unregister(toolId: EntityId): boolean {
        const tool = this.tools.get(toolId);
        if (!tool) {
            return false;
        }

        this.tools.delete(toolId);
        this.nameIndex.delete(tool.name);

        // Update category index
        if (tool.category) {
            this.categoryIndex.get(tool.category)?.delete(toolId);
        }

        return true;
    }

    /**
     * Get a tool by ID
     */
    get(toolId: EntityId): Tool | undefined {
        return this.tools.get(toolId);
    }

    /**
     * Get a tool by name
     */
    getByName(name: string): Tool | undefined {
        const id = this.nameIndex.get(name);
        if (!id) {
            return undefined;
        }
        return this.tools.get(id);
    }

    /**
     * List all registered tools
     */
    list(): Tool[] {
        return Array.from(this.tools.values());
    }

    /**
     * List tools by category
     */
    listByCategory(category: ToolCategory): Tool[] {
        const ids = this.categoryIndex.get(category);
        if (!ids) return [];
        const result: Tool[] = [];
        for (const id of ids) {
            const tool = this.tools.get(id);
            if (tool) result.push(tool);
        }
        return result;
    }

    /**
     * Search tools by name or description
     */
    search(query: string): Tool[] {
        const lowerQuery = query.toLowerCase();
        return this.list().filter(
            tool =>
                tool.name.toLowerCase().includes(lowerQuery) ||
                tool.description.toLowerCase().includes(lowerQuery) ||
                (tool.tags?.some(tag => tag.toLowerCase().includes(lowerQuery)) ?? false)
        );
    }

    /**
     * Check if a tool is registered
     */
    has(toolId: EntityId): boolean {
        return this.tools.has(toolId);
    }

    /**
     * Check if a tool name is registered
     */
    hasName(name: string): boolean {
        return this.nameIndex.has(name);
    }

    /**
     * Clear all registered tools
     */
    clear(): void {
        this.tools.clear();
        this.nameIndex.clear();
        this.categoryIndex.clear();
    }

    /**
     * Get the number of registered tools
     */
    size(): number {
        return this.tools.size;
    }
}