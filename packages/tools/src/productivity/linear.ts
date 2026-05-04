/**
 * Linear tools — issues, projects, teams, comments via GraphQL API.
 * API key: https://linear.app/settings/api
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface LinearToolConfig {
    apiKey?: string;
}

const LINEAR_API = 'https://api.linear.app/graphql';

async function linearQuery(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(LINEAR_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: apiKey },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Linear API error ${res.status}: ${await res.text()}`);
    const json = await res.json() as { data?: unknown; errors?: Array<{ message: string }> };
    if (json.errors?.length) throw new Error(`Linear GraphQL: ${json.errors.map((e) => e.message).join(', ')}`);
    return json.data;
}

function getKey(config: LinearToolConfig): string {
    const key = config.apiKey ?? process.env.LINEAR_API_KEY;
    if (!key) throw new Error('LinearTools require LINEAR_API_KEY');
    return key;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const CreateIssueSchema = z.object({
    teamId: z.string().describe('Linear team ID'),
    title: z.string().describe('Issue title'),
    description: z.string().optional().describe('Issue description (markdown)'),
    priority: z.number().int().min(0).max(4).optional().describe('Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low'),
    assigneeId: z.string().optional().describe('Assignee user ID'),
});

const GetIssueSchema = z.object({
    issueId: z.string().describe('Linear issue ID or identifier (e.g. ENG-123)'),
});

const SearchIssuesSchema = z.object({
    query: z.string().describe('Search query'),
    teamId: z.string().optional().describe('Filter by team ID'),
    limit: z.number().int().min(1).max(50).optional().default(10).describe('Max results'),
});

const UpdateIssueSchema = z.object({
    issueId: z.string().describe('Issue ID to update'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    priority: z.number().int().min(0).max(4).optional().describe('New priority'),
    stateId: z.string().optional().describe('New state ID'),
});

const AddCommentSchema = z.object({
    issueId: z.string().describe('Issue ID'),
    body: z.string().describe('Comment body (markdown)'),
});

const ListTeamsSchema = z.object({});

// ── Tools ──────────────────────────────────────────────────────────────────

export class LinearCreateIssueTool extends BaseTool<typeof CreateIssueSchema, { id: string; identifier: string; title: string; url: string }> {
    constructor(private config: LinearToolConfig) {
        super({ id: 'linear_create_issue', name: 'Linear Create Issue', description: 'Create a new issue in Linear.', category: ToolCategory.API, parameters: CreateIssueSchema });
    }
    protected async performExecute(input: z.infer<typeof CreateIssueSchema>, _ctx: ToolContext) {
        const data = await linearQuery(getKey(this.config), `
            mutation CreateIssue($input: IssueCreateInput!) {
                issueCreate(input: $input) { issue { id identifier title url } }
            }
        `, { input }) as { issueCreate: { issue: { id: string; identifier: string; title: string; url: string } } };
        return data.issueCreate.issue;
    }
}

export class LinearGetIssueTool extends BaseTool<typeof GetIssueSchema, { id: string; identifier: string; title: string; description?: string; state: string; priority: number; url: string }> {
    constructor(private config: LinearToolConfig) {
        super({ id: 'linear_get_issue', name: 'Linear Get Issue', description: 'Retrieve a Linear issue by ID.', category: ToolCategory.API, parameters: GetIssueSchema });
    }
    protected async performExecute(input: z.infer<typeof GetIssueSchema>, _ctx: ToolContext) {
        const data = await linearQuery(getKey(this.config), `
            query GetIssue($id: String!) {
                issue(id: $id) { id identifier title description state { name } priority url }
            }
        `, { id: input.issueId }) as { issue: { id: string; identifier: string; title: string; description?: string; state: { name: string }; priority: number; url: string } };
        return { ...data.issue, state: data.issue.state.name };
    }
}

export class LinearSearchIssuesTool extends BaseTool<typeof SearchIssuesSchema, { issues: Array<{ id: string; identifier: string; title: string; state: string; priority: number }> }> {
    constructor(private config: LinearToolConfig) {
        super({ id: 'linear_search_issues', name: 'Linear Search Issues', description: 'Search Linear issues by keyword.', category: ToolCategory.API, parameters: SearchIssuesSchema });
    }
    protected async performExecute(input: z.infer<typeof SearchIssuesSchema>, _ctx: ToolContext) {
        const filter: Record<string, unknown> = {};
        if (input.teamId) filter['team'] = { id: { eq: input.teamId } };
        const data = await linearQuery(getKey(this.config), `
            query SearchIssues($filter: IssueFilter, $first: Int) {
                issues(filter: $filter, first: $first) {
                    nodes { id identifier title state { name } priority }
                }
            }
        `, { filter, first: input.limit ?? 10 }) as { issues: { nodes: Array<{ id: string; identifier: string; title: string; state: { name: string }; priority: number }> } };
        return { issues: data.issues.nodes.map((i) => ({ ...i, state: i.state.name })) };
    }
}

export class LinearUpdateIssueTool extends BaseTool<typeof UpdateIssueSchema, { success: boolean; id: string }> {
    constructor(private config: LinearToolConfig) {
        super({ id: 'linear_update_issue', name: 'Linear Update Issue', description: 'Update fields on an existing Linear issue.', category: ToolCategory.API, parameters: UpdateIssueSchema });
    }
    protected async performExecute(input: z.infer<typeof UpdateIssueSchema>, _ctx: ToolContext) {
        const { issueId, ...updateFields } = input;
        const data = await linearQuery(getKey(this.config), `
            mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
                issueUpdate(id: $id, input: $input) { success issue { id } }
            }
        `, { id: issueId, input: updateFields }) as { issueUpdate: { success: boolean; issue: { id: string } } };
        return { success: data.issueUpdate.success, id: data.issueUpdate.issue.id };
    }
}

export class LinearAddCommentTool extends BaseTool<typeof AddCommentSchema, { id: string; success: boolean }> {
    constructor(private config: LinearToolConfig) {
        super({ id: 'linear_add_comment', name: 'Linear Add Comment', description: 'Add a comment to a Linear issue.', category: ToolCategory.API, parameters: AddCommentSchema });
    }
    protected async performExecute(input: z.infer<typeof AddCommentSchema>, _ctx: ToolContext) {
        const data = await linearQuery(getKey(this.config), `
            mutation CreateComment($input: CommentCreateInput!) {
                commentCreate(input: $input) { success comment { id } }
            }
        `, { input }) as { commentCreate: { success: boolean; comment: { id: string } } };
        return { id: data.commentCreate.comment.id, success: data.commentCreate.success };
    }
}

export class LinearListTeamsTool extends BaseTool<typeof ListTeamsSchema, { teams: Array<{ id: string; name: string; key: string }> }> {
    constructor(private config: LinearToolConfig) {
        super({ id: 'linear_list_teams', name: 'Linear List Teams', description: 'List all teams in the Linear workspace.', category: ToolCategory.API, parameters: ListTeamsSchema });
    }
    protected async performExecute(_input: z.infer<typeof ListTeamsSchema>, _ctx: ToolContext) {
        const data = await linearQuery(getKey(this.config), `
            query { teams { nodes { id name key } } }
        `) as { teams: { nodes: Array<{ id: string; name: string; key: string }> } };
        return { teams: data.teams.nodes };
    }
}

// ── Toolkit ────────────────────────────────────────────────────────────────

export class LinearToolkit {
    readonly tools: BaseTool[];
    constructor(config: LinearToolConfig = {}) {
        this.tools = [
            new LinearCreateIssueTool(config),
            new LinearGetIssueTool(config),
            new LinearSearchIssuesTool(config),
            new LinearUpdateIssueTool(config),
            new LinearAddCommentTool(config),
            new LinearListTeamsTool(config),
        ];
    }
}
