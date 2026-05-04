/**
 * Serper Google Search tools — Google search/news/scholar via Serper.dev.
 * API key: https://serper.dev
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface SerperToolConfig {
    /** Serper API key (or SERPER_API_KEY env var) */
    apiKey?: string;
    /** Google location code, e.g. "us" */
    location?: string;
    /** Language code, e.g. "en" */
    language?: string;
    /** Default number of results */
    numResults?: number;
}

function getKey(config: SerperToolConfig): string {
    const key = config.apiKey ?? process.env.SERPER_API_KEY;
    if (!key) throw new Error('SerperTools require SERPER_API_KEY');
    return key;
}

async function serperPost(apiKey: string, endpoint: string, body: object): Promise<unknown> {
    const url = endpoint === 'scrape'
        ? 'https://scrape.serper.dev'
        : `https://google.serper.dev/${endpoint}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Serper API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const WebSearchSchema = z.object({
    query: z.string().describe('Search query'),
    numResults: z.number().int().min(1).max(100).optional().default(10).describe('Number of results'),
    location: z.string().optional().describe('Google location code (e.g. "us")'),
    language: z.string().optional().describe('Language code (e.g. "en")'),
    dateRange: z.string().optional().describe('Date range filter (tbs param, e.g. "qdr:d" for past day)'),
});

const NewsSearchSchema = z.object({
    query: z.string().describe('News search query'),
    numResults: z.number().int().min(1).max(100).optional().default(10).describe('Number of results'),
});

const ScholarSearchSchema = z.object({
    query: z.string().describe('Academic search query'),
    numResults: z.number().int().min(1).max(100).optional().default(10).describe('Number of results'),
});

const ScrapeSchema = z.object({
    url: z.string().url().describe('URL to scrape'),
    markdown: z.boolean().optional().default(false).describe('Return content as Markdown'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class SerperWebSearchTool extends BaseTool<typeof WebSearchSchema> {
    constructor(private config: SerperToolConfig = {}) {
        super({
            id: 'serper_web_search',
            name: 'Serper Web Search',
            description: 'Search Google via Serper.dev and return organic results with titles, URLs, and snippets.',
            category: ToolCategory.WEB,
            parameters: WebSearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof WebSearchSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const body: Record<string, unknown> = {
            q: input.query,
            num: input.numResults ?? this.config.numResults ?? 10,
        };
        if (input.location ?? this.config.location) body['gl'] = input.location ?? this.config.location;
        if (input.language ?? this.config.language) body['hl'] = input.language ?? this.config.language;
        if (input.dateRange) body['tbs'] = input.dateRange;
        return serperPost(key, 'search', body);
    }
}

export class SerperNewsSearchTool extends BaseTool<typeof NewsSearchSchema> {
    constructor(private config: SerperToolConfig = {}) {
        super({
            id: 'serper_news_search',
            name: 'Serper News Search',
            description: 'Search Google News via Serper.dev.',
            category: ToolCategory.WEB,
            parameters: NewsSearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof NewsSearchSchema>, _ctx: ToolContext) {
        return serperPost(getKey(this.config), 'news', {
            q: input.query,
            num: input.numResults ?? this.config.numResults ?? 10,
        });
    }
}

export class SerperScholarSearchTool extends BaseTool<typeof ScholarSearchSchema> {
    constructor(private config: SerperToolConfig = {}) {
        super({
            id: 'serper_scholar_search',
            name: 'Serper Scholar Search',
            description: 'Search Google Scholar for academic papers via Serper.dev.',
            category: ToolCategory.WEB,
            parameters: ScholarSearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ScholarSearchSchema>, _ctx: ToolContext) {
        return serperPost(getKey(this.config), 'scholar', {
            q: input.query,
            num: input.numResults ?? this.config.numResults ?? 10,
        });
    }
}

export class SerperScrapeTool extends BaseTool<typeof ScrapeSchema> {
    constructor(private config: SerperToolConfig = {}) {
        super({
            id: 'serper_scrape',
            name: 'Serper Scrape',
            description: 'Scrape and extract content from a webpage via Serper.dev.',
            category: ToolCategory.WEB,
            parameters: ScrapeSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ScrapeSchema>, _ctx: ToolContext) {
        return serperPost(getKey(this.config), 'scrape', {
            url: input.url,
            includeMarkdown: input.markdown ?? false,
        });
    }
}

export class SerperToolkit {
    readonly webSearch: SerperWebSearchTool;
    readonly newsSearch: SerperNewsSearchTool;
    readonly scholarSearch: SerperScholarSearchTool;
    readonly scrape: SerperScrapeTool;

    constructor(config: SerperToolConfig = {}) {
        this.webSearch = new SerperWebSearchTool(config);
        this.newsSearch = new SerperNewsSearchTool(config);
        this.scholarSearch = new SerperScholarSearchTool(config);
        this.scrape = new SerperScrapeTool(config);
    }

    getTools() {
        return [this.webSearch, this.newsSearch, this.scholarSearch, this.scrape];
    }
}
