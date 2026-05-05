/**
 * Brave Search tool — privacy-first web search via Brave Search API.
 * API key: https://api.search.brave.com/register
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface BraveSearchToolConfig {
    /** Brave Search API key (or BRAVE_API_KEY env var) */
    apiKey?: string;
    /** Default max results */
    maxResults?: number;
    /** Default language */
    language?: string;
}

function getKey(config: BraveSearchToolConfig): string {
    const key = config.apiKey ?? process.env['BRAVE_API_KEY'];
    if (!key) throw new Error('BraveSearchTool requires BRAVE_API_KEY');
    return key;
}

const SearchSchema = z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().int().min(1).max(20).optional().default(5).describe('Max results to return'),
    country: z.string().optional().default('US').describe('Country code for results (e.g. "US")'),
    searchLang: z.string().optional().default('en').describe('Language for results (e.g. "en")'),
    freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional()
        .describe('Freshness filter: pd=past day, pw=past week, pm=past month, py=past year'),
    safesearch: z.enum(['off', 'moderate', 'strict']).optional().default('moderate')
        .describe('Safe search level'),
});

const NewsSearchSchema = z.object({
    query: z.string().describe('News search query'),
    maxResults: z.number().int().min(1).max(20).optional().default(5).describe('Max results'),
    country: z.string().optional().default('US').describe('Country code'),
    freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional().describe('Freshness filter'),
});

export class BraveSearchTool extends BaseTool<typeof SearchSchema, {
    query: string;
    webResults: Array<{ title: string; url: string; description: string; age?: string }>;
    totalResults: number;
}> {
    constructor(private config: BraveSearchToolConfig = {}) {
        super({
            id: 'brave_search',
            name: 'Brave Search',
            description: 'Privacy-first web search via Brave Search API. Returns web results with titles, URLs, and descriptions.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({
            q: input.query,
            count: String(input.maxResults ?? this.config.maxResults ?? 5),
            country: input.country ?? 'US',
            search_lang: input.searchLang ?? this.config.language ?? 'en',
            safesearch: input.safesearch ?? 'moderate',
            result_filter: 'web',
        });
        if (input.freshness) params.set('freshness', input.freshness);

        const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': getKey(this.config),
            },
        });
        if (!res.ok) throw new Error(`Brave Search API ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            web?: { results?: Array<{ title: string; url: string; description: string; age?: string }> };
        };

        const webResults = data.web?.results ?? [];
        return {
            query: input.query,
            webResults: webResults.map(r => ({
                title: r.title,
                url: r.url,
                description: r.description,
                ...(r.age !== undefined && { age: r.age }),
            })),
            totalResults: webResults.length,
        };
    }
}

export class BraveNewsSearchTool extends BaseTool<typeof NewsSearchSchema, {
    query: string;
    newsResults: Array<{ title: string; url: string; description: string; age?: string; source?: string }>;
}> {
    constructor(private config: BraveSearchToolConfig = {}) {
        super({
            id: 'brave_news_search',
            name: 'Brave News Search',
            description: 'Search for news articles via Brave Search API.',
            category: ToolCategory.WEB,
            parameters: NewsSearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof NewsSearchSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({
            q: input.query,
            count: String(input.maxResults ?? this.config.maxResults ?? 5),
            country: input.country ?? 'US',
        });
        if (input.freshness) params.set('freshness', input.freshness);

        const res = await fetch(`https://api.search.brave.com/res/v1/news/search?${params}`, {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': getKey(this.config),
            },
        });
        if (!res.ok) throw new Error(`Brave News API ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            results?: Array<{ title: string; url: string; description: string; age?: string; meta_url?: { hostname?: string } }>;
        };

        return {
            query: input.query,
            newsResults: (data.results ?? []).map(r => ({
                title: r.title,
                url: r.url,
                description: r.description,
                ...(r.age !== undefined && { age: r.age }),
                ...(r.meta_url?.hostname !== undefined && { source: r.meta_url.hostname }),
            })),
        };
    }
}

export class BraveSearchToolkit {
    readonly search: BraveSearchTool;
    readonly newsSearch: BraveNewsSearchTool;

    constructor(config: BraveSearchToolConfig = {}) {
        this.search = new BraveSearchTool(config);
        this.newsSearch = new BraveNewsSearchTool(config);
    }

    getTools() {
        return [this.search, this.newsSearch];
    }
}
