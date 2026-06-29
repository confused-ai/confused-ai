/**
 * Xquik tools - read public X data through the Xquik REST API.
 * API docs: https://docs.xquik.com/api-reference/x/search-tweets
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface XquikToolConfig {
    /** API key for Xquik REST access, or XQUIK_API_KEY env var */
    apiKey?: string;
    /** Optional API base URL, or XQUIK_BASE_URL env var */
    baseUrl?: string;
}

type QueryValue = boolean | number | string | undefined;

function getApiKey(config: XquikToolConfig): string {
    const apiKey = config.apiKey ?? process.env['XQUIK_API_KEY'];
    if (!apiKey) throw new Error('XquikTools require XQUIK_API_KEY');
    return apiKey;
}

function getBaseUrl(config: XquikToolConfig): string {
    return (config.baseUrl ?? process.env['XQUIK_BASE_URL'] ?? 'https://xquik.com').replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function parseJsonBody(text: string): unknown {
    if (!text) return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function getErrorMessage(body: unknown, fallback: string): string {
    if (isRecord(body)) {
        const error = body['error'];
        if (typeof error === 'string') return error;

        const message = body['message'];
        if (typeof message === 'string') return message;
    }

    return fallback || 'Request failed';
}

async function xquikRequest(
    config: XquikToolConfig,
    path: string,
    query: Record<string, QueryValue>
): Promise<unknown> {
    const url = new URL(path, `${getBaseUrl(config)}/`);

    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'x-api-key': getApiKey(config),
        },
    });
    const text = await response.text();
    const body = parseJsonBody(text);

    if (!response.ok) {
        throw new Error(`Xquik API ${response.status}: ${getErrorMessage(body, text)}`);
    }

    return body;
}

const SearchPostsSchema = z.object({
    query: z.string().min(1).describe('Search query for X posts'),
    queryType: z.enum(['Latest', 'Top']).optional().describe('Sort order'),
    limit: z.number().int().min(1).max(200).optional().describe('Max posts to return'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    sinceTime: z.string().optional().describe('Only return posts after this ISO 8601 time'),
    untilTime: z.string().optional().describe('Only return posts before this ISO 8601 time'),
});

const SearchUsersSchema = z.object({
    query: z.string().min(1).describe('Name or username query'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
});

const TrendsSchema = z.object({
    woeid: z.number().int().optional().describe('Region WOEID, defaults to worldwide'),
    count: z.number().int().min(1).max(50).optional().describe('Number of trends'),
});

export class XquikSearchPostsTool extends BaseTool<typeof SearchPostsSchema> {
    constructor(private config: XquikToolConfig = {}) {
        super({
            id: 'xquik_search_posts',
            name: 'Xquik Search X Posts',
            description: 'Search public X posts with the Xquik REST API.',
            category: ToolCategory.WEB,
            parameters: SearchPostsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchPostsSchema>, _ctx: ToolContext) {
        return xquikRequest(this.config, '/api/v1/x/tweets/search', {
            q: input.query,
            queryType: input.queryType ?? 'Latest',
            limit: input.limit ?? 20,
            cursor: input.cursor,
            sinceTime: input.sinceTime,
            untilTime: input.untilTime,
        });
    }
}

export class XquikSearchUsersTool extends BaseTool<typeof SearchUsersSchema> {
    constructor(private config: XquikToolConfig = {}) {
        super({
            id: 'xquik_search_users',
            name: 'Xquik Search X Users',
            description: 'Search public X users with the Xquik REST API.',
            category: ToolCategory.WEB,
            parameters: SearchUsersSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchUsersSchema>, _ctx: ToolContext) {
        return xquikRequest(this.config, '/api/v1/x/users/search', {
            q: input.query,
            cursor: input.cursor,
        });
    }
}

export class XquikTrendsTool extends BaseTool<typeof TrendsSchema> {
    constructor(private config: XquikToolConfig = {}) {
        super({
            id: 'xquik_trends',
            name: 'Xquik X Trends',
            description: 'Get trending X topics by region with the Xquik REST API.',
            category: ToolCategory.WEB,
            parameters: TrendsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof TrendsSchema>, _ctx: ToolContext) {
        return xquikRequest(this.config, '/api/v1/x/trends', {
            woeid: input.woeid ?? 1,
            count: input.count ?? 30,
        });
    }
}

export class XquikToolkit {
    readonly searchPosts: XquikSearchPostsTool;
    readonly searchUsers: XquikSearchUsersTool;
    readonly trends: XquikTrendsTool;

    constructor(config: XquikToolConfig = {}) {
        this.searchPosts = new XquikSearchPostsTool(config);
        this.searchUsers = new XquikSearchUsersTool(config);
        this.trends = new XquikTrendsTool(config);
    }

    getTools() {
        return [this.searchPosts, this.searchUsers, this.trends];
    }
}
