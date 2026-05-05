/**
 * Tavily search tools — AI-powered web search and content extraction.
 * API key: https://app.tavily.com
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface TavilyToolConfig {
    /** Tavily API key (or TAVILY_API_KEY env var) */
    apiKey?: string;
}

function getKey(config: TavilyToolConfig): string {
    const key = config.apiKey ?? process.env['TAVILY_API_KEY'];
    if (!key) throw new Error('TavilyTools require TAVILY_API_KEY');
    return key;
}

async function tavilyPost(apiKey: string, endpoint: string, body: object): Promise<unknown> {
    const res = await fetch(`https://api.tavily.com/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Tavily API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchSchema = z.object({
    query: z.string().describe('Search query'),
    searchDepth: z.enum(['basic', 'advanced']).optional().default('basic')
        .describe('Search depth: basic (faster) or advanced (more thorough)'),
    maxResults: z.number().int().min(1).max(10).optional().default(5).describe('Number of results'),
    includeDomains: z.array(z.string()).optional().describe('Only include results from these domains'),
    excludeDomains: z.array(z.string()).optional().describe('Exclude results from these domains'),
    includeAnswer: z.boolean().optional().default(true).describe('Include AI-generated answer'),
    includeRawContent: z.boolean().optional().default(false).describe('Include raw page content'),
});

const ExtractSchema = z.object({
    urls: z.array(z.string().url()).min(1).max(20).describe('URLs to extract content from'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class TavilySearchTool extends BaseTool<typeof SearchSchema, {
    answer?: string;
    results: Array<{ title: string; url: string; content: string; score: number }>;
    query: string;
}> {
    constructor(private config: TavilyToolConfig = {}) {
        super({
            id: 'tavily_search',
            name: 'Tavily Search',
            description: 'AI-powered web search optimised for LLM agents. Returns relevant results with an optional AI-generated answer.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const data = await tavilyPost(getKey(this.config), 'search', {
            query: input.query,
            search_depth: input.searchDepth ?? 'basic',
            max_results: input.maxResults ?? 5,
            include_domains: input.includeDomains,
            exclude_domains: input.excludeDomains,
            include_answer: input.includeAnswer ?? true,
            include_raw_content: input.includeRawContent ?? false,
        }) as {
            answer?: string;
            results: Array<{ title: string; url: string; content: string; score: number }>;
            query: string;
        };
        return { ...(data.answer !== undefined && { answer: data.answer }), results: data.results ?? [], query: data.query };
    }
}

export class TavilyExtractTool extends BaseTool<typeof ExtractSchema, {
    results: Array<{ url: string; rawContent: string; failed?: boolean }>;
}> {
    constructor(private config: TavilyToolConfig = {}) {
        super({
            id: 'tavily_extract',
            name: 'Tavily Extract',
            description: 'Extract clean text content from one or more URLs using Tavily.',
            category: ToolCategory.WEB,
            parameters: ExtractSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ExtractSchema>, _ctx: ToolContext) {
        const data = await tavilyPost(getKey(this.config), 'extract', { urls: input.urls }) as {
            results: Array<{ url: string; raw_content: string; failed?: boolean }>;
        };
        return {
            results: (data.results ?? []).map((r) => ({
                url: r.url,
                rawContent: r.raw_content,
                ...(r.failed !== undefined && { failed: r.failed }),
            })),
        };
    }
}

export class TavilyToolkit {
    readonly tools: BaseTool[];
    constructor(config: TavilyToolConfig = {}) {
        this.tools = [new TavilySearchTool(config), new TavilyExtractTool(config)];
    }
}
