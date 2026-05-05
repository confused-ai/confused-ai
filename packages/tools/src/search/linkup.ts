/**
 * Linkup search tool — AI-powered search with source grounding.
 * API key: https://app.linkup.so
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface LinkupToolConfig {
    /** Linkup API key (or LINKUP_API_KEY env var) */
    apiKey?: string;
}

function getKey(config: LinkupToolConfig): string {
    const key = config.apiKey ?? process.env['LINKUP_API_KEY'];
    if (!key) throw new Error('LinkupSearchTool requires LINKUP_API_KEY');
    return key;
}

const SearchSchema = z.object({
    query: z.string().describe('Search query'),
    depth: z.enum(['standard', 'deep']).optional().default('standard')
        .describe('Search depth: standard (fast) or deep (more thorough)'),
    outputType: z.enum(['searchResults', 'sourcedAnswer']).optional().default('searchResults')
        .describe('Output type: searchResults returns a list, sourcedAnswer returns an AI answer with sources'),
    numResults: z.number().int().min(1).max(10).optional().default(5)
        .describe('Number of results (for searchResults output)'),
});

export class LinkupSearchTool extends BaseTool<typeof SearchSchema, {
    query: string;
    answer?: string;
    results?: Array<{ name: string; url: string; content: string }>;
}> {
    constructor(private config: LinkupToolConfig = {}) {
        super({
            id: 'linkup_search',
            name: 'Linkup Search',
            description: 'AI-powered web search with source grounding via Linkup. Supports both raw search results and AI-generated sourced answers.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const res = await fetch('https://api.linkup.so/v1/search', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${getKey(this.config)}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: input.query,
                depth: input.depth ?? 'standard',
                outputType: input.outputType ?? 'searchResults',
                numResults: input.numResults ?? 5,
            }),
        });
        if (!res.ok) throw new Error(`Linkup API ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            answer?: string;
            results?: Array<{ name: string; url: string; content: string }>;
        };

        return { query: input.query, ...(data.answer !== undefined && { answer: data.answer }), results: data.results ?? [] };
    }
}

export class LinkupToolkit {
    readonly search: LinkupSearchTool;

    constructor(config: LinkupToolConfig = {}) {
        this.search = new LinkupSearchTool(config);
    }

    getTools() {
        return [this.search];
    }
}
