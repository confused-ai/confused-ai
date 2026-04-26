/**
 * Toolkit: named set of tools (100+ built-in style).
 * Bundle tools for reuse across agents; compatible with MCP/A2A.
 */

import type { Tool } from '../../tools/core/types.js';
import type { ToolRegistry } from '../../tools/core/types.js';
import { ToolRegistryImpl } from '../../tools/core/registry.js';

export interface Toolkit {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly version?: string;
    /** Tools in this toolkit */
    readonly tools: Tool[];
    /** Optional: get tools lazily (e.g. from MCP server) */
    getTools?(): Tool[] | Promise<Tool[]>;
}

/** Create a toolkit from a list of tools */
export function createToolkit(
    name: string,
    tools: Tool[],
    options?: { id?: string; description?: string; version?: string }
): Toolkit {
    return {
        id: options?.id ?? `toolkit-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name,
        description: options?.description ?? `${name} tools`,
        version: options?.version,
        tools,
    };
}

/** Flatten one or more toolkits (and/or Tool[]) into a single ToolRegistry */
export function toolkitsToRegistry(input: (Toolkit | Tool)[]): ToolRegistry {
    const reg = new ToolRegistryImpl();
    for (const item of input) {
        if ('tools' in item && Array.isArray(item.tools)) {
            for (const t of item.tools) reg.register(t);
        } else if ('execute' in item && 'validate' in item) {
            reg.register(item as Tool);
        }
    }
    return reg;
}
