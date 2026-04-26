/**
 * GIPHY tools — search and retrieve GIFs via GIPHY API.
 * API docs: https://developers.giphy.com/docs/api
 * API key: https://developers.giphy.com/
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface GiphyToolConfig {
    /** GIPHY API key (or GIPHY_API_KEY env var) */
    apiKey?: string;
    /** Content rating filter */
    rating?: 'g' | 'pg' | 'pg-13' | 'r';
}

function getKey(config: GiphyToolConfig): string {
    const key = config.apiKey ?? process.env.GIPHY_API_KEY;
    if (!key) throw new Error('GiphyTools require GIPHY_API_KEY');
    return key;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchGifsSchema = z.object({
    query: z.string().describe('Search query for GIFs'),
    limit: z.number().int().min(1).max(50).optional().default(10).describe('Number of GIFs to return'),
    offset: z.number().int().optional().default(0).describe('Pagination offset'),
    rating: z.enum(['g', 'pg', 'pg-13', 'r']).optional().default('pg').describe('Content rating filter'),
    lang: z.string().optional().default('en').describe('Language for search'),
});

const TrendingGifsSchema = z.object({
    limit: z.number().int().min(1).max(50).optional().default(10).describe('Number of trending GIFs to return'),
    rating: z.enum(['g', 'pg', 'pg-13', 'r']).optional().default('pg').describe('Content rating filter'),
});

const GetGifSchema = z.object({
    gifId: z.string().describe('GIPHY GIF ID'),
});

const RandomGifSchema = z.object({
    tag: z.string().optional().describe('Tag to filter random GIF'),
    rating: z.enum(['g', 'pg', 'pg-13', 'r']).optional().default('pg').describe('Content rating filter'),
});

const TranslateSchema = z.object({
    phrase: z.string().describe('Phrase to translate into a GIF'),
    weirdness: z.number().int().min(0).max(10).optional().default(0)
        .describe('Weirdness level: 0 = strict, 10 = weird and experimental'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class GiphySearchTool extends BaseTool<typeof SearchGifsSchema, {
    gifs: Array<{ id: string; title: string; url: string; gifUrl: string; width: string; height: string }>;
    total: number;
}> {
    constructor(private config: GiphyToolConfig = {}) {
        super({
            id: 'giphy_search',
            name: 'GIPHY Search',
            description: 'Search for GIFs on GIPHY by keyword.',
            category: ToolCategory.WEB,
            parameters: SearchGifsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchGifsSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const params = new URLSearchParams({
            api_key: key,
            q: input.query,
            limit: String(input.limit ?? 10),
            offset: String(input.offset ?? 0),
            rating: input.rating ?? (this.config.rating ?? 'pg'),
            lang: input.lang ?? 'en',
        });
        const res = await fetch(`https://api.giphy.com/v1/gifs/search?${params}`);
        if (!res.ok) throw new Error(`GIPHY API ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            data?: Array<{ id: string; title: string; url: string; images?: { original?: { url?: string; width?: string; height?: string } } }>;
            pagination?: { total_count?: number };
        };
        return {
            gifs: (data.data ?? []).map(g => ({
                id: g.id,
                title: g.title,
                url: g.url,
                gifUrl: g.images?.original?.url ?? '',
                width: g.images?.original?.width ?? '0',
                height: g.images?.original?.height ?? '0',
            })),
            total: data.pagination?.total_count ?? 0,
        };
    }
}

export class GiphyTrendingTool extends BaseTool<typeof TrendingGifsSchema> {
    constructor(private config: GiphyToolConfig = {}) {
        super({
            id: 'giphy_trending',
            name: 'GIPHY Trending',
            description: 'Get trending GIFs from GIPHY.',
            category: ToolCategory.WEB,
            parameters: TrendingGifsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof TrendingGifsSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const params = new URLSearchParams({
            api_key: key,
            limit: String(input.limit ?? 10),
            rating: input.rating ?? (this.config.rating ?? 'pg'),
        });
        const res = await fetch(`https://api.giphy.com/v1/gifs/trending?${params}`);
        if (!res.ok) throw new Error(`GIPHY API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class GiphyGetGifTool extends BaseTool<typeof GetGifSchema> {
    constructor(private config: GiphyToolConfig = {}) {
        super({
            id: 'giphy_get_gif',
            name: 'GIPHY Get GIF',
            description: 'Get details for a specific GIF by GIPHY ID.',
            category: ToolCategory.WEB,
            parameters: GetGifSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetGifSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const res = await fetch(`https://api.giphy.com/v1/gifs/${input.gifId}?api_key=${encodeURIComponent(key)}`);
        if (!res.ok) throw new Error(`GIPHY API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class GiphyRandomTool extends BaseTool<typeof RandomGifSchema> {
    constructor(private config: GiphyToolConfig = {}) {
        super({
            id: 'giphy_random',
            name: 'GIPHY Random GIF',
            description: 'Get a random GIF from GIPHY, optionally filtered by tag.',
            category: ToolCategory.WEB,
            parameters: RandomGifSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof RandomGifSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const params = new URLSearchParams({
            api_key: key,
            rating: input.rating ?? (this.config.rating ?? 'pg'),
        });
        if (input.tag) params.set('tag', input.tag);
        const res = await fetch(`https://api.giphy.com/v1/gifs/random?${params}`);
        if (!res.ok) throw new Error(`GIPHY API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class GiphyTranslateTool extends BaseTool<typeof TranslateSchema> {
    constructor(private config: GiphyToolConfig = {}) {
        super({
            id: 'giphy_translate',
            name: 'GIPHY Translate',
            description: 'Translate a phrase or word into a GIF using GIPHY.',
            category: ToolCategory.WEB,
            parameters: TranslateSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof TranslateSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const params = new URLSearchParams({
            api_key: key,
            s: input.phrase,
            weirdness: String(input.weirdness ?? 0),
        });
        const res = await fetch(`https://api.giphy.com/v1/gifs/translate?${params}`);
        if (!res.ok) throw new Error(`GIPHY API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class GiphyToolkit {
    readonly search: GiphySearchTool;
    readonly trending: GiphyTrendingTool;
    readonly getGif: GiphyGetGifTool;
    readonly random: GiphyRandomTool;
    readonly translate: GiphyTranslateTool;

    constructor(config: GiphyToolConfig = {}) {
        this.search = new GiphySearchTool(config);
        this.trending = new GiphyTrendingTool(config);
        this.getGif = new GiphyGetGifTool(config);
        this.random = new GiphyRandomTool(config);
        this.translate = new GiphyTranslateTool(config);
    }

    getTools() {
        return [this.search, this.trending, this.getGif, this.random, this.translate];
    }
}
