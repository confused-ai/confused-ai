/**
 * Zep — Production-ready memory for AI agents
 *
 * API docs: https://help.getzep.com/
 * Env vars: ZEP_API_KEY, ZEP_BASE_URL (optional; defaults to cloud API)
 */

import { z } from 'zod';
import { BaseTool, type BaseToolConfig } from '../core/base-tool.js';
import { ToolCategory } from '../core/types.js';

// ── Config ─────────────────────────────────────────────────────────────────

export interface ZepConfig {
    apiKey?: string;
    /** Override for self-hosted deployments, e.g. http://localhost:8000 */
    baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.getzep.com';

function getKey(config?: ZepConfig): string {
    const key = config?.apiKey ?? process.env['ZEP_API_KEY'];
    if (!key) throw new Error('Zep: ZEP_API_KEY is required');
    return key;
}

function base(config?: ZepConfig): string {
    return (config?.baseUrl ?? process.env['ZEP_BASE_URL'] ?? DEFAULT_BASE).replace(/\/$/, '');
}

function headers(key: string): Record<string, string> {
    return { Authorization: `Api-Key ${key}`, 'Content-Type': 'application/json' };
}

// ── Add memory (append messages to a session) ──────────────────────────────

const AddMemorySchema = z.object({
    session_id: z.string().describe('Session ID to add messages to'),
    messages: z.array(z.object({
        role: z.string().describe('Participant role, e.g. "user" or "assistant"'),
        role_type: z.enum(['user', 'assistant', 'system', 'tool']).optional(),
        content: z.string().describe('Message text content'),
        metadata: z.record(z.string(), z.unknown()).optional(),
    })).describe('Messages to add to the session memory'),
});

type AddMemoryInput = z.infer<typeof AddMemorySchema>;

export class ZepAddMemoryTool extends BaseTool<typeof AddMemorySchema, string> {
    private readonly config: ZepConfig;
    constructor(config?: ZepConfig) {
        const cfg: BaseToolConfig<typeof AddMemorySchema> = {
            name: 'zep_add_memory',
            description: 'Add messages to a Zep session (long-term memory)',
            parameters: AddMemorySchema,
            category: ToolCategory.AI,
        };
        super(cfg);
        this.config = config ?? {};
    }

    protected async performExecute(input: AddMemoryInput): Promise<string> {
        const key = getKey(this.config);
        const url = `${base(this.config)}/api/v2/sessions/${input.session_id}/memory`;
        const res = await fetch(url, {
            method: 'POST',
            headers: headers(key),
            body: JSON.stringify({ messages: input.messages }),
        });
        if (!res.ok) throw new Error(`Zep add memory error ${res.status}: ${await res.text()}`);
        const data = await res.json() as unknown;
        return JSON.stringify(data);
    }
}

// ── Get memory ─────────────────────────────────────────────────────────────

const GetMemorySchema = z.object({
    session_id: z.string().describe('Session ID to retrieve memory for'),
    lastn: z.number().int().min(1).optional().describe('Last N messages to retrieve'),
    memory_type: z.enum(['perpetual', 'summary_retriever', 'message_window']).optional()
        .describe('Memory type to retrieve'),
});

type GetMemoryInput = z.infer<typeof GetMemorySchema>;

export class ZepGetMemoryTool extends BaseTool<typeof GetMemorySchema, string> {
    private readonly config: ZepConfig;
    constructor(config?: ZepConfig) {
        const cfg: BaseToolConfig<typeof GetMemorySchema> = {
            name: 'zep_get_memory',
            description: 'Retrieve memory for a Zep session (messages, facts, summaries)',
            parameters: GetMemorySchema,
            category: ToolCategory.AI,
        };
        super(cfg);
        this.config = config ?? {};
    }

    protected async performExecute(input: GetMemoryInput): Promise<string> {
        const key = getKey(this.config);
        const qs = new URLSearchParams();
        if (input.lastn !== undefined) qs.set('lastn', String(input.lastn));
        if (input.memory_type) qs.set('memoryType', input.memory_type);
        const query = qs.toString() ? `?${qs.toString()}` : '';
        const res = await fetch(`${base(this.config)}/api/v2/sessions/${input.session_id}/memory${query}`, {
            headers: headers(key),
        });
        if (!res.ok) throw new Error(`Zep get memory error ${res.status}: ${await res.text()}`);
        const data = await res.json() as unknown;
        return JSON.stringify(data);
    }
}

// ── Search memory ──────────────────────────────────────────────────────────

const SearchMemorySchema = z.object({
    session_id: z.string().describe('Session ID to search within'),
    text: z.string().describe('Search query text'),
    limit: z.number().int().min(1).max(100).default(5).describe('Max results'),
    search_type: z.enum(['similarity', 'mmr']).default('similarity')
        .describe('Search algorithm: similarity or maximal marginal relevance'),
    search_scope: z.enum(['messages', 'summary', 'facts']).optional()
        .describe('Restrict search to messages, summaries, or facts'),
});

type SearchMemoryInput = z.infer<typeof SearchMemorySchema>;

export class ZepSearchMemoryTool extends BaseTool<typeof SearchMemorySchema, string> {
    private readonly config: ZepConfig;
    constructor(config?: ZepConfig) {
        const cfg: BaseToolConfig<typeof SearchMemorySchema> = {
            name: 'zep_search_memory',
            description: 'Semantically search Zep session memory for relevant messages or facts',
            parameters: SearchMemorySchema,
            category: ToolCategory.AI,
        };
        super(cfg);
        this.config = config ?? {};
    }

    protected async performExecute(input: SearchMemoryInput): Promise<string> {
        const key = getKey(this.config);
        const url = `${base(this.config)}/api/v2/sessions/${input.session_id}/search`;
        const body: Record<string, unknown> = {
            text: input.text,
            limit: input.limit,
            search_type: input.search_type,
        };
        if (input.search_scope) body['search_scope'] = input.search_scope;
        const res = await fetch(url, {
            method: 'POST',
            headers: headers(key),
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Zep search memory error ${res.status}: ${await res.text()}`);
        const data = await res.json() as unknown;
        return JSON.stringify(data);
    }
}

// ── Delete memory ──────────────────────────────────────────────────────────

const DeleteMemorySchema = z.object({
    session_id: z.string().describe('Session ID whose memory should be deleted'),
});

type DeleteMemoryInput = z.infer<typeof DeleteMemorySchema>;

export class ZepDeleteMemoryTool extends BaseTool<typeof DeleteMemorySchema, string> {
    private readonly config: ZepConfig;
    constructor(config?: ZepConfig) {
        const cfg: BaseToolConfig<typeof DeleteMemorySchema> = {
            name: 'zep_delete_memory',
            description: 'Delete all memory for a Zep session',
            parameters: DeleteMemorySchema,
            category: ToolCategory.AI,
        };
        super(cfg);
        this.config = config ?? {};
    }

    protected async performExecute(input: DeleteMemoryInput): Promise<string> {
        const key = getKey(this.config);
        const res = await fetch(`${base(this.config)}/api/v2/sessions/${input.session_id}/memory`, {
            method: 'DELETE',
            headers: headers(key),
        });
        if (!res.ok) throw new Error(`Zep delete memory error ${res.status}: ${await res.text()}`);
        return `Memory for session ${input.session_id} deleted`;
    }
}

// ── Session operations ─────────────────────────────────────────────────────

const CreateSessionSchema = z.object({
    session_id: z.string().describe('Unique session identifier'),
    user_id: z.string().optional().describe('Associate session with a user'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Session metadata'),
});

type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

export class ZepCreateSessionTool extends BaseTool<typeof CreateSessionSchema, string> {
    private readonly config: ZepConfig;
    constructor(config?: ZepConfig) {
        const cfg: BaseToolConfig<typeof CreateSessionSchema> = {
            name: 'zep_create_session',
            description: 'Create a new Zep memory session',
            parameters: CreateSessionSchema,
            category: ToolCategory.AI,
        };
        super(cfg);
        this.config = config ?? {};
    }

    protected async performExecute(input: CreateSessionInput): Promise<string> {
        const key = getKey(this.config);
        const url = `${base(this.config)}/api/v2/sessions`;
        const body: Record<string, unknown> = { session_id: input.session_id };
        if (input.user_id) body['user_id'] = input.user_id;
        if (input.metadata) body['metadata'] = input.metadata;
        const res = await fetch(url, {
            method: 'POST',
            headers: headers(key),
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Zep create session error ${res.status}: ${await res.text()}`);
        const data = await res.json() as unknown;
        return JSON.stringify(data);
    }
}

const GetSessionSchema = z.object({
    session_id: z.string().describe('Session ID to retrieve'),
});

type GetSessionInput = z.infer<typeof GetSessionSchema>;

export class ZepGetSessionTool extends BaseTool<typeof GetSessionSchema, string> {
    private readonly config: ZepConfig;
    constructor(config?: ZepConfig) {
        const cfg: BaseToolConfig<typeof GetSessionSchema> = {
            name: 'zep_get_session',
            description: 'Get details about a Zep session, including summary and fact count',
            parameters: GetSessionSchema,
            category: ToolCategory.AI,
        };
        super(cfg);
        this.config = config ?? {};
    }

    protected async performExecute(input: GetSessionInput): Promise<string> {
        const key = getKey(this.config);
        const res = await fetch(`${base(this.config)}/api/v2/sessions/${input.session_id}`, {
            headers: headers(key),
        });
        if (!res.ok) throw new Error(`Zep get session error ${res.status}: ${await res.text()}`);
        const data = await res.json() as unknown;
        return JSON.stringify(data);
    }
}

// ── User operations ────────────────────────────────────────────────────────

const GetUserSchema = z.object({
    user_id: z.string().describe('Zep user ID'),
});

type GetUserInput = z.infer<typeof GetUserSchema>;

export class ZepGetUserTool extends BaseTool<typeof GetUserSchema, string> {
    private readonly config: ZepConfig;
    constructor(config?: ZepConfig) {
        const cfg: BaseToolConfig<typeof GetUserSchema> = {
            name: 'zep_get_user',
            description: 'Get a Zep user record, including their long-term facts',
            parameters: GetUserSchema,
            category: ToolCategory.AI,
        };
        super(cfg);
        this.config = config ?? {};
    }

    protected async performExecute(input: GetUserInput): Promise<string> {
        const key = getKey(this.config);
        const res = await fetch(`${base(this.config)}/api/v2/users/${input.user_id}`, {
            headers: headers(key),
        });
        if (!res.ok) throw new Error(`Zep get user error ${res.status}: ${await res.text()}`);
        const data = await res.json() as unknown;
        return JSON.stringify(data);
    }
}

const SearchUserFactsSchema = z.object({
    user_id: z.string().describe('Zep user ID'),
    text: z.string().describe('Search query'),
    limit: z.number().int().min(1).max(50).default(5).describe('Max results'),
});

type SearchUserFactsInput = z.infer<typeof SearchUserFactsSchema>;

export class ZepSearchUserFactsTool extends BaseTool<typeof SearchUserFactsSchema, string> {
    private readonly config: ZepConfig;
    constructor(config?: ZepConfig) {
        const cfg: BaseToolConfig<typeof SearchUserFactsSchema> = {
            name: 'zep_search_user_facts',
            description: 'Search long-term facts stored in a Zep user record',
            parameters: SearchUserFactsSchema,
            category: ToolCategory.AI,
        };
        super(cfg);
        this.config = config ?? {};
    }

    protected async performExecute(input: SearchUserFactsInput): Promise<string> {
        const key = getKey(this.config);
        const url = `${base(this.config)}/api/v2/users/${input.user_id}/facts/search`;
        const res = await fetch(url, {
            method: 'POST',
            headers: headers(key),
            body: JSON.stringify({ text: input.text, limit: input.limit }),
        });
        if (!res.ok) throw new Error(`Zep search user facts error ${res.status}: ${await res.text()}`);
        const data = await res.json() as unknown;
        return JSON.stringify(data);
    }
}

// ── Toolkit ────────────────────────────────────────────────────────────────

export class ZepToolkit {
    private readonly config: ZepConfig;
    constructor(config?: ZepConfig) {
        this.config = config ?? {};
    }

    getTools() {
        return [
            new ZepAddMemoryTool(this.config),
            new ZepGetMemoryTool(this.config),
            new ZepSearchMemoryTool(this.config),
            new ZepDeleteMemoryTool(this.config),
            new ZepCreateSessionTool(this.config),
            new ZepGetSessionTool(this.config),
            new ZepGetUserTool(this.config),
            new ZepSearchUserFactsTool(this.config),
        ];
    }
}
