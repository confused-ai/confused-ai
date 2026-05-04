/**
 * ScrapeGraph AI tools — AI-powered web scraping.
 * API docs: https://docs.scrapegraphai.com
 * API key: https://dashboard.scrapegraphai.com
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface ScrapeGraphToolConfig {
    /** ScrapeGraph API key (or SGAI_API_KEY env var) */
    apiKey?: string;
}

function getKey(config: ScrapeGraphToolConfig): string {
    const key = config.apiKey ?? process.env.SGAI_API_KEY;
    if (!key) throw new Error('ScrapeGraphTools require SGAI_API_KEY');
    return key;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SmartScraperSchema = z.object({
    url: z.string().url().describe('URL of the website to scrape'),
    prompt: z.string().describe('Natural language description of what data to extract'),
    schema: z.record(z.string(), z.unknown()).optional().describe('JSON Schema defining the desired output structure'),
});

const SearchGraphSchema = z.object({
    query: z.string().describe('Search query to find and scrape relevant web pages'),
    schema: z.record(z.string(), z.unknown()).optional().describe('JSON Schema for structured output'),
    numPages: z.number().int().min(1).max(10).optional().default(3)
        .describe('Number of search results to scrape'),
});

const MarkdownifySchema = z.object({
    url: z.string().url().describe('URL to convert to Markdown'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ScrapeGraphSmartScraperTool extends BaseTool<typeof SmartScraperSchema> {
    constructor(private config: ScrapeGraphToolConfig = {}) {
        super({
            id: 'scrapegraph_smart_scraper',
            name: 'ScrapeGraph Smart Scraper',
            description: 'Scrape a website using AI to extract specific data described in natural language.',
            category: ToolCategory.WEB,
            parameters: SmartScraperSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 60000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SmartScraperSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const body: Record<string, unknown> = {
            website_url: input.url,
            user_prompt: input.prompt,
        };
        if (input.schema) body['output_schema'] = input.schema;

        const res = await fetch('https://api.scrapegraphai.com/v1/smartscraper', {
            method: 'POST',
            headers: { 'SGAI-APIKEY': key, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`ScrapeGraph API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class ScrapeGraphSearchGraphTool extends BaseTool<typeof SearchGraphSchema> {
    constructor(private config: ScrapeGraphToolConfig = {}) {
        super({
            id: 'scrapegraph_search_graph',
            name: 'ScrapeGraph Search Graph',
            description: 'Search the web and scrape multiple results to answer a query using AI.',
            category: ToolCategory.WEB,
            parameters: SearchGraphSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 90000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchGraphSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const body: Record<string, unknown> = {
            user_prompt: input.query,
            max_results: input.numPages ?? 3,
        };
        if (input.schema) body['output_schema'] = input.schema;

        const res = await fetch('https://api.scrapegraphai.com/v1/searchscraper', {
            method: 'POST',
            headers: { 'SGAI-APIKEY': key, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`ScrapeGraph API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class ScrapeGraphMarkdownifyTool extends BaseTool<typeof MarkdownifySchema> {
    constructor(private config: ScrapeGraphToolConfig = {}) {
        super({
            id: 'scrapegraph_markdownify',
            name: 'ScrapeGraph Markdownify',
            description: 'Convert a web page to clean Markdown using ScrapeGraph AI.',
            category: ToolCategory.WEB,
            parameters: MarkdownifySchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof MarkdownifySchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const res = await fetch('https://api.scrapegraphai.com/v1/markdownify', {
            method: 'POST',
            headers: { 'SGAI-APIKEY': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ website_url: input.url }),
        });
        if (!res.ok) throw new Error(`ScrapeGraph API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class ScrapeGraphToolkit {
    readonly smartScraper: ScrapeGraphSmartScraperTool;
    readonly searchGraph: ScrapeGraphSearchGraphTool;
    readonly markdownify: ScrapeGraphMarkdownifyTool;

    constructor(config: ScrapeGraphToolConfig = {}) {
        this.smartScraper = new ScrapeGraphSmartScraperTool(config);
        this.searchGraph = new ScrapeGraphSearchGraphTool(config);
        this.markdownify = new ScrapeGraphMarkdownifyTool(config);
    }

    getTools() {
        return [this.smartScraper, this.searchGraph, this.markdownify];
    }
}
