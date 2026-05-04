/**
 * MCP (Model Context Protocol) type interfaces — inlined to avoid circular dependency.
 * These are the canonical MCP interfaces shared by client, server, and transport.
 */

import type { Tool } from '../core/types.js';

/** MCP tool descriptor (from MCP server) */
export interface MCPToolDescriptor {
    readonly name: string;
    readonly description?: string;
    readonly inputSchema?: Record<string, unknown>;
}

/** MCP client: connect to an MCP server and expose tools to the agent registry */
export interface MCPClient {
    /** List tools offered by the MCP server */
    listTools(): Promise<MCPToolDescriptor[]>;

    /** Call a tool by name with arguments */
    callTool(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text?: string }> }>;

    /** Optional: get framework Tool adapters for registry */
    getTools?(): Promise<Tool[]>;

    /** Disconnect / cleanup */
    disconnect?(): Promise<void>;
}

/** MCP server adapter: expose framework tools via MCP protocol */
export interface MCPServerAdapter {
    /** Start serving (e.g. stdio or HTTP) */
    start(): Promise<void>;

    /** Stop serving */
    stop(): Promise<void>;

    /** Register a tool to expose */
    registerTool(tool: Tool): void;
}
