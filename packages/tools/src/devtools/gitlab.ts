/**
 * GitLab tools — manage repositories, issues, and merge requests via GitLab API.
 * API docs: https://docs.gitlab.com/ee/api/
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface GitLabToolConfig {
    /** GitLab personal access token (or GITLAB_TOKEN env var) */
    token?: string;
    /** GitLab instance URL (defaults to https://gitlab.com) */
    host?: string;
}

function getAuth(config: GitLabToolConfig): { headers: Record<string, string>; baseUrl: string } {
    const token = config.token ?? process.env['GITLAB_TOKEN'];
    if (!token) throw new Error('GitLabTools require GITLAB_TOKEN');
    const host = (config.host ?? process.env['GITLAB_HOST'] ?? 'https://gitlab.com').replace(/\/$/, '');
    return {
        headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
        baseUrl: `${host}/api/v4`,
    };
}

async function glRequest(auth: ReturnType<typeof getAuth>, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`${auth.baseUrl}${path}`, {
        method,
        headers: auth.headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`GitLab API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return { success: true };
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchProjectsSchema = z.object({
    query: z.string().describe('Search string for project names'),
    perPage: z.number().int().optional().default(20).describe('Results per page'),
});

const GetProjectSchema = z.object({
    projectId: z.union([z.string(), z.number()]).describe('Project ID or URL-encoded path (e.g. "group/project")'),
});

const ListIssuesSchema = z.object({
    projectId: z.union([z.string(), z.number()]).describe('Project ID or URL-encoded path'),
    state: z.enum(['opened', 'closed', 'all']).optional().default('opened').describe('Issue state filter'),
    labels: z.string().optional().describe('Comma-separated list of label names'),
    assigneeId: z.number().int().optional().describe('Filter by assignee user ID'),
});

const CreateIssueSchema = z.object({
    projectId: z.union([z.string(), z.number()]).describe('Project ID or URL-encoded path'),
    title: z.string().describe('Issue title'),
    description: z.string().optional().describe('Issue description (supports Markdown)'),
    labels: z.array(z.string()).optional().describe('Labels to apply'),
    assigneeIds: z.array(z.number().int()).optional().describe('User IDs to assign the issue to'),
    milestoneId: z.number().int().optional().describe('Milestone ID'),
    dueDate: z.string().optional().describe('Due date in YYYY-MM-DD format'),
});

const ListMRsSchema = z.object({
    projectId: z.union([z.string(), z.number()]).describe('Project ID or URL-encoded path'),
    state: z.enum(['opened', 'closed', 'merged', 'all']).optional().default('opened')
        .describe('Merge request state'),
});

const CreateMRSchema = z.object({
    projectId: z.union([z.string(), z.number()]).describe('Project ID or URL-encoded path'),
    title: z.string().describe('Merge request title'),
    sourceBranch: z.string().describe('Source branch name'),
    targetBranch: z.string().optional().default('main').describe('Target branch name'),
    description: z.string().optional().describe('Merge request description'),
    removeSourceBranch: z.boolean().optional().default(false)
        .describe('Delete source branch after merge'),
    squash: z.boolean().optional().default(false).describe('Squash commits on merge'),
    draft: z.boolean().optional().default(false).describe('Mark as draft/WIP'),
    assigneeIds: z.array(z.number().int()).optional().describe('Assignee user IDs'),
    reviewerIds: z.array(z.number().int()).optional().describe('Reviewer user IDs'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class GitLabSearchProjectsTool extends BaseTool<typeof SearchProjectsSchema> {
    constructor(private config: GitLabToolConfig = {}) {
        super({
            id: 'gitlab_search_projects',
            name: 'GitLab Search Projects',
            description: 'Search for GitLab projects by name.',
            category: ToolCategory.UTILITY,
            parameters: SearchProjectsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchProjectsSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ search: input.query, per_page: String(input.perPage ?? 20) });
        return glRequest(auth, 'GET', `/projects?${params}`);
    }
}

export class GitLabGetProjectTool extends BaseTool<typeof GetProjectSchema> {
    constructor(private config: GitLabToolConfig = {}) {
        super({
            id: 'gitlab_get_project',
            name: 'GitLab Get Project',
            description: 'Get details of a specific GitLab project.',
            category: ToolCategory.UTILITY,
            parameters: GetProjectSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetProjectSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const encodedId = encodeURIComponent(String(input.projectId));
        return glRequest(auth, 'GET', `/projects/${encodedId}`);
    }
}

export class GitLabListIssuesTool extends BaseTool<typeof ListIssuesSchema> {
    constructor(private config: GitLabToolConfig = {}) {
        super({
            id: 'gitlab_list_issues',
            name: 'GitLab List Issues',
            description: 'List issues in a GitLab project.',
            category: ToolCategory.UTILITY,
            parameters: ListIssuesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListIssuesSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const encodedId = encodeURIComponent(String(input.projectId));
        const params = new URLSearchParams({ state: input.state ?? 'opened' });
        if (input.labels) params.set('labels', input.labels);
        if (input.assigneeId) params.set('assignee_id', String(input.assigneeId));
        return glRequest(auth, 'GET', `/projects/${encodedId}/issues?${params}`);
    }
}

export class GitLabCreateIssueTool extends BaseTool<typeof CreateIssueSchema> {
    constructor(private config: GitLabToolConfig = {}) {
        super({
            id: 'gitlab_create_issue',
            name: 'GitLab Create Issue',
            description: 'Create a new issue in a GitLab project.',
            category: ToolCategory.UTILITY,
            parameters: CreateIssueSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateIssueSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const encodedId = encodeURIComponent(String(input.projectId));
        const body: Record<string, unknown> = { title: input.title };
        if (input.description) body['description'] = input.description;
        if (input.labels?.length) body['labels'] = input.labels.join(',');
        if (input.assigneeIds?.length) body['assignee_ids'] = input.assigneeIds;
        if (input.milestoneId) body['milestone_id'] = input.milestoneId;
        if (input.dueDate) body['due_date'] = input.dueDate;
        return glRequest(auth, 'POST', `/projects/${encodedId}/issues`, body);
    }
}

export class GitLabListMRsTool extends BaseTool<typeof ListMRsSchema> {
    constructor(private config: GitLabToolConfig = {}) {
        super({
            id: 'gitlab_list_mrs',
            name: 'GitLab List Merge Requests',
            description: 'List merge requests in a GitLab project.',
            category: ToolCategory.UTILITY,
            parameters: ListMRsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListMRsSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const encodedId = encodeURIComponent(String(input.projectId));
        const params = new URLSearchParams({ state: input.state ?? 'opened' });
        return glRequest(auth, 'GET', `/projects/${encodedId}/merge_requests?${params}`);
    }
}

export class GitLabCreateMRTool extends BaseTool<typeof CreateMRSchema> {
    constructor(private config: GitLabToolConfig = {}) {
        super({
            id: 'gitlab_create_mr',
            name: 'GitLab Create Merge Request',
            description: 'Create a new merge request in a GitLab project.',
            category: ToolCategory.UTILITY,
            parameters: CreateMRSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateMRSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const encodedId = encodeURIComponent(String(input.projectId));
        const body: Record<string, unknown> = {
            title: input.draft ? `Draft: ${input.title}` : input.title,
            source_branch: input.sourceBranch,
            target_branch: input.targetBranch ?? 'main',
            remove_source_branch: input.removeSourceBranch ?? false,
            squash: input.squash ?? false,
        };
        if (input.description) body['description'] = input.description;
        if (input.assigneeIds?.length) body['assignee_ids'] = input.assigneeIds;
        if (input.reviewerIds?.length) body['reviewer_ids'] = input.reviewerIds;
        return glRequest(auth, 'POST', `/projects/${encodedId}/merge_requests`, body);
    }
}

export class GitLabToolkit {
    readonly searchProjects: GitLabSearchProjectsTool;
    readonly getProject: GitLabGetProjectTool;
    readonly listIssues: GitLabListIssuesTool;
    readonly createIssue: GitLabCreateIssueTool;
    readonly listMRs: GitLabListMRsTool;
    readonly createMR: GitLabCreateMRTool;

    constructor(config: GitLabToolConfig = {}) {
        this.searchProjects = new GitLabSearchProjectsTool(config);
        this.getProject = new GitLabGetProjectTool(config);
        this.listIssues = new GitLabListIssuesTool(config);
        this.createIssue = new GitLabCreateIssueTool(config);
        this.listMRs = new GitLabListMRsTool(config);
        this.createMR = new GitLabCreateMRTool(config);
    }

    getTools() {
        return [this.searchProjects, this.getProject, this.listIssues, this.createIssue, this.listMRs, this.createMR];
    }
}
