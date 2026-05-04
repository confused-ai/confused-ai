/**
 * SearXNG meta-search tool — self-hosted or public SearXNG instance.
 * Docs: https://searxng.github.io/searxng/dev/search_api.html
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface SearXNGToolConfig {
    /** SearXNG instance URL (or SEARXNG_HOST env var) — defaults to public instance */
    host?: string;
}

function getHost(config: SearXNGToolConfig): string {
    return config.host ?? process.env.SEARXNG_HOST ?? 'https://searx.be';
}

const SearchSchema = z.object({
    query: z.string().describe('Search query'),
    categories: z.array(z.string()).optional().default(['general'])
        .describe('Search categories (general, news, images, science, files, etc.)'),
    engines: z.array(z.string()).optional()
        .describe('Specific search engines to use'),
    language: z.string().optional().default('en').describe('Language code'),
    pageno: z.number().int().min(1).optional().default(1).describe('Page number'),
    timeRange: z.enum(['day', 'week', 'month', 'year']).optional()
        .describe('Filter results by time range'),
    safesearch: z.number().int().min(0).max(2).optional().default(0)
        .describe('Safe search: 0=off, 1=moderate, 2=strict'),
});

export class SearXNGSearchTool extends BaseTool<typeof SearchSchema, {
    query: string;
    results: Array<{ title: string; url: string; content: string; engine?: string; publishedDate?: string }>;
    suggestions: string[];
}> {
    constructor(private config: SearXNGToolConfig = {}) {
        super({
            id: 'searxng_search',
            name: 'SearXNG Search',
            description: 'Meta-search across multiple engines via a SearXNG instance. Privacy-respecting, aggregates results from Google, Bing, DuckDuckGo, and more.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const host = getHost(this.config).replace(/\/$/, '');
        const params = new URLSearchParams({
            q: input.query,
            format: 'json',
            language: input.language ?? 'en',
            pageno: String(input.pageno ?? 1),
            safesearch: String(input.safesearch ?? 0),
        });

        if (input.categories?.length) {
            params.set('categories', input.categories.join(','));
        }
        if (input.engines?.length) {
            params.set('engines', input.engines.join(','));
        }
        if (input.timeRange) {
            params.set('time_range', input.timeRange);
        }

        const res = await fetch(`${host}/search?${params}`, {
            headers: { 'Accept': 'application/json' },
        });
        if (!res.ok) throw new Error(`SearXNG ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            results?: Array<{ title: string; url: string; content: string; engine?: string; publishedDate?: string }>;
            suggestions?: string[];
        };

        return {
            query: input.query,
            results: (data.results ?? []).map(r => ({
                title: r.title,
                url: r.url,
                content: r.content,
                engine: r.engine,
                publishedDate: r.publishedDate,
            })),
            suggestions: data.suggestions ?? [],
        };
    }
}

export class SearXNGToolkit {
    readonly search: SearXNGSearchTool;

    constructor(config: SearXNGToolConfig = {}) {
        this.search = new SearXNGSearchTool(config);
    }

    getTools() {
        return [this.search];
    }
}
