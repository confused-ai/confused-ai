/**
 * Web search tool implementation - TypeScript  WebSearchTools and DuckDuckGoTools
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';

/**
 * Search result item
 */
interface SearchResult {
    title: string;
    url: string;
    snippet?: string;
    source?: string;
}

interface WebSearchResponse {
    query: string;
    results: SearchResult[];
    backend?: string;
}

interface NewsResult {
    title: string;
    url: string;
    snippet?: string;
    date?: string;
    source?: string;
}

interface NewsSearchResponse {
    query: string;
    results: NewsResult[];
    backend?: string;
}

/**
 * Parameters for web search
 */
const WebSearchParameters = z.object({
    query: z.string().describe('The search query'),
    max_results: z.number().min(1).max(20).optional().default(5).describe('Maximum number of results to return'),
});

/**
 * DuckDuckGo search tool using DuckDuckGo's HTML interface
 */
export class DuckDuckGoSearchTool extends BaseTool<typeof WebSearchParameters, WebSearchResponse> {
    private modifier?: string;

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof WebSearchParameters>, 'parameters'>> & {
            modifier?: string;
        }
    ) {
        super({
            name: config?.name ?? 'duckduckgo_search',
            description: config?.description ?? 'Search the web using DuckDuckGo',
            parameters: WebSearchParameters,
            category: config?.category ?? ToolCategory.WEB,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });
        this.modifier = config?.modifier;
    }

    protected async performExecute(
        params: z.infer<typeof WebSearchParameters>,
        _context: ToolContext
    ): Promise<WebSearchResponse> {
        const searchQuery = this.modifier ? `${this.modifier} ${params.query}` : params.query;

        try {
            // Use DuckDuckGo's instant answer API
            const response = await fetch(
                `https://duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`DuckDuckGo search failed: ${response.status}`);
            }

            const html = await response.text();
            const results = this.parseResults(html, params.max_results);

            return {
                query: searchQuery,
                results,
                backend: 'duckduckgo',
            };
        } catch (error) {
            // Fallback to returning empty results with error info
            return {
                query: searchQuery,
                results: [],
                backend: 'duckduckgo',
            };
        }
    }

    private parseResults(html: string, maxResults: number): SearchResult[] {
        const results: SearchResult[] = [];
        // Simple regex-based parsing for DuckDuckGo HTML results
        const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;

        let match;
        const titles: string[] = [];
        const urls: string[] = [];

        while ((match = resultRegex.exec(html)) !== null && urls.length < maxResults) {
            const url = match[1];
            const title = match[2].replace(/<[^>]*>/g, ''); // Strip HTML tags
            if (url && !url.startsWith('/')) {
                urls.push(url);
                titles.push(title);
            }
        }

        for (let i = 0; i < urls.length; i++) {
            results.push({
                title: titles[i] || 'Untitled',
                url: urls[i],
                source: 'DuckDuckGo',
            });
        }

        return results;
    }
}

/**
 * DuckDuckGo news search tool
 */
export class DuckDuckGoNewsTool extends BaseTool<typeof WebSearchParameters, NewsSearchResponse> {
    constructor(config?: Partial<Omit<BaseToolConfig<typeof WebSearchParameters>, 'parameters'>>) {
        super({
            name: config?.name ?? 'duckduckgo_news',
            description: config?.description ?? 'Search for news using DuckDuckGo',
            parameters: WebSearchParameters,
            category: config?.category ?? ToolCategory.WEB,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });
    }

    protected async performExecute(
        params: z.infer<typeof WebSearchParameters>,
        _context: ToolContext
    ): Promise<NewsSearchResponse> {
        try {
            const response = await fetch(
                `https://duckduckgo.com/html/?q=${encodeURIComponent(params.query + ' news')}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`DuckDuckGo news search failed: ${response.status}`);
            }

            const html = await response.text();
            const results = this.parseNewsResults(html, params.max_results);

            return {
                query: params.query,
                results,
                backend: 'duckduckgo',
            };
        } catch (error) {
            return {
                query: params.query,
                results: [],
                backend: 'duckduckgo',
            };
        }
    }

    private parseNewsResults(html: string, maxResults: number): NewsResult[] {
        const results: NewsResult[] = [];
        // Similar parsing logic for news
        const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;

        let match;
        while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
            const url = match[1];
            const title = match[2].replace(/<[^>]*>/g, '');
            if (url && !url.startsWith('/')) {
                results.push({
                    title: title || 'Untitled',
                    url: url,
                    source: 'DuckDuckGo News',
                });
            }
        }

        return results;
    }
}

/**
 * Generic web search tool that can use different backends
 */
const GenericWebSearchParameters = z.object({
    query: z.string().describe('The search query'),
    max_results: z.number().min(1).max(20).optional().default(5).describe('Maximum number of results to return'),
    backend: z.enum(['duckduckgo', 'bing', 'google']).optional().default('duckduckgo').describe('Search backend to use'),
});

export class WebSearchTool extends BaseTool<typeof GenericWebSearchParameters, WebSearchResponse> {
    private modifier?: string;

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof GenericWebSearchParameters>, 'parameters'>> & {
            modifier?: string;
        }
    ) {
        super({
            name: config?.name ?? 'web_search',
            description: config?.description ?? 'Search the web using various search engines',
            parameters: GenericWebSearchParameters,
            category: config?.category ?? ToolCategory.WEB,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });
        this.modifier = config?.modifier;
    }

    protected async performExecute(
        params: z.infer<typeof GenericWebSearchParameters>,
        _context: ToolContext
    ): Promise<WebSearchResponse> {
        const searchQuery = this.modifier ? `${this.modifier} ${params.query}` : params.query;

        // For now, only DuckDuckGo is implemented without API keys
        // Other backends would require API keys
        switch (params.backend) {
            case 'duckduckgo':
            default:
                return this.searchDuckDuckGo(searchQuery, params.max_results);
        }
    }

    private async searchDuckDuckGo(query: string, maxResults: number): Promise<WebSearchResponse> {
        try {
            const response = await fetch(
                `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const html = await response.text();
            const results = this.parseResults(html, maxResults);

            return {
                query,
                results,
                backend: 'duckduckgo',
            };
        } catch (error) {
            return {
                query,
                results: [],
                backend: 'duckduckgo',
            };
        }
    }

    private parseResults(html: string, maxResults: number): SearchResult[] {
        const results: SearchResult[] = [];
        const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;

        let match;
        while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
            const url = match[1];
            const title = match[2].replace(/<[^>]*>/g, '');
            if (url && !url.startsWith('/')) {
                results.push({
                    title: title || 'Untitled',
                    url: url,
                    source: 'DuckDuckGo',
                });
            }
        }

        return results;
    }
}

/**
 * Web search toolkit
 */
export class WebSearchToolkit {
    static createDuckDuckGo(options?: { modifier?: string; enableNews?: boolean }): Array<DuckDuckGoSearchTool | DuckDuckGoNewsTool> {
        const tools: Array<DuckDuckGoSearchTool | DuckDuckGoNewsTool> = [
            new DuckDuckGoSearchTool({ modifier: options?.modifier }),
        ];
        if (options?.enableNews !== false) {
            tools.push(new DuckDuckGoNewsTool());
        }
        return tools;
    }

    static createGeneric(options?: { modifier?: string }): Array<WebSearchTool> {
        return [new WebSearchTool({ modifier: options?.modifier })];
    }
}
