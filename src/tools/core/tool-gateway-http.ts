/**
 * Minimal HTTP JSON bridge to invoke framework {@link Tool}s (MCP-like interop, not full MCP spec).
 *
 * Mount behind your own auth / path. Intended for internal tool gateways or quick demos.
 */

import type { Tool } from './types.js';
import type { ToolContext } from './types.js';

export interface ToolGatewayResponse {
    readonly statusCode: number;
    readonly body: Record<string, unknown>;
}

function gatewayContext(toolId: string): ToolContext {
    return {
        toolId,
        agentId: 'tool-gateway',
        sessionId: 'tool-gateway',
        permissions: {
            allowNetwork: true,
            allowFileSystem: true,
            maxExecutionTimeMs: 120_000,
        },
    };
}

/**
 * Dispatch a single logical request:
 * - `GET` + path `/tools` or `/v1/tools` → list tool ids and descriptions
 * - `POST` + path `/invoke` or `/v1/invoke` + JSON `{ "toolId": string, "args": object }` → execute
 */
export async function handleToolGatewayRequest(
    method: string,
    pathname: string,
    rawBody: string | undefined,
    tools: Tool[]
): Promise<ToolGatewayResponse> {
    const path = pathname.split('?')[0] ?? pathname;
    const byId = new Map(tools.map((t) => [t.id, t]));

    if (method === 'GET' && (path === '/tools' || path === '/v1/tools')) {
        return {
            statusCode: 200,
            body: {
                tools: tools.map((t) => ({
                    id: t.id,
                    name: t.name,
                    description: t.description,
                })),
            },
        };
    }

    if (method === 'POST' && (path === '/invoke' || path === '/v1/invoke')) {
        let payload: { toolId?: string; args?: Record<string, unknown> };
        try {
            payload = rawBody ? (JSON.parse(rawBody) as typeof payload) : {};
        } catch {
            return { statusCode: 400, body: { error: 'Invalid JSON body' } };
        }
        const toolId = payload.toolId;
        if (!toolId || typeof toolId !== 'string') {
            return { statusCode: 400, body: { error: 'Missing toolId' } };
        }
        const tool = byId.get(toolId);
        if (!tool) {
            return { statusCode: 404, body: { error: `Unknown tool: ${toolId}` } };
        }
        const args = payload.args && typeof payload.args === 'object' ? payload.args : {};
        try {
            const result = await tool.execute(args as never, gatewayContext(toolId));
            return {
                statusCode: result.success ? 200 : 422,
                body: {
                    success: result.success,
                    data: result.data,
                    error: result.error,
                    executionTimeMs: result.executionTimeMs,
                },
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { statusCode: 500, body: { error: msg } };
        }
    }

    return {
        statusCode: 404,
        body: { error: 'Not found', hint: 'GET /tools or POST /invoke' },
    };
}
