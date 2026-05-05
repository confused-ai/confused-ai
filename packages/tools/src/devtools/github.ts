/**
 * GitHub tool implementation - TypeScript  GithubTools
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';

/**
 * GitHub API types
 */
interface GitHubRepository {
    full_name: string;
    description: string | null;
    html_url: string;
    stargazers_count: number;
    forks_count: number;
    language: string | null;
    open_issues_count: number;
    default_branch: string;
    private: boolean;
}

interface GitHubIssue {
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: { login: string };
    body: string | null;
    labels: Array<{ name: string }>;
}

interface GitHubPullRequest {
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: { login: string };
    body: string | null;
    head: { ref: string };
    base: { ref: string };
}

interface GitHubSearchResult {
    items: Array<{
        full_name: string;
        description: string | null;
        html_url: string;
        stargazers_count: number;
        forks_count: number;
        language: string | null;
    }>;
    total_count: number;
}

interface GitHubResult {
    data?: unknown;
    error?: string;
}

// Base GitHub API URL
const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Helper function to make authenticated GitHub API requests
 */
async function githubRequest(
    endpoint: string,
    token?: string,
    options: RequestInit = {}
): Promise<Response> {
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'AgentFramework/1.0',
        ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(`${GITHUB_API_BASE}${endpoint}`, {
        ...options,
        headers,
    });
}

/**
 * Search repositories tool
 */
const GitHubSearchRepositoriesParameters = z.object({
    query: z.string().describe('Search query for repositories'),
    sort: z.enum(['stars', 'forks', 'updated']).optional().default('stars'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
    per_page: z.number().min(1).max(100).optional().default(30),
});

export class GitHubSearchRepositoriesTool extends BaseTool<typeof GitHubSearchRepositoriesParameters, GitHubResult> {
    private token?: string;

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof GitHubSearchRepositoriesParameters>, 'parameters'>> & {
            token?: string;
        }
    ) {
        super({
            name: config?.name ?? 'github_search_repositories',
            description: config?.description ?? 'Search for repositories on GitHub',
            parameters: GitHubSearchRepositoriesParameters,
            category: config?.category ?? ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });
        const _gt = config?.token || process.env['GITHUB_ACCESS_TOKEN'];
        if (_gt !== undefined) this.token = _gt;
    }

    protected async performExecute(
        params: z.infer<typeof GitHubSearchRepositoriesParameters>,
        _context: ToolContext
    ): Promise<GitHubResult> {
        try {
            const response = await githubRequest(
                `/search/repositories?q=${encodeURIComponent(params.query)}&sort=${params.sort}&order=${params.order}&per_page=${params.per_page}`,
                this.token
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const data = (await response.json()) as GitHubSearchResult;
            return { data };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * Get repository tool
 */
const GitHubGetRepositoryParameters = z.object({
    owner: z.string().describe('Repository owner (username or organization)'),
    repo: z.string().describe('Repository name'),
});

export class GitHubGetRepositoryTool extends BaseTool<typeof GitHubGetRepositoryParameters, GitHubResult> {
    private token?: string;

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof GitHubGetRepositoryParameters>, 'parameters'>> & {
            token?: string;
        }
    ) {
        super({
            name: config?.name ?? 'github_get_repository',
            description: config?.description ?? 'Get details of a specific repository',
            parameters: GitHubGetRepositoryParameters,
            category: config?.category ?? ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });
        const _gt = config?.token || process.env['GITHUB_ACCESS_TOKEN'];
        if (_gt !== undefined) this.token = _gt;
    }

    protected async performExecute(
        params: z.infer<typeof GitHubGetRepositoryParameters>,
        _context: ToolContext
    ): Promise<GitHubResult> {
        try {
            const response = await githubRequest(
                `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}`,
                this.token
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const data = (await response.json()) as GitHubRepository;
            return { data };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * List issues tool
 */
const GitHubListIssuesParameters = z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    state: z.enum(['open', 'closed', 'all']).optional().default('open'),
    per_page: z.number().min(1).max(100).optional().default(30),
});

export class GitHubListIssuesTool extends BaseTool<typeof GitHubListIssuesParameters, GitHubResult> {
    private token?: string;

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof GitHubListIssuesParameters>, 'parameters'>> & {
            token?: string;
        }
    ) {
        super({
            name: config?.name ?? 'github_list_issues',
            description: config?.description ?? 'List issues in a repository',
            parameters: GitHubListIssuesParameters,
            category: config?.category ?? ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });
        const _gt = config?.token || process.env['GITHUB_ACCESS_TOKEN'];
        if (_gt !== undefined) this.token = _gt;
    }

    protected async performExecute(
        params: z.infer<typeof GitHubListIssuesParameters>,
        _context: ToolContext
    ): Promise<GitHubResult> {
        try {
            const response = await githubRequest(
                `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/issues?state=${params.state}&per_page=${params.per_page}`,
                this.token
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const data = (await response.json()) as GitHubIssue[];
            return { data };
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
const GitHubCreateIssueParameters = z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    title: z.string().describe('Issue title'),
    body: z.string().optional().describe('Issue body/description'),
    labels: z.array(z.string()).optional().describe('Labels to apply to the issue'),
});

export class GitHubCreateIssueTool extends BaseTool<typeof GitHubCreateIssueParameters, GitHubResult> {
    private token?: string;

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof GitHubCreateIssueParameters>, 'parameters'>> & {
            token?: string;
        }
    ) {
        super({
            name: config?.name ?? 'github_create_issue',
            description: config?.description ?? 'Create a new issue in a repository',
            parameters: GitHubCreateIssueParameters,
            category: config?.category ?? ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });
        const _gt = config?.token || process.env['GITHUB_ACCESS_TOKEN'];
        if (_gt !== undefined) this.token = _gt;

        if (!this.token) {
            throw new Error('GitHub access token is required for creating issues');
        }
    }

    protected async performExecute(
        params: z.infer<typeof GitHubCreateIssueParameters>,
        _context: ToolContext
    ): Promise<GitHubResult> {
        try {
            const response = await githubRequest(
                `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/issues`,
                this.token,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        title: params.title,
                        body: params.body,
                        labels: params.labels,
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const data = (await response.json()) as GitHubIssue;
            return { data };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * List pull requests tool
 */
const GitHubListPullRequestsParameters = z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    state: z.enum(['open', 'closed', 'all']).optional().default('open'),
    per_page: z.number().min(1).max(100).optional().default(30),
});

export class GitHubListPullRequestsTool extends BaseTool<typeof GitHubListPullRequestsParameters, GitHubResult> {
    private token?: string;

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof GitHubListPullRequestsParameters>, 'parameters'>> & {
            token?: string;
        }
    ) {
        super({
            name: config?.name ?? 'github_list_pull_requests',
            description: config?.description ?? 'List pull requests in a repository',
            parameters: GitHubListPullRequestsParameters,
            category: config?.category ?? ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });
        const _gt = config?.token || process.env['GITHUB_ACCESS_TOKEN'];
        if (_gt !== undefined) this.token = _gt;
    }

    protected async performExecute(
        params: z.infer<typeof GitHubListPullRequestsParameters>,
        _context: ToolContext
    ): Promise<GitHubResult> {
        try {
            const response = await githubRequest(
                `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/pulls?state=${params.state}&per_page=${params.per_page}`,
                this.token
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const data = (await response.json()) as GitHubPullRequest[];
            return { data };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * GitHub toolkit
 */
export class GitHubToolkit {
    static create(options?: {
        token?: string;
        enableSearch?: boolean;
        enableGetRepo?: boolean;
        enableListIssues?: boolean;
        enableCreateIssue?: boolean;
        enableListPRs?: boolean;
    }): Array<
        | GitHubSearchRepositoriesTool
        | GitHubGetRepositoryTool
        | GitHubListIssuesTool
        | GitHubCreateIssueTool
        | GitHubListPullRequestsTool
    > {
        const tools: Array<
            | GitHubSearchRepositoriesTool
            | GitHubGetRepositoryTool
            | GitHubListIssuesTool
            | GitHubCreateIssueTool
            | GitHubListPullRequestsTool
        > = [];

        if (options?.enableSearch !== false) {
            tools.push(new GitHubSearchRepositoriesTool({ ...(options?.token !== undefined && { token: options.token }) }));
        }
        if (options?.enableGetRepo !== false) {
            tools.push(new GitHubGetRepositoryTool({ ...(options?.token !== undefined && { token: options.token }) }));
        }
        if (options?.enableListIssues !== false) {
            tools.push(new GitHubListIssuesTool({ ...(options?.token !== undefined && { token: options.token }) }));
        }
        if (options?.enableCreateIssue !== false) {
            tools.push(new GitHubCreateIssueTool({ ...(options?.token !== undefined && { token: options.token }) }));
        }
        if (options?.enableListPRs !== false) {
            tools.push(new GitHubListPullRequestsTool({ ...(options?.token !== undefined && { token: options.token }) }));
        }

        return tools;
    }
}
