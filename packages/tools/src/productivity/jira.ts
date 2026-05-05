/**
 * Jira tool implementation - TypeScript JiraTools
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';

/**
 * Jira API types
 */
interface JiraIssue {
    key: string;
    fields: {
        summary: string;
        description?: string;
        status: { name: string };
        issuetype: { name: string };
        assignee?: { displayName: string };
        reporter?: { displayName: string };
        project: { key: string };
    };
}

interface JiraSearchResult {
    issues: JiraIssue[];
    total: number;
}

interface JiraResult {
    data?: unknown;
    error?: string;
}

/**
 * Base Jira tool with common authentication
 */
abstract class BaseJiraTool<TParams extends z.ZodObject<Record<string, z.ZodType>>> extends BaseTool<TParams, JiraResult> {
    protected serverUrl: string;
    protected token: string;
    protected email: string;

    constructor(
        config: Partial<Omit<BaseToolConfig<TParams>, 'parameters'>> & {
            serverUrl?: string;
            token?: string;
            email?: string;
        },
        params: TParams
    ) {
        super({
            name: config.name || 'jira_tool',
            description: config.description || 'Jira tool',
            parameters: params,
            category: config.category || ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config.permissions,
            },
            ...config,
        });

        this.serverUrl = config.serverUrl || process.env['JIRA_SERVER_URL'] || '';
        this.token = config.token || process.env['JIRA_TOKEN'] || '';
        this.email = config.email || process.env['JIRA_EMAIL'] || '';

        if (!this.serverUrl) {
            throw new Error('Jira server URL is required. Set JIRA_SERVER_URL environment variable or pass serverUrl in config.');
        }
        if (!this.token) {
            throw new Error('Jira API token is required. Set JIRA_TOKEN environment variable or pass token in config.');
        }
        if (!this.email) {
            throw new Error('Jira email is required. Set JIRA_EMAIL environment variable or pass email in config.');
        }
    }

    protected async jiraRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
        const auth = Buffer.from(`${this.email}:${this.token}`).toString('base64');

        return fetch(`${this.serverUrl}/rest/api/2${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(options.headers || {}),
            },
        });
    }
}

/**
 * Get issue tool
 */
const JiraGetIssueParameters = z.object({
    issue_key: z.string().describe('The issue key (e.g., PROJ-123)'),
});

export class JiraGetIssueTool extends BaseJiraTool<typeof JiraGetIssueParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof JiraGetIssueParameters>, 'parameters'>> & {
            serverUrl?: string;
            token?: string;
            email?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'jira_get_issue',
                description: config?.description ?? 'Get details of a Jira issue',
                ...config,
            },
            JiraGetIssueParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof JiraGetIssueParameters>,
        _context: ToolContext
    ): Promise<JiraResult> {
        try {
            const response = await this.jiraRequest(`/issue/${encodeURIComponent(params.issue_key)}`);

            if (!response.ok) {
                throw new Error(`Jira API error: ${response.status}`);
            }

            const data = (await response.json()) as JiraIssue;

            return {
                data: {
                    key: data.key,
                    summary: data.fields.summary,
                    description: data.fields.description,
                    status: data.fields.status.name,
                    issueType: data.fields.issuetype.name,
                    assignee: data.fields.assignee?.displayName,
                    reporter: data.fields.reporter?.displayName,
                    project: data.fields.project.key,
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
 * Create issue tool
 */
const JiraCreateIssueParameters = z.object({
    project_key: z.string().describe('The project key (e.g., PROJ)'),
    summary: z.string().describe('The issue summary/title'),
    description: z.string().optional().describe('The issue description'),
    issue_type: z.string().optional().default('Task').describe('The issue type (e.g., Task, Bug, Story)'),
});

export class JiraCreateIssueTool extends BaseJiraTool<typeof JiraCreateIssueParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof JiraCreateIssueParameters>, 'parameters'>> & {
            serverUrl?: string;
            token?: string;
            email?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'jira_create_issue',
                description: config?.description ?? 'Create a new Jira issue',
                ...config,
            },
            JiraCreateIssueParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof JiraCreateIssueParameters>,
        _context: ToolContext
    ): Promise<JiraResult> {
        try {
            const body = {
                fields: {
                    project: { key: params.project_key },
                    summary: params.summary,
                    description: params.description,
                    issuetype: { name: params.issue_type },
                },
            };

            const response = await this.jiraRequest('/issue', {
                method: 'POST',
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                throw new Error(`Jira API error: ${response.status}`);
            }

            const data = (await response.json()) as { key: string; self: string };

            return {
                data: {
                    key: data.key,
                    url: `${this.serverUrl}/browse/${data.key}`,
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
 * Search issues tool
 */
const JiraSearchIssuesParameters = z.object({
    jql: z.string().describe('JQL query string'),
    max_results: z.number().min(1).max(100).optional().default(50).describe('Maximum number of results'),
});

export class JiraSearchIssuesTool extends BaseJiraTool<typeof JiraSearchIssuesParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof JiraSearchIssuesParameters>, 'parameters'>> & {
            serverUrl?: string;
            token?: string;
            email?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'jira_search_issues',
                description: config?.description ?? 'Search for issues using JQL',
                ...config,
            },
            JiraSearchIssuesParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof JiraSearchIssuesParameters>,
        _context: ToolContext
    ): Promise<JiraResult> {
        try {
            const response = await this.jiraRequest(
                `/search?jql=${encodeURIComponent(params.jql)}&maxResults=${params.max_results}`
            );

            if (!response.ok) {
                throw new Error(`Jira API error: ${response.status}`);
            }

            const data = (await response.json()) as JiraSearchResult;

            const issues = data.issues.map((issue) => ({
                key: issue.key,
                summary: issue.fields.summary,
                status: issue.fields.status.name,
                assignee: issue.fields.assignee?.displayName || 'Unassigned',
            }));

            return {
                data: {
                    total: data.total,
                    issues,
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
 * Add comment tool
 */
const JiraAddCommentParameters = z.object({
    issue_key: z.string().describe('The issue key'),
    comment: z.string().describe('The comment text'),
});

export class JiraAddCommentTool extends BaseJiraTool<typeof JiraAddCommentParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof JiraAddCommentParameters>, 'parameters'>> & {
            serverUrl?: string;
            token?: string;
            email?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'jira_add_comment',
                description: config?.description ?? 'Add a comment to a Jira issue',
                ...config,
            },
            JiraAddCommentParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof JiraAddCommentParameters>,
        _context: ToolContext
    ): Promise<JiraResult> {
        try {
            const response = await this.jiraRequest(`/issue/${encodeURIComponent(params.issue_key)}/comment`, {
                method: 'POST',
                body: JSON.stringify({ body: params.comment }),
            });

            if (!response.ok) {
                throw new Error(`Jira API error: ${response.status}`);
            }

            const data = (await response.json()) as { id: string };

            return {
                data: {
                    commentId: data.id,
                    issueKey: params.issue_key,
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
 * Jira toolkit
 */
export class JiraToolkit {
    static create(options?: {
        serverUrl?: string;
        token?: string;
        email?: string;
        enableGetIssue?: boolean;
        enableCreateIssue?: boolean;
        enableSearchIssues?: boolean;
        enableAddComment?: boolean;
    }): Array<JiraGetIssueTool | JiraCreateIssueTool | JiraSearchIssuesTool | JiraAddCommentTool> {
        const tools: Array<JiraGetIssueTool | JiraCreateIssueTool | JiraSearchIssuesTool | JiraAddCommentTool> = [];

        const config = {
            ...(options?.serverUrl !== undefined && { serverUrl: options.serverUrl }),
            ...(options?.token !== undefined && { token: options.token }),
            ...(options?.email !== undefined && { email: options.email }),
        };

        if (options?.enableGetIssue !== false) {
            tools.push(new JiraGetIssueTool(config));
        }
        if (options?.enableCreateIssue !== false) {
            tools.push(new JiraCreateIssueTool(config));
        }
        if (options?.enableSearchIssues !== false) {
            tools.push(new JiraSearchIssuesTool(config));
        }
        if (options?.enableAddComment !== false) {
            tools.push(new JiraAddCommentTool(config));
        }

        return tools;
    }
}
