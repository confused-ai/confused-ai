/**
 * SerpApi tool implementation - TypeScript SerpApiTools
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';

/**
 * SerpApi result types
 */
interface SerpApiSearchResult {
    title?: string;
    link?: string;
    snippet?: string;
    displayed_link?: string;
}

interface SerpApiVideoResult {
    title?: string;
    link?: string;
    snippet?: string;
    thumbnail?: string;
    duration?: string;
}

interface SerpApiChannelResult {
    title?: string;
    link?: string;
    thumbnail?: string;
}

interface SerpApiResult {
    data?: unknown;
    error?: string;
}

/**
 * Base SerpApi tool with common authentication
 */
abstract class BaseSerpApiTool<TParams extends z.ZodObject<Record<string, z.ZodType>>> extends BaseTool<TParams, SerpApiResult> {
    protected apiKey: string;
    protected baseUrl = 'https://serpapi.com/search';

    constructor(
        config: Partial<Omit<BaseToolConfig<TParams>, 'parameters'>> & {
            apiKey?: string;
        },
        params: TParams
    ) {
        super({
            name: config.name || 'serpapi_tool',
            description: config.description || 'SerpApi tool',
            parameters: params,
            category: config.category || ToolCategory.WEB,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config.permissions,
            },
            ...config,
        });

        this.apiKey = config.apiKey || process.env['SERPAPI_API_KEY'] || '';

        if (!this.apiKey) {
            throw new Error('SerpApi API key is required. Set SERPAPI_API_KEY environment variable or pass apiKey in config.');
        }
    }

    protected async serpApiRequest(params: Record<string, string>): Promise<Response> {
        const queryParams = new URLSearchParams({
            api_key: this.apiKey,
            ...params,
        });

        return fetch(`${this.baseUrl}?${queryParams.toString()}`);
    }
}

/**
 * Google search tool
 */
const SerpApiGoogleSearchParameters = z.object({
    query: z.string().describe('The search query'),
    num_results: z.number().min(1).max(100).optional().default(10).describe('Number of results to return'),
});

export class SerpApiGoogleSearchTool extends BaseSerpApiTool<typeof SerpApiGoogleSearchParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof SerpApiGoogleSearchParameters>, 'parameters'>> & {
            apiKey?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'serpapi_google_search',
                description: config?.description ?? 'Search Google using SerpApi',
                ...config,
            },
            SerpApiGoogleSearchParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof SerpApiGoogleSearchParameters>,
        _context: ToolContext
    ): Promise<SerpApiResult> {
        try {
            const response = await this.serpApiRequest({
                engine: 'google',
                q: params.query,
                num: params.num_results.toString(),
            });

            if (!response.ok) {
                throw new Error(`SerpApi error: ${response.status}`);
            }

            const data = (await response.json()) as {
                organic_results?: SerpApiSearchResult[];
                knowledge_graph?: unknown;
                related_questions?: unknown[];
            };

            return {
                data: {
                    search_results: (data.organic_results || []).map((result) => ({
                        title: result.title,
                        url: result.link,
                        snippet: result.snippet,
                        displayed_link: result.displayed_link,
                    })),
                    knowledge_graph: data.knowledge_graph,
                    related_questions: data.related_questions,
                },
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * YouTube search tool
 */
const SerpApiYouTubeSearchParameters = z.object({
    query: z.string().describe('The search query'),
    num_results: z.number().min(1).max(50).optional().default(10).describe('Number of results to return'),
});

export class SerpApiYouTubeSearchTool extends BaseSerpApiTool<typeof SerpApiYouTubeSearchParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof SerpApiYouTubeSearchParameters>, 'parameters'>> & {
            apiKey?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'serpapi_youtube_search',
                description: config?.description ?? 'Search YouTube using SerpApi',
                ...config,
            },
            SerpApiYouTubeSearchParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof SerpApiYouTubeSearchParameters>,
        _context: ToolContext
    ): Promise<SerpApiResult> {
        try {
            const response = await this.serpApiRequest({
                engine: 'youtube',
                search_query: params.query,
                num: params.num_results.toString(),
            });

            if (!response.ok) {
                throw new Error(`SerpApi error: ${response.status}`);
            }

            const data = (await response.json()) as {
                video_results?: SerpApiVideoResult[];
                channel_results?: SerpApiChannelResult[];
            };

            return {
                data: {
                    video_results: (data.video_results || []).map((result) => ({
                        title: result.title,
                        url: result.link,
                        snippet: result.snippet,
                        thumbnail: result.thumbnail,
                        duration: result.duration,
                    })),
                    channel_results: (data.channel_results || []).map((result) => ({
                        title: result.title,
                        url: result.link,
                        thumbnail: result.thumbnail,
                    })),
                },
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * SerpApi toolkit
 */
export class SerpApiToolkit {
    static create(options?: {
        apiKey?: string;
        enableGoogleSearch?: boolean;
        enableYouTubeSearch?: boolean;
    }): Array<SerpApiGoogleSearchTool | SerpApiYouTubeSearchTool> {
        const tools: Array<SerpApiGoogleSearchTool | SerpApiYouTubeSearchTool> = [];

        if (options?.enableGoogleSearch !== false) {
            tools.push(new SerpApiGoogleSearchTool({ ...(options?.apiKey !== undefined && { apiKey: options.apiKey }) }));
        }
        if (options?.enableYouTubeSearch !== false) {
            tools.push(new SerpApiYouTubeSearchTool({ ...(options?.apiKey !== undefined && { apiKey: options.apiKey }) }));
        }

        return tools;
    }
}
