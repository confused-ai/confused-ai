/**
 * Bitbucket tools — manage repositories, pull requests, and issues via Bitbucket API.
 * API docs: https://developer.atlassian.com/cloud/bitbucket/rest/intro/
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface BitbucketToolConfig {
    /** Bitbucket workspace (or BITBUCKET_WORKSPACE env var) */
    workspace?: string;
    /** Bitbucket username (or BITBUCKET_USERNAME env var) */
    username?: string;
    /** Bitbucket app password (or BITBUCKET_APP_PASSWORD env var) */
    appPassword?: string;
}

function getAuth(config: BitbucketToolConfig): { headers: Record<string, string>; workspace: string } {
    const workspace = config.workspace ?? process.env['BITBUCKET_WORKSPACE'];
    const username = config.username ?? process.env['BITBUCKET_USERNAME'];
    const appPassword = config.appPassword ?? process.env['BITBUCKET_APP_PASSWORD'];
    if (!workspace) throw new Error('BitbucketTools require BITBUCKET_WORKSPACE');
    if (!username || !appPassword) throw new Error('BitbucketTools require BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD');
    const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');
    return { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' }, workspace };
}

async function bbRequest(auth: ReturnType<typeof getAuth>, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`https://api.bitbucket.org/2.0${path}`, {
        method,
        headers: auth.headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`Bitbucket API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return { success: true };
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ListReposSchema = z.object({
    query: z.string().optional().describe('Search filter for repository names'),
    page: z.number().int().optional().default(1).describe('Page number'),
    pagelen: z.number().int().min(1).max(100).optional().default(25).describe('Results per page'),
});

const GetRepoSchema = z.object({
    repoSlug: z.string().describe('Repository slug'),
});

const ListPRsSchema = z.object({
    repoSlug: z.string().describe('Repository slug'),
    state: z.enum(['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED']).optional().default('OPEN')
        .describe('Pull request state filter'),
});

const CreatePRSchema = z.object({
    repoSlug: z.string().describe('Repository slug'),
    title: z.string().describe('Pull request title'),
    sourceBranch: z.string().describe('Source branch name'),
    destinationBranch: z.string().optional().default('main').describe('Destination branch'),
    description: z.string().optional().describe('Pull request description'),
    closeSourceBranch: z.boolean().optional().default(false)
        .describe('Delete source branch after merge'),
    reviewers: z.array(z.string()).optional().describe('List of reviewer account IDs'),
});

const GetPRSchema = z.object({
    repoSlug: z.string().describe('Repository slug'),
    prId: z.number().int().describe('Pull request ID'),
});

const ListIssuesSchema = z.object({
    repoSlug: z.string().describe('Repository slug'),
    status: z.string().optional().describe('Filter by status (new, open, resolved, closed)'),
    priority: z.string().optional().describe('Filter by priority (trivial, minor, major, critical, blocker)'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class BitbucketListReposTool extends BaseTool<typeof ListReposSchema> {
    constructor(private config: BitbucketToolConfig = {}) {
        super({
            id: 'bitbucket_list_repos',
            name: 'Bitbucket List Repos',
            description: 'List repositories in a Bitbucket workspace.',
            category: ToolCategory.UTILITY,
            parameters: ListReposSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListReposSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ page: String(input.page ?? 1), pagelen: String(input.pagelen ?? 25) });
        if (input.query) params.set('q', `name~"${input.query}"`);
        return bbRequest(auth, 'GET', `/repositories/${auth.workspace}?${params}`);
    }
}

export class BitbucketGetRepoTool extends BaseTool<typeof GetRepoSchema> {
    constructor(private config: BitbucketToolConfig = {}) {
        super({
            id: 'bitbucket_get_repo',
            name: 'Bitbucket Get Repo',
            description: 'Get details of a specific Bitbucket repository.',
            category: ToolCategory.UTILITY,
            parameters: GetRepoSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetRepoSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        return bbRequest(auth, 'GET', `/repositories/${auth.workspace}/${input.repoSlug}`);
    }
}

export class BitbucketListPRsTool extends BaseTool<typeof ListPRsSchema> {
    constructor(private config: BitbucketToolConfig = {}) {
        super({
            id: 'bitbucket_list_prs',
            name: 'Bitbucket List Pull Requests',
            description: 'List pull requests for a Bitbucket repository.',
            category: ToolCategory.UTILITY,
            parameters: ListPRsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListPRsSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ state: input.state ?? 'OPEN' });
        return bbRequest(auth, 'GET', `/repositories/${auth.workspace}/${input.repoSlug}/pullrequests?${params}`);
    }
}

export class BitbucketCreatePRTool extends BaseTool<typeof CreatePRSchema> {
    constructor(private config: BitbucketToolConfig = {}) {
        super({
            id: 'bitbucket_create_pr',
            name: 'Bitbucket Create Pull Request',
            description: 'Create a new pull request in a Bitbucket repository.',
            category: ToolCategory.UTILITY,
            parameters: CreatePRSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreatePRSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const body: Record<string, unknown> = {
            title: input.title,
            source: { branch: { name: input.sourceBranch } },
            destination: { branch: { name: input.destinationBranch ?? 'main' } },
            close_source_branch: input.closeSourceBranch ?? false,
        };
        if (input.description) body['description'] = input.description;
        if (input.reviewers?.length) {
            body['reviewers'] = input.reviewers.map(id => ({ account_id: id }));
        }
        return bbRequest(auth, 'POST', `/repositories/${auth.workspace}/${input.repoSlug}/pullrequests`, body);
    }
}

export class BitbucketGetPRTool extends BaseTool<typeof GetPRSchema> {
    constructor(private config: BitbucketToolConfig = {}) {
        super({
            id: 'bitbucket_get_pr',
            name: 'Bitbucket Get Pull Request',
            description: 'Get details of a specific pull request.',
            category: ToolCategory.UTILITY,
            parameters: GetPRSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetPRSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        return bbRequest(auth, 'GET', `/repositories/${auth.workspace}/${input.repoSlug}/pullrequests/${input.prId}`);
    }
}

export class BitbucketListIssuesTool extends BaseTool<typeof ListIssuesSchema> {
    constructor(private config: BitbucketToolConfig = {}) {
        super({
            id: 'bitbucket_list_issues',
            name: 'Bitbucket List Issues',
            description: 'List issues in a Bitbucket repository.',
            category: ToolCategory.UTILITY,
            parameters: ListIssuesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListIssuesSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const queryParts: string[] = [];
        if (input.status) queryParts.push(`status="${input.status}"`);
        if (input.priority) queryParts.push(`priority="${input.priority}"`);
        const params = queryParts.length ? new URLSearchParams({ q: queryParts.join(' AND ') }) : new URLSearchParams();
        return bbRequest(auth, 'GET', `/repositories/${auth.workspace}/${input.repoSlug}/issues?${params}`);
    }
}

export class BitbucketToolkit {
    readonly listRepos: BitbucketListReposTool;
    readonly getRepo: BitbucketGetRepoTool;
    readonly listPRs: BitbucketListPRsTool;
    readonly createPR: BitbucketCreatePRTool;
    readonly getPR: BitbucketGetPRTool;
    readonly listIssues: BitbucketListIssuesTool;

    constructor(config: BitbucketToolConfig = {}) {
        this.listRepos = new BitbucketListReposTool(config);
        this.getRepo = new BitbucketGetRepoTool(config);
        this.listPRs = new BitbucketListPRsTool(config);
        this.createPR = new BitbucketCreatePRTool(config);
        this.getPR = new BitbucketGetPRTool(config);
        this.listIssues = new BitbucketListIssuesTool(config);
    }

    getTools() {
        return [this.listRepos, this.getRepo, this.listPRs, this.createPR, this.getPR, this.listIssues];
    }
}
