/**
 * Spider web crawler tools — fast web crawling at scale via Spider Cloud API.
 * API docs: https://spider.cloud/docs/api
 * API key: https://spider.cloud/
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface SpiderToolConfig {
    /** Spider API key (or SPIDER_API_KEY env var) */
    apiKey?: string;
}

function getKey(config: SpiderToolConfig): string {
    const key = config.apiKey ?? process.env.SPIDER_API_KEY;
    if (!key) throw new Error('SpiderTools require SPIDER_API_KEY');
    return key;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const CrawlSchema = z.object({
    url: z.string().url().describe('URL to crawl'),
    limit: z.number().int().min(1).max(1000).optional().default(10)
        .describe('Maximum number of pages to crawl'),
    depth: z.number().int().min(0).max(10).optional()
        .describe('Maximum crawl depth (0 = URL only)'),
    returnFormat: z.enum(['markdown', 'raw', 'text', 'html2text']).optional().default('markdown')
        .describe('Output format for crawled content'),
    jsRender: z.boolean().optional().default(true).describe('Enable JavaScript rendering'),
    subpages: z.boolean().optional().default(true).describe('Crawl subpages of the domain'),
    requestTimeout: z.number().int().optional().default(30).describe('Request timeout in seconds'),
});

const ScrapeSchema = z.object({
    url: z.string().url().describe('URL to scrape'),
    returnFormat: z.enum(['markdown', 'raw', 'text', 'html2text']).optional().default('markdown'),
    jsRender: z.boolean().optional().default(true),
    screenshotOptions: z.object({
        enabled: z.boolean().optional().default(false),
        fullPage: z.boolean().optional().default(true),
    }).optional(),
});

const SearchSchema = z.object({
    query: z.string().describe('Search query'),
    limit: z.number().int().min(1).max(50).optional().default(10).describe('Number of results'),
    returnFormat: z.enum(['markdown', 'raw', 'text']).optional().default('markdown'),
    fetch: z.boolean().optional().default(false)
        .describe('Fetch and return the full content of search result pages'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class SpiderCrawlTool extends BaseTool<typeof CrawlSchema> {
    constructor(private config: SpiderToolConfig = {}) {
        super({
            id: 'spider_crawl',
            name: 'Spider Crawl',
            description: 'Crawl a website and extract content from multiple pages at scale.',
            category: ToolCategory.WEB,
            parameters: CrawlSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 120000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CrawlSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const body: Record<string, unknown> = {
            url: input.url,
            limit: input.limit ?? 10,
            return_format: input.returnFormat ?? 'markdown',
            anti_bot: true,
            request: input.jsRender ?? true ? 'chrome' : 'http',
            subpages: input.subpages ?? true,
            request_timeout: input.requestTimeout ?? 30,
        };
        if (input.depth !== undefined) body['depth'] = input.depth;

        const res = await fetch('https://api.spider.cloud/crawl', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Spider API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class SpiderScrapeTool extends BaseTool<typeof ScrapeSchema> {
    constructor(private config: SpiderToolConfig = {}) {
        super({
            id: 'spider_scrape',
            name: 'Spider Scrape',
            description: 'Scrape a single web page and extract its content.',
            category: ToolCategory.WEB,
            parameters: ScrapeSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 60000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ScrapeSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const body: Record<string, unknown> = {
            url: input.url,
            limit: 1,
            return_format: input.returnFormat ?? 'markdown',
            request: input.jsRender ?? true ? 'chrome' : 'http',
        };
        if (input.screenshotOptions?.enabled) {
            body['screenshot'] = true;
            body['screenshot_full_page'] = input.screenshotOptions.fullPage ?? true;
        }

        const res = await fetch('https://api.spider.cloud/crawl', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Spider API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class SpiderSearchTool extends BaseTool<typeof SearchSchema> {
    constructor(private config: SpiderToolConfig = {}) {
        super({
            id: 'spider_search',
            name: 'Spider Search',
            description: 'Search the web using Spider Cloud and optionally fetch page content.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 60000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const res = await fetch('https://api.spider.cloud/search', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                search: input.query,
                limit: input.limit ?? 10,
                return_format: input.returnFormat ?? 'markdown',
                fetch_page_content: input.fetch ?? false,
            }),
        });
        if (!res.ok) throw new Error(`Spider API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class SpiderToolkit {
    readonly crawl: SpiderCrawlTool;
    readonly scrape: SpiderScrapeTool;
    readonly search: SpiderSearchTool;

    constructor(config: SpiderToolConfig = {}) {
        this.crawl = new SpiderCrawlTool(config);
        this.scrape = new SpiderScrapeTool(config);
        this.search = new SpiderSearchTool(config);
    }

    getTools() {
        return [this.crawl, this.scrape, this.search];
    }
}
