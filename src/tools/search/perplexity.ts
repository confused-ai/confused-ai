/**
 * Perplexity AI search tool — AI-powered web search with citations.
 * API key: https://www.perplexity.ai/settings/api
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface PerplexityToolConfig {
    /** Perplexity API key (or PERPLEXITY_API_KEY env var) */
    apiKey?: string;
    /** Default model to use */
    model?: string;
    /** Default max search results */
    maxResults?: number;
    /** Filter by recency: day, week, month, year */
    searchRecencyFilter?: 'day' | 'week' | 'month' | 'year';
}

const SearchSchema = z.object({
    query: z.string().describe('The search query'),
    model: z.string().optional().default('sonar').describe('Perplexity model (sonar, sonar-pro, sonar-reasoning)'),
    maxResults: z.number().int().min(1).max(10).optional().default(5).describe('Max number of results'),
    searchRecencyFilter: z.enum(['day', 'week', 'month', 'year']).optional()
        .describe('Filter results by recency'),
    searchDomainFilter: z.array(z.string()).optional()
        .describe('Restrict to specific domains (prefix with - to exclude)'),
});

export class PerplexitySearchTool extends BaseTool<typeof SearchSchema, {
    answer: string;
    citations: string[];
    results: Array<{ url: string; title?: string; snippet?: string; date?: string }>;
}> {
    constructor(private config: PerplexityToolConfig = {}) {
        super({
            id: 'perplexity_search',
            name: 'Perplexity Search',
            description: 'AI-powered web search using Perplexity. Returns ranked results with citations and an AI-generated answer.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const apiKey = this.config.apiKey ?? process.env['PERPLEXITY_API_KEY'];
        if (!apiKey) throw new Error('PerplexitySearchTool requires PERPLEXITY_API_KEY');

        const body: Record<string, unknown> = {
            model: input.model ?? this.config.model ?? 'sonar',
            messages: [
                { role: 'system', content: 'Be precise and concise.' },
                { role: 'user', content: input.query },
            ],
            max_tokens: 1024,
            search_recency_filter: input.searchRecencyFilter ?? this.config.searchRecencyFilter,
            web_search_options: { search_context_size: 'high' },
        };

        if (input.searchDomainFilter?.length) {
            body['search_domain_filter'] = input.searchDomainFilter;
        }

        const res = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error(`Perplexity API ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            choices: Array<{ message: { content: string } }>;
            citations?: string[];
        };

        const answer = data.choices[0]?.message?.content ?? '';
        const citations = data.citations ?? [];

        return {
            answer,
            citations,
            results: citations.map((url: string) => ({ url })),
        };
    }
}

export class PerplexityToolkit {
    readonly search: PerplexitySearchTool;

    constructor(config: PerplexityToolConfig = {}) {
        this.search = new PerplexitySearchTool(config);
    }

    getTools() {
        return [this.search];
    }
}
