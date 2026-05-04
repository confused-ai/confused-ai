/**
 * Confluence tools — search, read, create, and update pages via Confluence REST API v2.
 * API token: https://id.atlassian.com/manage-profile/security/api-tokens
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface ConfluenceToolConfig {
    /** Atlassian Cloud base URL (e.g. https://myorg.atlassian.net) */
    baseUrl?: string;
    /** Atlassian account email */
    email?: string;
    /** Atlassian API token */
    apiToken?: string;
}

function getCreds(config: ConfluenceToolConfig): { baseUrl: string; auth: string } {
    const baseUrl = config.baseUrl ?? process.env.CONFLUENCE_BASE_URL;
    const email = config.email ?? process.env.CONFLUENCE_EMAIL;
    const apiToken = config.apiToken ?? process.env.CONFLUENCE_API_TOKEN;
    if (!baseUrl) throw new Error('ConfluenceTools require CONFLUENCE_BASE_URL');
    if (!email) throw new Error('ConfluenceTools require CONFLUENCE_EMAIL');
    if (!apiToken) throw new Error('ConfluenceTools require CONFLUENCE_API_TOKEN');
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    return { baseUrl: baseUrl.replace(/\/$/, ''), auth };
}

async function confluenceFetch(creds: { baseUrl: string; auth: string }, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`${creds.baseUrl}/wiki/api/v2${path}`, {
        method,
        headers: {
            Authorization: `Basic ${creds.auth}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`Confluence API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return null;
    return res.json();
}

interface ConfluencePage {
    id: string;
    title: string;
    spaceKey?: string;
    status: string;
    version: number;
    body?: string;
    url?: string;
    authorId?: string;
    createdAt?: string;
    updatedAt?: string;
}

function mapPage(p: Record<string, unknown>): ConfluencePage {
    const body = p.body as Record<string, unknown> | undefined;
    const storage = body?.storage as Record<string, unknown> | undefined;
    const version = p.version as Record<string, unknown> | undefined;
    return {
        id: p.id as string,
        title: p.title as string,
        spaceKey: (p.spaceId as string | undefined),
        status: p.status as string ?? 'current',
        version: version?.number as number ?? 1,
        body: storage?.value as string | undefined,
        url: p._links ? `${(p._links as Record<string, string>).webui}` : undefined,
        authorId: (p.authorId as string | undefined),
        createdAt: p.createdAt as string | undefined,
        updatedAt: p.version ? (version?.createdAt as string | undefined) : undefined,
    };
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchPagesSchema = z.object({
    query: z.string().describe('CQL or text query (e.g. "type=page AND text~\\"deployment\\"")'),
    limit: z.number().int().min(1).max(250).optional().default(10),
    spaceKey: z.string().optional().describe('Restrict results to this space key'),
});

const GetPageSchema = z.object({
    pageId: z.string().describe('Confluence page ID'),
    includeBody: z.boolean().optional().default(true),
});

const CreatePageSchema = z.object({
    title: z.string().describe('Page title'),
    spaceId: z.string().describe('Confluence space ID'),
    body: z.string().describe('Page content in Confluence Storage Format (HTML-like XML)'),
    parentId: z.string().optional().describe('Parent page ID — creates as a child page'),
    status: z.enum(['current', 'draft']).optional().default('current'),
});

const UpdatePageSchema = z.object({
    pageId: z.string().describe('Page ID to update'),
    title: z.string().optional(),
    body: z.string().optional().describe('New page body in Confluence Storage Format'),
    version: z.number().int().describe('Current page version number — must be incremented by 1'),
    status: z.enum(['current', 'draft']).optional(),
});

const GetSpacesSchema = z.object({
    limit: z.number().int().min(1).max(250).optional().default(10),
    type: z.enum(['global', 'personal']).optional(),
});

const GetChildPagesSchema = z.object({
    pageId: z.string().describe('Parent page ID'),
    limit: z.number().int().min(1).max(250).optional().default(20),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ConfluenceSearchPagesTool extends BaseTool<typeof SearchPagesSchema, { pages: ConfluencePage[]; count: number }> {
    constructor(private config: ConfluenceToolConfig = {}) {
        super({
            id: 'confluence_search_pages',
            name: 'Confluence Search Pages',
            description: 'Search Confluence pages using CQL or plain text query.',
            category: ToolCategory.API,
            parameters: SearchPagesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchPagesSchema>, _ctx: ToolContext) {
        const creds = getCreds(this.config);
        let cql = input.query;
        if (input.spaceKey && !cql.includes('space')) cql += ` AND space="${input.spaceKey}"`;
        const params = new URLSearchParams({ cql, limit: String(input.limit ?? 10) });
        const data = await confluenceFetch(creds, 'GET', `/pages?${params}`) as { results: Array<Record<string, unknown>> };
        const pages = (data.results ?? []).map(mapPage);
        return { pages, count: pages.length };
    }
}

export class ConfluenceGetPageTool extends BaseTool<typeof GetPageSchema, ConfluencePage> {
    constructor(private config: ConfluenceToolConfig = {}) {
        super({
            id: 'confluence_get_page',
            name: 'Confluence Get Page',
            description: 'Retrieve a Confluence page by ID, optionally including its HTML body.',
            category: ToolCategory.API,
            parameters: GetPageSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetPageSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ 'body-format': 'storage' });
        const page = await confluenceFetch(getCreds(this.config), 'GET', `/pages/${input.pageId}?${params}`) as Record<string, unknown>;
        return mapPage(page);
    }
}

export class ConfluenceCreatePageTool extends BaseTool<typeof CreatePageSchema, ConfluencePage> {
    constructor(private config: ConfluenceToolConfig = {}) {
        super({
            id: 'confluence_create_page',
            name: 'Confluence Create Page',
            description: 'Create a new Confluence page in a space, optionally as a child of another page.',
            category: ToolCategory.API,
            parameters: CreatePageSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreatePageSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {
            title: input.title,
            spaceId: input.spaceId,
            status: input.status ?? 'current',
            body: { representation: 'storage', value: input.body },
        };
        if (input.parentId) body.parentId = input.parentId;
        const page = await confluenceFetch(getCreds(this.config), 'POST', '/pages', body) as Record<string, unknown>;
        return mapPage(page);
    }
}

export class ConfluenceUpdatePageTool extends BaseTool<typeof UpdatePageSchema, ConfluencePage> {
    constructor(private config: ConfluenceToolConfig = {}) {
        super({
            id: 'confluence_update_page',
            name: 'Confluence Update Page',
            description: 'Update an existing Confluence page. Requires current version number + 1.',
            category: ToolCategory.API,
            parameters: UpdatePageSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof UpdatePageSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {
            version: { number: input.version },
            status: input.status ?? 'current',
        };
        if (input.title) body.title = input.title;
        if (input.body) body.body = { representation: 'storage', value: input.body };

        const page = await confluenceFetch(getCreds(this.config), 'PUT', `/pages/${input.pageId}`, body) as Record<string, unknown>;
        return mapPage(page);
    }
}

export class ConfluenceGetSpacesTool extends BaseTool<typeof GetSpacesSchema, {
    spaces: Array<{ id: string; key: string; name: string; type: string }>;
}> {
    constructor(private config: ConfluenceToolConfig = {}) {
        super({
            id: 'confluence_get_spaces',
            name: 'Confluence Get Spaces',
            description: 'List Confluence spaces accessible to the authenticated user.',
            category: ToolCategory.API,
            parameters: GetSpacesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetSpacesSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ limit: String(input.limit ?? 10) });
        if (input.type) params.set('type', input.type);
        const data = await confluenceFetch(getCreds(this.config), 'GET', `/spaces?${params}`) as {
            results: Array<{ id: string; key: string; name: string; type: string }>;
        };
        return {
            spaces: (data.results ?? []).map((s) => ({
                id: s.id, key: s.key, name: s.name, type: s.type,
            })),
        };
    }
}

export class ConfluenceGetChildPagesTool extends BaseTool<typeof GetChildPagesSchema, { pages: ConfluencePage[]; count: number }> {
    constructor(private config: ConfluenceToolConfig = {}) {
        super({
            id: 'confluence_get_child_pages',
            name: 'Confluence Get Child Pages',
            description: 'List child pages of a given Confluence page.',
            category: ToolCategory.API,
            parameters: GetChildPagesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetChildPagesSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
        const data = await confluenceFetch(getCreds(this.config), 'GET', `/pages/${input.pageId}/children?${params}`) as {
            results: Array<Record<string, unknown>>;
        };
        const pages = (data.results ?? []).map(mapPage);
        return { pages, count: pages.length };
    }
}

export class ConfluenceToolkit {
    readonly tools: BaseTool[];
    constructor(config: ConfluenceToolConfig = {}) {
        this.tools = [
            new ConfluenceSearchPagesTool(config),
            new ConfluenceGetPageTool(config),
            new ConfluenceCreatePageTool(config),
            new ConfluenceUpdatePageTool(config),
            new ConfluenceGetSpacesTool(config),
            new ConfluenceGetChildPagesTool(config),
        ];
    }
}
