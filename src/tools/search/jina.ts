/**
 * Jina AI tools — web reader and reranker via Jina AI APIs.
 * API key: https://jina.ai (optional for basic usage)
 * Docs: https://jina.ai/reader, https://jina.ai/reranker, https://jina.ai/search
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface JinaToolConfig {
    /** Jina AI API key (or JINA_API_KEY env var) — optional, increases rate limits */
    apiKey?: string;
}

function getHeaders(config: JinaToolConfig): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const key = config.apiKey ?? process.env.JINA_API_KEY;
    if (key) headers['Authorization'] = `Bearer ${key}`;
    return headers;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ReadSchema = z.object({
    url: z.string().url().describe('URL to read and convert to clean text/markdown'),
    returnFormat: z.enum(['markdown', 'text', 'html']).optional().default('markdown')
        .describe('Output format for the content'),
    proxyUrl: z.string().optional().describe('Proxy URL to use for fetching'),
});

const SearchSchema = z.object({
    query: z.string().describe('Search query'),
    numResults: z.number().int().min(1).max(10).optional().default(5)
        .describe('Number of results to return'),
});

const RerankSchema = z.object({
    query: z.string().describe('The query to rerank against'),
    documents: z.array(z.string()).min(1).max(100).describe('List of documents to rerank'),
    topN: z.number().int().min(1).optional().describe('Return top N results'),
    model: z.string().optional().default('jina-reranker-v2-base-multilingual')
        .describe('Reranker model to use'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class JinaReaderTool extends BaseTool<typeof ReadSchema, {
    url: string;
    title?: string;
    content: string;
    description?: string;
}> {
    constructor(private config: JinaToolConfig = {}) {
        super({
            id: 'jina_reader',
            name: 'Jina Reader',
            description: 'Convert any URL to clean, LLM-friendly text or markdown using Jina AI Reader.',
            category: ToolCategory.WEB,
            parameters: ReadSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ReadSchema>, _ctx: ToolContext) {
        const headers = getHeaders(this.config);
        headers['X-Return-Format'] = input.returnFormat ?? 'markdown';
        if (input.proxyUrl) headers['X-Proxy-Url'] = input.proxyUrl;

        const res = await fetch(`https://r.jina.ai/${input.url}`, { headers });
        if (!res.ok) throw new Error(`Jina Reader ${res.status}: ${await res.text()}`);

        const contentType = res.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            const data = await res.json() as { data?: { title?: string; content?: string; description?: string; url?: string } };
            return {
                url: data.data?.url ?? input.url,
                title: data.data?.title,
                content: data.data?.content ?? '',
                description: data.data?.description,
            };
        }

        const text = await res.text();
        return { url: input.url, content: text };
    }
}

export class JinaSearchTool extends BaseTool<typeof SearchSchema, {
    query: string;
    results: Array<{ title: string; url: string; content: string; description?: string }>;
}> {
    constructor(private config: JinaToolConfig = {}) {
        super({
            id: 'jina_search',
            name: 'Jina Search',
            description: 'AI-powered web search using Jina AI. Returns results with clean content extraction.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const headers = getHeaders(this.config);
        const params = new URLSearchParams({ q: input.query });

        const res = await fetch(`https://s.jina.ai/?${params}`, { headers });
        if (!res.ok) throw new Error(`Jina Search ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            data?: Array<{ title: string; url: string; content: string; description?: string }>;
        };

        return {
            query: input.query,
            results: (data.data ?? []).slice(0, input.numResults ?? 5),
        };
    }
}

export class JinaRerankTool extends BaseTool<typeof RerankSchema, {
    query: string;
    results: Array<{ document: string; relevanceScore: number; index: number }>;
}> {
    constructor(private config: JinaToolConfig = {}) {
        super({
            id: 'jina_rerank',
            name: 'Jina Rerank',
            description: 'Rerank a list of documents by relevance to a query using Jina AI Reranker.',
            category: ToolCategory.WEB,
            parameters: RerankSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof RerankSchema>, _ctx: ToolContext) {
        const headers = getHeaders(this.config);
        headers['Content-Type'] = 'application/json';

        const res = await fetch('https://api.jina.ai/v1/rerank', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: input.model ?? 'jina-reranker-v2-base-multilingual',
                query: input.query,
                documents: input.documents,
                top_n: input.topN,
            }),
        });
        if (!res.ok) throw new Error(`Jina Rerank ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            results?: Array<{ document: { text: string }; relevance_score: number; index: number }>;
        };

        return {
            query: input.query,
            results: (data.results ?? []).map(r => ({
                document: r.document.text,
                relevanceScore: r.relevance_score,
                index: r.index,
            })),
        };
    }
}

export class JinaToolkit {
    readonly reader: JinaReaderTool;
    readonly search: JinaSearchTool;
    readonly rerank: JinaRerankTool;

    constructor(config: JinaToolConfig = {}) {
        this.reader = new JinaReaderTool(config);
        this.search = new JinaSearchTool(config);
        this.rerank = new JinaRerankTool(config);
    }

    getTools() {
        return [this.reader, this.search, this.rerank];
    }
}
