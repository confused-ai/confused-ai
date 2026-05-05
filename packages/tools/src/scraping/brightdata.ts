/**
 * Bright Data tools — web scraping and data collection via Bright Data Web Scraper API.
 * API docs: https://brightdata.com/cp/scraping_browser/api
 * API token: https://brightdata.com/cp/setting/users
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface BrightDataToolConfig {
    /** Bright Data API token (or BRIGHTDATA_API_TOKEN env var) */
    apiToken?: string;
    /** Scraping Browser zone name (or BRIGHTDATA_ZONE env var) */
    zone?: string;
    /** Web Unlocker zone (for unlocker API) */
    unlockerZone?: string;
}

function getAuth(config: BrightDataToolConfig): { token: string; zone: string } {
    const token = config.apiToken ?? process.env['BRIGHTDATA_API_TOKEN'];
    const zone = config.zone ?? process.env['BRIGHTDATA_ZONE'] ?? 'scraping_browser1';
    if (!token) throw new Error('BrightDataTools require BRIGHTDATA_API_TOKEN');
    return { token, zone };
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ScrapeUrlSchema = z.object({
    url: z.string().url().describe('URL to scrape'),
    format: z.enum(['html', 'markdown', 'text']).optional().default('markdown')
        .describe('Output format'),
    jsRender: z.boolean().optional().default(true).describe('Enable JavaScript rendering'),
    waitFor: z.string().optional().describe('CSS selector to wait for before extracting'),
    country: z.string().optional().describe('Target country for IP geolocation (e.g. "US", "GB")'),
});

const SerpsSchema = z.object({
    query: z.string().describe('Search query'),
    searchEngine: z.enum(['google', 'bing', 'yandex']).optional().default('google'),
    numResults: z.number().int().min(1).max(100).optional().default(10),
    country: z.string().optional().default('US').describe('Country for search results'),
    language: z.string().optional().default('en').describe('Language code'),
});

const DatasetCollectSchema = z.object({
    datasetId: z.string().describe('Bright Data dataset ID'),
    inputs: z.array(z.record(z.string(), z.string())).min(1).describe('Input data for the dataset'),
    endpoint: z.string().optional().describe('Notify endpoint URL for result delivery'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class BrightDataScrapeTool extends BaseTool<typeof ScrapeUrlSchema, {
    url: string;
    content: string;
    format: string;
}> {
    constructor(private config: BrightDataToolConfig = {}) {
        super({
            id: 'brightdata_scrape',
            name: 'Bright Data Scrape URL',
            description: 'Scrape a web page using Bright Data\'s residential proxy network with JS rendering.',
            category: ToolCategory.WEB,
            parameters: ScrapeUrlSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 60000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ScrapeUrlSchema>, _ctx: ToolContext) {
        const { token, zone } = getAuth(this.config);
        const reqBody: Record<string, unknown> = {
            url: input.url,
            zone,
            format: input.format ?? 'markdown',
            country: input.country,
        };
        if (input.waitFor) reqBody['wait_for'] = input.waitFor;

        const res = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody),
        });
        if (!res.ok) throw new Error(`Bright Data API ${res.status}: ${await res.text()}`);
        const text = await res.text();
        return { url: input.url, content: text, format: input.format ?? 'markdown' };
    }
}

export class BrightDataSERPSTool extends BaseTool<typeof SerpsSchema> {
    constructor(private config: BrightDataToolConfig = {}) {
        super({
            id: 'brightdata_serps',
            name: 'Bright Data SERP',
            description: 'Scrape search engine result pages (SERPs) using Bright Data.',
            category: ToolCategory.WEB,
            parameters: SerpsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SerpsSchema>, _ctx: ToolContext) {
        const { token } = getAuth(this.config);
        const engine = input.searchEngine ?? 'google';
        const searchUrl = engine === 'google'
            ? `https://www.google.com/search?q=${encodeURIComponent(input.query)}&num=${input.numResults ?? 10}&hl=${input.language ?? 'en'}&gl=${input.country ?? 'US'}`
            : engine === 'bing'
                ? `https://www.bing.com/search?q=${encodeURIComponent(input.query)}&count=${input.numResults ?? 10}&cc=${input.country ?? 'US'}`
                : `https://yandex.com/search/?text=${encodeURIComponent(input.query)}&lr=213`;

        const res = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: searchUrl, zone: 'serp_api1', country: input.country ?? 'US' }),
        });
        if (!res.ok) throw new Error(`Bright Data API ${res.status}: ${await res.text()}`);
        return { query: input.query, engine, html: await res.text() };
    }
}

export class BrightDataDatasetCollectTool extends BaseTool<typeof DatasetCollectSchema> {
    constructor(private config: BrightDataToolConfig = {}) {
        super({
            id: 'brightdata_dataset_collect',
            name: 'Bright Data Dataset Collect',
            description: 'Trigger a Bright Data dataset collection run with custom inputs.',
            category: ToolCategory.WEB,
            parameters: DatasetCollectSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof DatasetCollectSchema>, _ctx: ToolContext) {
        const { token } = getAuth(this.config);
        const params = new URLSearchParams({ dataset_id: input.datasetId });
        if (input.endpoint) params.set('endpoint', input.endpoint);

        const res = await fetch(`https://api.brightdata.com/datasets/v3/trigger?${params}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(input.inputs),
        });
        if (!res.ok) throw new Error(`Bright Data API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class BrightDataToolkit {
    readonly scrape: BrightDataScrapeTool;
    readonly serps: BrightDataSERPSTool;
    readonly datasetCollect: BrightDataDatasetCollectTool;

    constructor(config: BrightDataToolConfig = {}) {
        this.scrape = new BrightDataScrapeTool(config);
        this.serps = new BrightDataSERPSTool(config);
        this.datasetCollect = new BrightDataDatasetCollectTool(config);
    }

    getTools() {
        return [this.scrape, this.serps, this.datasetCollect];
    }
}
