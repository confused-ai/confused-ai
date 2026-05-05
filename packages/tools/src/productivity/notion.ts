/**
 * Notion tool implementation - TypeScript NotionTools
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';

/**
 * Notion API types
 */
interface NotionPage {
    id: string;
    url: string;
    properties: Record<string, unknown>;
}

interface NotionSearchResult {
    results: NotionPage[];
}

interface NotionResult {
    data?: unknown;
    error?: string;
}

/**
 * Base Notion tool with common authentication
 */
abstract class BaseNotionTool<TParams extends z.ZodObject<Record<string, z.ZodType>>> extends BaseTool<TParams, NotionResult> {
    protected token: string;
    protected databaseId?: string;
    protected baseUrl = 'https://api.notion.com/v1';

    constructor(
        config: Partial<Omit<BaseToolConfig<TParams>, 'parameters'>> & {
            token?: string;
            databaseId?: string;
        },
        params: TParams
    ) {
        super({
            name: config.name || 'notion.tool',
            description: config.description || 'Notion tool',
            parameters: params,
            category: config.category || ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config.permissions,
            },
            ...config,
        });

        this.token = config.token || process.env['NOTION_API_TOKEN'] || '';
        const _ndb = config.databaseId || process.env['NOTION_DATABASE_ID'];
        if (_ndb !== undefined) this.databaseId = _ndb;

        if (!this.token) {
            throw new Error('Notion API token is required. Set NOTION_API_TOKEN environment variable or pass token in config.');
        }
    }

    protected async notionRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
        return fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
        });
    }
}

/**
 * Create page tool
 */
const NotionCreatePageParameters = z.object({
    parent_database_id: z.string().optional().describe('Database ID to create page in (overrides default)'),
    title: z.string().describe('The page title'),
    content: z.string().describe('The page content'),
    properties: z.record(z.string(), z.unknown()).optional().describe('Additional properties for the page'),
});

export class NotionCreatePageTool extends BaseNotionTool<typeof NotionCreatePageParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof NotionCreatePageParameters>, 'parameters'>> & {
            token?: string;
            databaseId?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'notion.create_page',
                description: config?.description ?? 'Create a new page in Notion',
                ...config,
            },
            NotionCreatePageParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof NotionCreatePageParameters>,
        _context: ToolContext
    ): Promise<NotionResult> {
        const databaseId = params.parent_database_id || this.databaseId;

        if (!databaseId) {
            return {
                error: 'Database ID is required. Set NOTION_DATABASE_ID environment variable, pass databaseId in config, or provide parent_database_id in parameters.',
            };
        }

        try {
            const body: Record<string, unknown> = {
                parent: { database_id: databaseId },
                properties: {
                    Name: {
                        title: [{ text: { content: params.title } }],
                    },
                    ...params.properties,
                },
                children: [
                    {
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [{ type: 'text', text: { content: params.content } }],
                        },
                    },
                ],
            };

            const response = await this.notionRequest('/pages', {
                method: 'POST',
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorData = (await response.json()) as { message?: string };
                throw new Error(errorData.message || `Notion API error: ${response.status}`);
            }

            const data = (await response.json()) as NotionPage;

            return {
                data: {
                    id: data.id,
                    url: data.url,
                    title: params.title,
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
 * Search pages tool
 */
const NotionSearchParameters = z.object({
    query: z.string().describe('Search query string'),
    filter: z.enum(['page', 'database']).optional().describe('Filter by type'),
});

export class NotionSearchTool extends BaseNotionTool<typeof NotionSearchParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof NotionSearchParameters>, 'parameters'>> & {
            token?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'notion.search',
                description: config?.description ?? 'Search for pages and databases in Notion',
                ...config,
            },
            NotionSearchParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof NotionSearchParameters>,
        _context: ToolContext
    ): Promise<NotionResult> {
        try {
            const body: Record<string, unknown> = {
                query: params.query,
            };

            if (params.filter) {
                body['filter'] = {
                    value: params.filter,
                    property: 'object',
                };
            }

            const response = await this.notionRequest('/search', {
                method: 'POST',
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorData = (await response.json()) as { message?: string };
                throw new Error(errorData.message || `Notion API error: ${response.status}`);
            }

            const data = (await response.json()) as NotionSearchResult;

            const results = data.results.map((page) => ({
                id: page.id,
                url: page.url,
                object: page.properties,
            }));

            return {
                data: {
                    count: results.length,
                    results,
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
 * Update page tool
 */
const NotionUpdatePageParameters = z.object({
    page_id: z.string().describe('The page ID to update'),
    content: z.string().describe('Content to append to the page'),
});

export class NotionUpdatePageTool extends BaseNotionTool<typeof NotionUpdatePageParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof NotionUpdatePageParameters>, 'parameters'>> & {
            token?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'notion.update_page',
                description: config?.description ?? 'Add content to an existing Notion page',
                ...config,
            },
            NotionUpdatePageParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof NotionUpdatePageParameters>,
        _context: ToolContext
    ): Promise<NotionResult> {
        try {
            const response = await this.notionRequest(`/blocks/${params.page_id}/children`, {
                method: 'PATCH',
                body: JSON.stringify({
                    children: [
                        {
                            object: 'block',
                            type: 'paragraph',
                            paragraph: {
                                rich_text: [{ type: 'text', text: { content: params.content } }],
                            },
                        },
                    ],
                }),
            });

            if (!response.ok) {
                const errorData = (await response.json()) as { message?: string };
                throw new Error(errorData.message || `Notion API error: ${response.status}`);
            }

            return {
                data: {
                    pageId: params.page_id,
                    message: 'Content added successfully',
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
 * Notion toolkit
 */
export class NotionToolkit {
    static create(options?: {
        token?: string;
        databaseId?: string;
        enableCreatePage?: boolean;
        enableSearch?: boolean;
        enableUpdatePage?: boolean;
    }): Array<NotionCreatePageTool | NotionSearchTool | NotionUpdatePageTool> {
        const tools: Array<NotionCreatePageTool | NotionSearchTool | NotionUpdatePageTool> = [];

        if (options?.enableCreatePage !== false) {
            tools.push(new NotionCreatePageTool({ ...(options?.token !== undefined && { token: options.token }), ...(options?.databaseId !== undefined && { databaseId: options.databaseId }) }));
        }
        if (options?.enableSearch !== false) {
            tools.push(new NotionSearchTool({ ...(options?.token !== undefined && { token: options.token }) }));
        }
        if (options?.enableUpdatePage !== false) {
            tools.push(new NotionUpdatePageTool({ ...(options?.token !== undefined && { token: options.token }) }));
        }

        return tools;
    }
}
