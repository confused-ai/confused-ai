/**
 * MCP (Model Context Protocol) and A2A (Agent-to-Agent) support.
 * First-class integration for external tools and cross-agent communication.
 */

import type { Tool } from '@confused-ai/tools';

/** MCP tool descriptor (from MCP server) */
export interface MCPToolDescriptor {
    readonly name: string;
    readonly description?: string;
    readonly inputSchema?: Record<string, unknown>;
}

/** MCP client: connect to an MCP server and expose tools to the agent */
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

/** MCP server adapter: expose framework tools via MCP (for external clients) */
export interface MCPServerAdapter {
    /** Start serving (e.g. stdio or HTTP) */
    start(): Promise<void>;

    /** Stop serving */
    stop(): Promise<void>;

    /** Register a tool to expose */
    registerTool(tool: Tool): void;
}

/**
 * Lightweight A2A message for internal MCP cross-agent communication.
 * The full A2A protocol types (Google A2A spec) are in ./a2a/types.ts.
 */
export interface MCPAgentMessage {
    readonly id: string;
    readonly from: string;
    readonly to: string | string[];
    readonly type: 'request' | 'response' | 'event';
    readonly payload: unknown;
    readonly timestamp: Date;
    readonly correlationId?: string;
}

/** MCP client for sending/receiving agent messages. */
export interface MCPAgentClient {
    send(message: Omit<MCPAgentMessage, 'id' | 'timestamp'>): Promise<MCPAgentMessage>;
    subscribe(agentId: string, handler: (msg: MCPAgentMessage) => void | Promise<void>): () => void;
}
