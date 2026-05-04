/**
 * MCP Resources + Prompts — client-side extensions and server-side registry.
 *
 * Resources represent data the MCP server can provide (files, DB rows, API responses).
 * Prompts are reusable message templates the server advertises.
 *
 * This module provides:
 *   - `McpResourceRegistry`  — build a resource catalogue for your MCP server
 *   - `McpPromptRegistry`    — build a prompt catalogue for your MCP server
 *   - `McpResourceServerMixin` — extend `McpServerOptions` with resource/prompt handlers
 *   - `McpSamplingClient`    — make sampling requests back to the LLM host
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Resource types ─────────────────────────────────────────────────────────

export interface McpResourceDefinition {
    /** RFC-3986 URI (e.g. "file:///data/readme.md", "db://products?id=42") */
    uri: string;
    name: string;
    description?: string;
    /** MIME type of the resource content */
    mimeType?: string;
    /** Sync or async function returning text or base64 blob */
    read(): Promise<McpResourceContent> | McpResourceContent;
}

export interface McpResourceTemplate {
    /** URI template per RFC-6570, e.g. "db://products/{id}" */
    uriTemplate: string;
    name: string;
    description?: string;
    mimeType?: string;
    /** Resolver called with extracted template variables */
    read(vars: Record<string, string>): Promise<McpResourceContent> | McpResourceContent;
}

export type McpResourceContent =
    | { type: 'text'; text: string }
    | { type: 'blob'; blob: string /* base64 */ };

// ── Prompt types ───────────────────────────────────────────────────────────

export interface McpPromptArgument {
    name: string;
    description?: string;
    required?: boolean;
}

export type McpMessageRole = 'user' | 'assistant';

export interface McpPromptMessage {
    role: McpMessageRole;
    content: McpPromptContent;
}

export type McpPromptContent =
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; resource: { uri: string; text?: string; blob?: string; mimeType?: string } };

export interface McpPromptDefinition {
    name: string;
    description?: string;
    arguments?: McpPromptArgument[];
    /** Returns rendered messages for the given argument values */
    get(args: Record<string, string>): Promise<McpPromptMessage[]> | McpPromptMessage[];
}

// ── Sampling types (server → client) ─────────────────────────────────────

export interface McpSamplingRequest {
    messages: McpPromptMessage[];
    maxTokens: number;
    modelPreferences?: {
        hints?: Array<{ name?: string }>;
        costPriority?: number;
        speedPriority?: number;
        intelligencePriority?: number;
    };
    systemPrompt?: string;
    includeContext?: 'none' | 'thisServer' | 'allServers';
    temperature?: number;
    stopSequences?: string[];
    metadata?: Record<string, unknown>;
}

export interface McpSamplingResult {
    role: 'assistant';
    content: McpPromptContent;
    model: string;
    stopReason?: 'endTurn' | 'maxTokens' | 'stopSequence';
}

// ── McpResourceRegistry ────────────────────────────────────────────────────

/**
 * Catalogue of named resources exposed via an MCP server.
 *
 * @example
 * ```ts
 * const registry = new McpResourceRegistry();
 * registry.add({
 *   uri: 'file:///config/app.json',
 *   name: 'App Config',
 *   mimeType: 'application/json',
 *   read: async () => ({ type: 'text', text: JSON.stringify(config) }),
 * });
 * ```
 */
export class McpResourceRegistry {
    private readonly resources = new Map<string, McpResourceDefinition>();
    private readonly templates: McpResourceTemplate[] = [];
    private changeHandlers: Array<() => void> = [];

    add(resource: McpResourceDefinition): this {
        this.resources.set(resource.uri, resource);
        this.notifyChange();
        return this;
    }

    remove(uri: string): this {
        this.resources.delete(uri);
        this.notifyChange();
        return this;
    }

    addTemplate(template: McpResourceTemplate): this {
        this.templates.push(template);
        return this;
    }

    onListChanged(handler: () => void): () => void {
        this.changeHandlers.push(handler);
        return () => { this.changeHandlers = this.changeHandlers.filter(h => h !== handler); };
    }

    private notifyChange(): void {
        for (const h of this.changeHandlers) h();
    }

    /** Serialize for `resources/list` MCP response */
    list(): Array<{ uri: string; name: string; description?: string; mimeType?: string }> {
        return Array.from(this.resources.values()).map(r => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
        }));
    }

    /** Serialize templates for `resources/templates/list` */
    listTemplates(): Array<{ uriTemplate: string; name: string; description?: string; mimeType?: string }> {
        return this.templates.map(t => ({
            uriTemplate: t.uriTemplate,
            name: t.name,
            description: t.description,
            mimeType: t.mimeType,
        }));
    }

    /** Read a resource; tries exact URI then template matching */
    async read(uri: string): Promise<{ uri: string; mimeType?: string; text?: string; blob?: string }> {
        const exact = this.resources.get(uri);
        if (exact) {
            const content = await exact.read();
            return {
                uri,
                mimeType: exact.mimeType,
                ...(content.type === 'text' ? { text: content.text } : { blob: content.blob }),
            };
        }

        // Try template matching
        for (const tmpl of this.templates) {
            const vars = matchUriTemplate(tmpl.uriTemplate, uri);
            if (vars) {
                const content = await tmpl.read(vars);
                return {
                    uri,
                    mimeType: tmpl.mimeType,
                    ...(content.type === 'text' ? { text: content.text } : { blob: content.blob }),
                };
            }
        }
        throw new Error(`Resource not found: ${uri}`);
    }
}

/** Minimal RFC-6570 Level 1 URI template matcher */
function matchUriTemplate(template: string, uri: string): Record<string, string> | null {
    const varNames: string[] = [];
    const regexStr = template.replace(/\{([^}]+)\}/g, (_, name: string) => {
        varNames.push(name);
        return '([^/?#]+)';
    });
    const match = new RegExp(`^${regexStr}$`).exec(uri);
    if (!match) return null;
    return Object.fromEntries(varNames.map((name, i) => [name, decodeURIComponent(match[i + 1])]));
}

// ── McpPromptRegistry ──────────────────────────────────────────────────────

/**
 * Catalogue of named prompts exposed via an MCP server.
 *
 * @example
 * ```ts
 * const prompts = new McpPromptRegistry();
 * prompts.add({
 *   name: 'summarize',
 *   description: 'Summarise a document',
 *   arguments: [{ name: 'text', required: true }],
 *   get: async ({ text }) => ([
 *     { role: 'user', content: { type: 'text', text: `Summarise: ${text}` } },
 *   ]),
 * });
 * ```
 */
export class McpPromptRegistry {
    private readonly prompts = new Map<string, McpPromptDefinition>();
    private changeHandlers: Array<() => void> = [];

    add(prompt: McpPromptDefinition): this {
        this.prompts.set(prompt.name, prompt);
        this.notifyChange();
        return this;
    }

    remove(name: string): this {
        this.prompts.delete(name);
        this.notifyChange();
        return this;
    }

    onListChanged(handler: () => void): () => void {
        this.changeHandlers.push(handler);
        return () => { this.changeHandlers = this.changeHandlers.filter(h => h !== handler); };
    }

    private notifyChange(): void {
        for (const h of this.changeHandlers) h();
    }

    list(): Array<{ name: string; description?: string; arguments?: McpPromptArgument[] }> {
        return Array.from(this.prompts.values()).map(p => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments,
        }));
    }

    async get(name: string, args: Record<string, string>): Promise<{
        description?: string;
        messages: McpPromptMessage[];
    }> {
        const prompt = this.prompts.get(name);
        if (!prompt) throw new Error(`Prompt not found: ${name}`);
        const messages = await prompt.get(args);
        return { description: prompt.description, messages };
    }
}

// ── McpSamplingClient ──────────────────────────────────────────────────────

/**
 * Allows an MCP server to send `sampling/createMessage` requests back to the
 * connected MCP client (the LLM host).  Not all clients support sampling.
 *
 * This is a low-level client intended to be used _inside_ an MCP server handler
 * when it needs to ask the model a question during tool execution.
 */
export class McpSamplingClient {
    private readonly serverUrl: string;
    private readonly headers: Record<string, string>;
    private idCounter = 0;

    constructor(serverUrl: string, headers: Record<string, string> = {}) {
        this.serverUrl = serverUrl;
        this.headers = { 'content-type': 'application/json', ...headers };
    }

    async createMessage(request: McpSamplingRequest): Promise<McpSamplingResult> {
        const id = ++this.idCounter;
        const res = await fetch(this.serverUrl, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                method: 'sampling/createMessage',
                params: {
                    messages: request.messages,
                    maxTokens: request.maxTokens,
                    modelPreferences: request.modelPreferences,
                    systemPrompt: request.systemPrompt,
                    includeContext: request.includeContext ?? 'none',
                    temperature: request.temperature,
                    stopSequences: request.stopSequences,
                    metadata: request.metadata,
                },
            }),
        });
        if (!res.ok) throw new Error(`MCP sampling HTTP ${res.status}: ${await res.text()}`);
        const body = await res.json() as { result?: McpSamplingResult; error?: { code: number; message: string } };
        if (body.error) throw new Error(`MCP sampling ${body.error.code}: ${body.error.message}`);
        return body.result!;
    }
}

// ── Completion (autocomplete) provider ────────────────────────────────────

export interface McpCompletionProvider {
    complete(ref: { type: string; name?: string; uri?: string }, argument: { name: string; value: string }): Promise<{
        values: string[];
        total?: number;
        hasMore?: boolean;
    }>;
}

// ── McpCapabilityHandler — attach to existing McpHttpServer via middleware ──

/**
 * Processes resources/list, resources/read, resources/templates/list,
 * prompts/list, prompts/get, and sampling/createMessage methods.
 *
 * Designed to be called from an HTTP handler _before_ the standard tool dispatch,
 * returning `null` if the method is not handled here (fall through to tool dispatch).
 *
 * @example
 * ```ts
 * const caps = new McpCapabilityHandler(resourceRegistry, promptRegistry);
 * // In your request handler:
 * const handled = await caps.handle(method, params);
 * if (handled !== null) return success(id, handled);
 * // else: standard tools/list, tools/call …
 * ```
 */
export class McpCapabilityHandler {
    constructor(
        private readonly resources?: McpResourceRegistry,
        private readonly prompts?: McpPromptRegistry,
        private readonly completions?: McpCompletionProvider,
    ) {}

    /** Returns the result object if handled, or null to pass through */
    async handle(method: string, params: unknown): Promise<unknown> {
        const p = (params ?? {}) as Record<string, unknown>;
        switch (method) {
            case 'resources/list':
                if (!this.resources) return null;
                return { resources: this.resources.list() };

            case 'resources/templates/list':
                if (!this.resources) return null;
                return { resourceTemplates: this.resources.listTemplates() };

            case 'resources/read': {
                if (!this.resources) return null;
                const uri = p['uri'] as string;
                if (!uri) throw new Error('resources/read: missing uri');
                const content = await this.resources.read(uri);
                return { contents: [content] };
            }

            case 'resources/subscribe':
            case 'resources/unsubscribe':
                // Acknowledge — caller must implement push via SSE channel
                return {};

            case 'prompts/list':
                if (!this.prompts) return null;
                return { prompts: this.prompts.list() };

            case 'prompts/get': {
                if (!this.prompts) return null;
                const name = p['name'] as string;
                const args = (p['arguments'] ?? {}) as Record<string, string>;
                return this.prompts.get(name, args);
            }

            case 'completion/complete': {
                if (!this.completions) return null;
                const ref = p['ref'] as { type: string; name?: string; uri?: string };
                const arg = p['argument'] as { name: string; value: string };
                const completion = await this.completions.complete(ref, arg);
                return { completion };
            }

            default:
                return null;
        }
    }
}

// ── Capabilities advertisement ─────────────────────────────────────────────

export function buildServerCapabilities(opts: {
    hasResources?: boolean;
    hasPrompts?: boolean;
    hasSampling?: boolean;
    hasCompletions?: boolean;
}): Record<string, unknown> {
    const caps: Record<string, unknown> = { tools: {} };
    if (opts.hasResources) caps['resources'] = { subscribe: true, listChanged: true };
    if (opts.hasPrompts) caps['prompts'] = { listChanged: true };
    if (opts.hasSampling) caps['sampling'] = {};
    if (opts.hasCompletions) caps['completions'] = {};
    return caps;
}

// ── SSE notification emitter ──────────────────────────────────────────────

/**
 * Small helper to push JSON-RPC notifications to a live SSE response.
 * Meant to be used inside your HTTP request handler that serves GET /mcp.
 *
 * @example
 * ```ts
 * const emitter = new McpSseEmitter(res);
 * emitter.sendNotification('notifications/resources/updated', { uri });
 * ```
 */
export class McpSseEmitter {
    private readonly res: ServerResponse;

    constructor(res: ServerResponse) {
        this.res = res;
        res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
        });
    }

    sendNotification(method: string, params?: unknown): void {
        const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
        this.res.write(`data: ${payload}\n\n`);
    }

    sendResponse(id: string | number | null, result: unknown): void {
        const payload = JSON.stringify({ jsonrpc: '2.0', id, result });
        this.res.write(`data: ${payload}\n\n`);
    }

    sendError(id: string | number | null, code: number, message: string): void {
        const payload = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
        this.res.write(`data: ${payload}\n\n`);
    }

    end(): void {
        this.res.end();
    }
}

// Re-export for convenience
export type { IncomingMessage, ServerResponse };
