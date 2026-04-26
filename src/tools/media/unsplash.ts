/**
 * Unsplash tools — search and retrieve high-quality photos via Unsplash API.
 * API docs: https://unsplash.com/documentation
 * Access key: https://unsplash.com/oauth/applications
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface UnsplashToolConfig {
    /** Unsplash Access Key (or UNSPLASH_ACCESS_KEY env var) */
    accessKey?: string;
}

function getKey(config: UnsplashToolConfig): string {
    const key = config.accessKey ?? process.env.UNSPLASH_ACCESS_KEY;
    if (!key) throw new Error('UnsplashTools require UNSPLASH_ACCESS_KEY');
    return key;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchPhotosSchema = z.object({
    query: z.string().describe('Search keywords for photos'),
    page: z.number().int().min(1).optional().default(1).describe('Page number'),
    perPage: z.number().int().min(1).max(30).optional().default(10).describe('Results per page (max 30)'),
    orientation: z.enum(['landscape', 'portrait', 'squarish']).optional()
        .describe('Filter by photo orientation'),
    color: z.string().optional()
        .describe('Filter by color (black_and_white, black, white, yellow, orange, red, purple, magenta, green, teal, blue)'),
    orderBy: z.enum(['relevant', 'latest']).optional().default('relevant').describe('Sort order'),
});

const GetPhotoSchema = z.object({
    photoId: z.string().describe('Unsplash photo ID'),
});

const GetRandomPhotoSchema = z.object({
    query: z.string().optional().describe('Search query for random photo topic'),
    count: z.number().int().min(1).max(30).optional().default(1).describe('Number of random photos'),
    orientation: z.enum(['landscape', 'portrait', 'squarish']).optional(),
    collections: z.string().optional().describe('Comma-separated collection IDs to filter by'),
});

const SearchCollectionsSchema = z.object({
    query: z.string().describe('Search keywords for collections'),
    page: z.number().int().min(1).optional().default(1),
    perPage: z.number().int().min(1).max(30).optional().default(10),
});

const ListCollectionPhotosSchema = z.object({
    collectionId: z.string().describe('Unsplash collection ID'),
    page: z.number().int().min(1).optional().default(1),
    perPage: z.number().int().min(1).max(30).optional().default(10),
    orientation: z.enum(['landscape', 'portrait', 'squarish']).optional(),
});

// ── Types ──────────────────────────────────────────────────────────────────

interface UnsplashPhoto {
    id: string;
    description?: string | null;
    altDescription?: string | null;
    urls: { full: string; regular: string; small: string; thumb: string };
    width: number;
    height: number;
    likes: number;
    user: { name: string; username: string };
    links: { html: string; download: string };
}

// ── Tools ──────────────────────────────────────────────────────────────────

export class UnsplashSearchPhotosTool extends BaseTool<typeof SearchPhotosSchema, {
    photos: UnsplashPhoto[];
    total: number;
    totalPages: number;
}> {
    constructor(private config: UnsplashToolConfig = {}) {
        super({
            id: 'unsplash_search_photos',
            name: 'Unsplash Search Photos',
            description: 'Search for high-quality photos on Unsplash by keywords.',
            category: ToolCategory.WEB,
            parameters: SearchPhotosSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchPhotosSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const params = new URLSearchParams({
            query: input.query,
            page: String(input.page ?? 1),
            per_page: String(input.perPage ?? 10),
            order_by: input.orderBy ?? 'relevant',
        });
        if (input.orientation) params.set('orientation', input.orientation);
        if (input.color) params.set('color', input.color);

        const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
            headers: { Authorization: `Client-ID ${key}` },
        });
        if (!res.ok) throw new Error(`Unsplash API ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            results?: Array<{
                id: string;
                description?: string | null;
                alt_description?: string | null;
                urls?: { full?: string; regular?: string; small?: string; thumb?: string };
                width?: number;
                height?: number;
                likes?: number;
                user?: { name?: string; username?: string };
                links?: { html?: string; download?: string };
            }>;
            total?: number;
            total_pages?: number;
        };
        return {
            photos: (data.results ?? []).map(p => ({
                id: p.id,
                description: p.description,
                altDescription: p.alt_description,
                urls: {
                    full: p.urls?.full ?? '',
                    regular: p.urls?.regular ?? '',
                    small: p.urls?.small ?? '',
                    thumb: p.urls?.thumb ?? '',
                },
                width: p.width ?? 0,
                height: p.height ?? 0,
                likes: p.likes ?? 0,
                user: { name: p.user?.name ?? '', username: p.user?.username ?? '' },
                links: { html: p.links?.html ?? '', download: p.links?.download ?? '' },
            })),
            total: data.total ?? 0,
            totalPages: data.total_pages ?? 0,
        };
    }
}

export class UnsplashGetPhotoTool extends BaseTool<typeof GetPhotoSchema> {
    constructor(private config: UnsplashToolConfig = {}) {
        super({
            id: 'unsplash_get_photo',
            name: 'Unsplash Get Photo',
            description: 'Get details of a specific Unsplash photo by ID.',
            category: ToolCategory.WEB,
            parameters: GetPhotoSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetPhotoSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const res = await fetch(`https://api.unsplash.com/photos/${input.photoId}`, {
            headers: { Authorization: `Client-ID ${key}` },
        });
        if (!res.ok) throw new Error(`Unsplash API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class UnsplashGetRandomPhotoTool extends BaseTool<typeof GetRandomPhotoSchema> {
    constructor(private config: UnsplashToolConfig = {}) {
        super({
            id: 'unsplash_get_random_photo',
            name: 'Unsplash Get Random Photo',
            description: 'Get one or more random photos from Unsplash, optionally filtered by topic.',
            category: ToolCategory.WEB,
            parameters: GetRandomPhotoSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetRandomPhotoSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const params = new URLSearchParams({ count: String(input.count ?? 1) });
        if (input.query) params.set('query', input.query);
        if (input.orientation) params.set('orientation', input.orientation);
        if (input.collections) params.set('collections', input.collections);
        const res = await fetch(`https://api.unsplash.com/photos/random?${params}`, {
            headers: { Authorization: `Client-ID ${key}` },
        });
        if (!res.ok) throw new Error(`Unsplash API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class UnsplashSearchCollectionsTool extends BaseTool<typeof SearchCollectionsSchema> {
    constructor(private config: UnsplashToolConfig = {}) {
        super({
            id: 'unsplash_search_collections',
            name: 'Unsplash Search Collections',
            description: 'Search for photo collections on Unsplash.',
            category: ToolCategory.WEB,
            parameters: SearchCollectionsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchCollectionsSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const params = new URLSearchParams({
            query: input.query,
            page: String(input.page ?? 1),
            per_page: String(input.perPage ?? 10),
        });
        const res = await fetch(`https://api.unsplash.com/search/collections?${params}`, {
            headers: { Authorization: `Client-ID ${key}` },
        });
        if (!res.ok) throw new Error(`Unsplash API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class UnsplashListCollectionPhotosTool extends BaseTool<typeof ListCollectionPhotosSchema> {
    constructor(private config: UnsplashToolConfig = {}) {
        super({
            id: 'unsplash_list_collection_photos',
            name: 'Unsplash List Collection Photos',
            description: 'List photos from a specific Unsplash collection.',
            category: ToolCategory.WEB,
            parameters: ListCollectionPhotosSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListCollectionPhotosSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const params = new URLSearchParams({
            page: String(input.page ?? 1),
            per_page: String(input.perPage ?? 10),
        });
        if (input.orientation) params.set('orientation', input.orientation);
        const res = await fetch(`https://api.unsplash.com/collections/${input.collectionId}/photos?${params}`, {
            headers: { Authorization: `Client-ID ${key}` },
        });
        if (!res.ok) throw new Error(`Unsplash API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class UnsplashToolkit {
    readonly searchPhotos: UnsplashSearchPhotosTool;
    readonly getPhoto: UnsplashGetPhotoTool;
    readonly getRandomPhoto: UnsplashGetRandomPhotoTool;
    readonly searchCollections: UnsplashSearchCollectionsTool;
    readonly listCollectionPhotos: UnsplashListCollectionPhotosTool;

    constructor(config: UnsplashToolConfig = {}) {
        this.searchPhotos = new UnsplashSearchPhotosTool(config);
        this.getPhoto = new UnsplashGetPhotoTool(config);
        this.getRandomPhoto = new UnsplashGetRandomPhotoTool(config);
        this.searchCollections = new UnsplashSearchCollectionsTool(config);
        this.listCollectionPhotos = new UnsplashListCollectionPhotosTool(config);
    }

    getTools() {
        return [this.searchPhotos, this.getPhoto, this.getRandomPhoto, this.searchCollections, this.listCollectionPhotos];
    }
}
