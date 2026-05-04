/**
 * Exa tools — neural search and content retrieval via Exa AI.
 * API key: https://exa.ai/
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface ExaToolConfig {
    /** Exa API key (or EXA_API_KEY env var) */
    apiKey?: string;
}

function getKey(config: ExaToolConfig): string {
    const key = config.apiKey ?? process.env.EXA_API_KEY;
    if (!key) throw new Error('ExaTools require EXA_API_KEY');
    return key;
}

async function exaFetch(apiKey: string, path: string, body: object): Promise<unknown> {
    const res = await fetch(`https://api.exa.ai${path}`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Exa API ${res.status}: ${await res.text()}`);
    return res.json();
}

interface ExaResult {
    id: string;
    url: string;
    title: string;
    score: number;
    publishedDate?: string;
    author?: string;
    text?: string;
    highlights?: string[];
}

function mapResult(r: Record<string, unknown>): ExaResult {
    return {
        id: r.id as string,
        url: r.url as string,
        title: r.title as string,
        score: r.score as number,
        publishedDate: r.publishedDate as string | undefined,
        author: r.author as string | undefined,
        text: r.text as string | undefined,
        highlights: r.highlights as string[] | undefined,
    };
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchSchema = z.object({
    query: z.string().describe('Natural language search query'),
    numResults: z.number().int().min(1).max(100).optional().default(10),
    useAutoprompt: z.boolean().optional().default(true).describe('Let Exa optimize the query'),
    type: z.enum(['neural', 'keyword', 'auto']).optional().default('auto'),
    includeDomains: z.array(z.string()).optional().describe('Restrict results to these domains'),
    excludeDomains: z.array(z.string()).optional().describe('Exclude these domains'),
    startPublishedDate: z.string().optional().describe('ISO date string — only results published after this date'),
    endPublishedDate: z.string().optional().describe('ISO date string — only results published before this date'),
    includeText: z.boolean().optional().default(false).describe('Include page text in results'),
    includeHighlights: z.boolean().optional().default(false).describe('Include highlighted excerpts'),
});

const FindSimilarSchema = z.object({
    url: z.string().describe('URL to find similar content for'),
    numResults: z.number().int().min(1).max(100).optional().default(10),
    includeDomains: z.array(z.string()).optional(),
    excludeDomains: z.array(z.string()).optional(),
    includeText: z.boolean().optional().default(false),
});

const GetContentsSchema = z.object({
    urls: z.array(z.string()).min(1).max(25).describe('List of URLs to retrieve content for'),
    text: z.boolean().optional().default(true).describe('Include full page text'),
    highlights: z.boolean().optional().default(false),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ExaSearchTool extends BaseTool<typeof SearchSchema, { results: ExaResult[]; count: number }> {
    constructor(private config: ExaToolConfig = {}) {
        super({
            id: 'exa_search',
            name: 'Exa Search',
            description: 'Neural search via Exa AI — returns semantically relevant web results ranked by meaning, not keywords.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 20000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {
            query: input.query,
            numResults: input.numResults ?? 10,
            useAutoprompt: input.useAutoprompt ?? true,
            type: input.type ?? 'auto',
        };
        if (input.includeDomains?.length) body.includeDomains = input.includeDomains;
        if (input.excludeDomains?.length) body.excludeDomains = input.excludeDomains;
        if (input.startPublishedDate) body.startPublishedDate = input.startPublishedDate;
        if (input.endPublishedDate) body.endPublishedDate = input.endPublishedDate;
        if (input.includeText) body.contents = { text: true };
        if (input.includeHighlights) body.contents = { ...(body.contents as object ?? {}), highlights: { numSentences: 3, highlightsPerUrl: 2 } };

        const data = await exaFetch(getKey(this.config), '/search', body) as { results: Array<Record<string, unknown>> };
        const results = (data.results ?? []).map(mapResult);
        return { results, count: results.length };
    }
}

export class ExaFindSimilarTool extends BaseTool<typeof FindSimilarSchema, { results: ExaResult[]; count: number }> {
    constructor(private config: ExaToolConfig = {}) {
        super({
            id: 'exa_find_similar',
            name: 'Exa Find Similar',
            description: 'Find web pages similar to a given URL using Exa neural similarity.',
            category: ToolCategory.WEB,
            parameters: FindSimilarSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 20000 },
        });
    }

    protected async performExecute(input: z.infer<typeof FindSimilarSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {
            url: input.url,
            numResults: input.numResults ?? 10,
        };
        if (input.includeDomains?.length) body.includeDomains = input.includeDomains;
        if (input.excludeDomains?.length) body.excludeDomains = input.excludeDomains;
        if (input.includeText) body.contents = { text: true };

        const data = await exaFetch(getKey(this.config), '/findSimilar', body) as { results: Array<Record<string, unknown>> };
        const results = (data.results ?? []).map(mapResult);
        return { results, count: results.length };
    }
}

export class ExaGetContentsTool extends BaseTool<typeof GetContentsSchema, { contents: ExaResult[] }> {
    constructor(private config: ExaToolConfig = {}) {
        super({
            id: 'exa_get_contents',
            name: 'Exa Get Contents',
            description: 'Retrieve the full text and metadata of specific URLs via Exa.',
            category: ToolCategory.WEB,
            parameters: GetContentsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 20000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetContentsSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = { ids: input.urls };
        const contentsOpts: Record<string, unknown> = {};
        if (input.text) contentsOpts.text = true;
        if (input.highlights) contentsOpts.highlights = { numSentences: 3, highlightsPerUrl: 2 };
        if (Object.keys(contentsOpts).length) body.contents = contentsOpts;

        const data = await exaFetch(getKey(this.config), '/contents', body) as { results: Array<Record<string, unknown>> };
        const contents = (data.results ?? []).map(mapResult);
        return { contents };
    }
}

export class ExaToolkit {
    readonly tools: BaseTool[];
    constructor(config: ExaToolConfig = {}) {
        this.tools = [
            new ExaSearchTool(config),
            new ExaFindSimilarTool(config),
            new ExaGetContentsTool(config),
        ];
    }
}
