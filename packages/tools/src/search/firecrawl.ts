/**
 * Firecrawl tools — web scraping, crawling, and markdown conversion.
 * API key: https://firecrawl.dev
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface FirecrawlToolConfig {
    /** Firecrawl API key (or FIRECRAWL_API_KEY env var) */
    apiKey?: string;
}

function getKey(config: FirecrawlToolConfig): string {
    const key = config.apiKey ?? process.env['FIRECRAWL_API_KEY'];
    if (!key) throw new Error('FirecrawlTools require FIRECRAWL_API_KEY');
    return key;
}

async function firecrawlFetch(apiKey: string, path: string, body: object): Promise<unknown> {
    const res = await fetch(`https://api.firecrawl.dev/v1${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Firecrawl API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ScrapeSchema = z.object({
    url: z.string().describe('URL to scrape'),
    formats: z.array(z.enum(['markdown', 'html', 'rawHtml', 'screenshot', 'links'])).optional().default(['markdown']),
    onlyMainContent: z.boolean().optional().default(true).describe('Strip nav, footer, ads — only main content'),
    waitFor: z.number().int().optional().describe('Milliseconds to wait for JS rendering'),
    timeout: z.number().int().optional().default(30000),
    excludeTags: z.array(z.string()).optional().describe('HTML tags to strip (e.g. ["nav","footer"])'),
    includeTags: z.array(z.string()).optional(),
});

const CrawlSchema = z.object({
    url: z.string().describe('Base URL to crawl'),
    limit: z.number().int().min(1).max(1000).optional().default(10).describe('Max pages to crawl'),
    maxDepth: z.number().int().min(1).max(10).optional().default(3),
    includePaths: z.array(z.string()).optional().describe('Regex patterns — only crawl matching paths'),
    excludePaths: z.array(z.string()).optional().describe('Regex patterns — skip matching paths'),
    formats: z.array(z.enum(['markdown', 'html', 'rawHtml', 'links'])).optional().default(['markdown']),
    onlyMainContent: z.boolean().optional().default(true),
});

const MapSchema = z.object({
    url: z.string().describe('Website URL to map'),
    limit: z.number().int().min(1).max(5000).optional().default(100).describe('Max URLs to return'),
    search: z.string().optional().describe('Filter URLs containing this keyword'),
    ignoreSitemap: z.boolean().optional().default(false),
});

interface ScrapedPage {
    url: string;
    markdown?: string;
    html?: string;
    rawHtml?: string;
    links?: string[];
    screenshot?: string;
    metadata?: { title?: string; description?: string; statusCode?: number };
}

// ── Tools ──────────────────────────────────────────────────────────────────

export class FirecrawlScrapeTool extends BaseTool<typeof ScrapeSchema, ScrapedPage> {
    constructor(private config: FirecrawlToolConfig = {}) {
        super({
            id: 'firecrawl_scrape',
            name: 'Firecrawl Scrape',
            description: 'Scrape a single URL and return clean markdown, HTML, links, or a screenshot. Handles JS-rendered pages.',
            category: ToolCategory.WEB,
            parameters: ScrapeSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 60000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ScrapeSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {
            url: input.url,
            formats: input.formats ?? ['markdown'],
            onlyMainContent: input.onlyMainContent ?? true,
        };
        if (input['waitFor']) body['waitFor'] = input['waitFor'];
        if (input['timeout']) body['timeout'] = input['timeout'];
        if (input['excludeTags']?.length) body['excludeTags'] = input['excludeTags'];
        if (input['includeTags']?.length) body['includeTags'] = input['includeTags'];

        const data = await firecrawlFetch(getKey(this.config), '/scrape', body) as { data: Record<string, unknown> };
        const d = data.data ?? (data as Record<string, unknown>);
        const result: ScrapedPage = { url: input.url };
        if (d['markdown'] !== undefined) result.markdown = d['markdown'] as string;
        if (d['html'] !== undefined) result.html = d['html'] as string;
        if (d['rawHtml'] !== undefined) result.rawHtml = d['rawHtml'] as string;
        if (d['links'] !== undefined) result.links = d['links'] as string[];
        if (d['screenshot'] !== undefined) result.screenshot = d['screenshot'] as string;
        if (d['metadata'] !== undefined) result.metadata = d['metadata'] as NonNullable<ScrapedPage['metadata']>;
        return result;
    }
}

export class FirecrawlCrawlTool extends BaseTool<typeof CrawlSchema, { pages: ScrapedPage[]; count: number; jobId?: string }> {
    constructor(private config: FirecrawlToolConfig = {}) {
        super({
            id: 'firecrawl_crawl',
            name: 'Firecrawl Crawl',
            description: 'Crawl an entire website up to a page limit and return clean content for each page.',
            category: ToolCategory.WEB,
            parameters: CrawlSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 120000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CrawlSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {
            url: input.url,
            limit: input.limit ?? 10,
            scrapeOptions: {
                formats: input.formats ?? ['markdown'],
                onlyMainContent: input.onlyMainContent ?? true,
            },
            maxDepth: input.maxDepth ?? 3,
        };
        if (input['includePaths']?.length) body['includePaths'] = input['includePaths'];
        if (input['excludePaths']?.length) body['excludePaths'] = input['excludePaths'];

        const data = await firecrawlFetch(getKey(this.config), '/crawl', body) as {
            jobId?: string;
            data?: Array<Record<string, unknown>>;
        };

        const rawPages = (data.data ?? []) as Array<Record<string, unknown>>;
        const pages: ScrapedPage[] = rawPages.map((d) => {
            const p: ScrapedPage = { url: d['url'] as string ?? '' };
            if (d['markdown'] !== undefined) p.markdown = d['markdown'] as string;
            if (d['html'] !== undefined) p.html = d['html'] as string;
            if (d['metadata'] !== undefined) p.metadata = d['metadata'] as NonNullable<ScrapedPage['metadata']>;
            return p;
        });

        return { pages, count: pages.length, ...(data.jobId !== undefined && { jobId: data.jobId }) };
    }
}

export class FirecrawlMapTool extends BaseTool<typeof MapSchema, { urls: string[]; count: number }> {
    constructor(private config: FirecrawlToolConfig = {}) {
        super({
            id: 'firecrawl_map',
            name: 'Firecrawl Map',
            description: 'Discover all URLs on a website quickly — returns a sitemap without downloading full content.',
            category: ToolCategory.WEB,
            parameters: MapSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof MapSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {
            url: input.url,
            limit: input.limit ?? 100,
            ignoreSitemap: input.ignoreSitemap ?? false,
        };
        if (input['search']) body['search'] = input['search'];

        const data = await firecrawlFetch(getKey(this.config), '/map', body) as { links?: string[]; urls?: string[] };
        const urls = data.links ?? data.urls ?? [];
        return { urls, count: urls.length };
    }
}

export class FirecrawlToolkit {
    readonly tools: BaseTool[];
    constructor(config: FirecrawlToolConfig = {}) {
        this.tools = [
            new FirecrawlScrapeTool(config),
            new FirecrawlCrawlTool(config),
            new FirecrawlMapTool(config),
        ];
    }
}
