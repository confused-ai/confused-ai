/**
 * Crawl4AI tools — web crawling and AI extraction via Crawl4AI API.
 * API docs: https://docs.crawl4ai.com/api
 * Hosted API: https://crawl4ai.com
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface Crawl4AIToolConfig {
    /** Crawl4AI API token (or CRAWL4AI_API_TOKEN env var) */
    apiToken?: string;
    /** Host URL (or CRAWL4AI_HOST env var, default: https://api.crawl4ai.com) */
    host?: string;
}

function getAuth(config: Crawl4AIToolConfig): { baseUrl: string; headers: Record<string, string> } {
    const token = config.apiToken ?? process.env['CRAWL4AI_API_TOKEN'];
    const host = (config.host ?? process.env['CRAWL4AI_HOST'] ?? 'https://api.crawl4ai.com').replace(/\/$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return { baseUrl: host, headers };
}

// ── Schemas ────────────────────────────────────────────────────────────────

const CrawlUrlSchema = z.object({
    url: z.string().url().describe('URL to crawl'),
    extractionType: z.enum(['markdown', 'html', 'json', 'screenshot'])
        .optional().default('markdown').describe('Output format'),
    jsEnabled: z.boolean().optional().default(true).describe('Enable JavaScript rendering'),
    waitFor: z.string().optional().describe('CSS selector or timeout to wait for before extracting'),
    extractionSchema: z.record(z.string(), z.unknown()).optional().describe('JSON schema for structured extraction'),
    bypassCache: z.boolean().optional().default(false).describe('Bypass cached results'),
    screenshotOptions: z.object({
        fullPage: z.boolean().optional().default(true),
        quality: z.number().int().min(1).max(100).optional().default(80),
    }).optional(),
});

const CrawlMultipleSchema = z.object({
    urls: z.array(z.string().url()).min(1).max(20).describe('List of URLs to crawl (max 20)'),
    extractionType: z.enum(['markdown', 'html', 'json']).optional().default('markdown'),
    jsEnabled: z.boolean().optional().default(true),
});

const ExtractStructuredSchema = z.object({
    url: z.string().url().describe('URL to extract structured data from'),
    schema: z.record(z.string(), z.unknown()).describe('JSON Schema defining the data structure to extract'),
    instruction: z.string().optional().describe('Natural language instruction for AI extraction'),
    jsEnabled: z.boolean().optional().default(true),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class Crawl4AICrawlUrlTool extends BaseTool<typeof CrawlUrlSchema> {
    constructor(private config: Crawl4AIToolConfig = {}) {
        super({
            id: 'crawl4ai_crawl_url',
            name: 'Crawl4AI Crawl URL',
            description: 'Crawl a web page and extract content as markdown, HTML, or structured JSON.',
            category: ToolCategory.WEB,
            parameters: CrawlUrlSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 60000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CrawlUrlSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const body: Record<string, unknown> = {
            url: input.url,
            extraction_type: input.extractionType ?? 'markdown',
            js_enabled: input.jsEnabled ?? true,
            bypass_cache: input.bypassCache ?? false,
        };
        if (input.waitFor) body['wait_for'] = input.waitFor;
        if (input.extractionSchema) body['extraction_schema'] = input.extractionSchema;
        if (input.screenshotOptions) body['screenshot_options'] = {
            full_page: input.screenshotOptions.fullPage,
            quality: input.screenshotOptions.quality,
        };

        const res = await fetch(`${auth.baseUrl}/crawl`, {
            method: 'POST',
            headers: auth.headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Crawl4AI API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class Crawl4AICrawlMultipleTool extends BaseTool<typeof CrawlMultipleSchema> {
    constructor(private config: Crawl4AIToolConfig = {}) {
        super({
            id: 'crawl4ai_crawl_multiple',
            name: 'Crawl4AI Crawl Multiple URLs',
            description: 'Crawl multiple URLs concurrently and extract content.',
            category: ToolCategory.WEB,
            parameters: CrawlMultipleSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 120000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CrawlMultipleSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const res = await fetch(`${auth.baseUrl}/crawl/batch`, {
            method: 'POST',
            headers: auth.headers,
            body: JSON.stringify({
                urls: input.urls,
                extraction_type: input.extractionType ?? 'markdown',
                js_enabled: input.jsEnabled ?? true,
            }),
        });
        if (!res.ok) throw new Error(`Crawl4AI API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class Crawl4AIExtractStructuredTool extends BaseTool<typeof ExtractStructuredSchema> {
    constructor(private config: Crawl4AIToolConfig = {}) {
        super({
            id: 'crawl4ai_extract_structured',
            name: 'Crawl4AI Extract Structured Data',
            description: 'Crawl a URL and extract structured data matching a provided JSON schema using AI.',
            category: ToolCategory.WEB,
            parameters: ExtractStructuredSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 90000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ExtractStructuredSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const body: Record<string, unknown> = {
            url: input.url,
            extraction_type: 'json',
            extraction_schema: input.schema,
            js_enabled: input.jsEnabled ?? true,
        };
        if (input.instruction) body['instruction'] = input.instruction;

        const res = await fetch(`${auth.baseUrl}/crawl`, {
            method: 'POST',
            headers: auth.headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Crawl4AI API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class Crawl4AIToolkit {
    readonly crawlUrl: Crawl4AICrawlUrlTool;
    readonly crawlMultiple: Crawl4AICrawlMultipleTool;
    readonly extractStructured: Crawl4AIExtractStructuredTool;

    constructor(config: Crawl4AIToolConfig = {}) {
        this.crawlUrl = new Crawl4AICrawlUrlTool(config);
        this.crawlMultiple = new Crawl4AICrawlMultipleTool(config);
        this.extractStructured = new Crawl4AIExtractStructuredTool(config);
    }

    getTools() {
        return [this.crawlUrl, this.crawlMultiple, this.extractStructured];
    }
}
