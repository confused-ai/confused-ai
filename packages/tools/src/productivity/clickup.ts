/**
 * ClickUp tools — manage tasks, lists, and spaces via the ClickUp REST API v2.
 * API key: https://app.clickup.com/settings/apps
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface ClickUpToolConfig {
    /** ClickUp personal API token (or CLICKUP_API_TOKEN env var) */
    apiToken?: string;
}

function getToken(config: ClickUpToolConfig): string {
    const token = config.apiToken ?? process.env['CLICKUP_API_TOKEN'];
    if (!token) throw new Error('ClickUpTools require CLICKUP_API_TOKEN');
    return token;
}

async function clickupFetch(token: string, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`https://api.clickup.com/api/v2${path}`, {
        method,
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`ClickUp API ${res.status}: ${await res.text()}`);
    return res.json();
}

interface ClickUpTask {
    id: string;
    name: string;
    description?: string;
    status: string;
    priority?: string;
    dueDate?: string;
    url: string;
    assignees: string[];
    tags: string[];
    listId: string;
}

function mapTask(t: Record<string, unknown>): ClickUpTask {
    const status = t['status'] as Record<string, unknown> | undefined;
    const priority = t['priority'] as Record<string, unknown> | undefined;
    return {
        id: t['id'] as string,
        name: t['name'] as string,
        ...(t['description'] !== undefined && { description: t['description'] as string }),
        status: status?.['status'] as string ?? 'open',
        ...(priority?.['priority'] !== undefined && { priority: priority['priority'] as string }),
        ...(t['due_date'] !== undefined && { dueDate: t['due_date'] as string }),
        url: t['url'] as string,
        assignees: ((t['assignees'] as Array<{ username: string }>) ?? []).map((a) => a.username),
        tags: ((t['tags'] as Array<{ name: string }>) ?? []).map((g) => g.name),
        listId: (t['list'] as Record<string, string>)?.['id'] ?? '',
    };
}

// ── Schemas ────────────────────────────────────────────────────────────────

const GetWorkspacesSchema = z.object({});

const GetSpacesSchema = z.object({
    workspaceId: z.string().describe('ClickUp workspace (team) ID'),
});

const GetListsSchema = z.object({
    spaceId: z.string().optional().describe('Space ID — fetch lists in this space'),
    folderId: z.string().optional().describe('Folder ID — fetch lists in this folder'),
});

const GetTasksSchema = z.object({
    listId: z.string().describe('ClickUp list ID'),
    page: z.number().int().min(0).optional().default(0),
    orderBy: z.enum(['id', 'created', 'updated', 'due_date']).optional().default('created'),
    statuses: z.array(z.string()).optional().describe('Filter by status names'),
    assignees: z.array(z.string()).optional().describe('Filter by assignee user IDs'),
    dueDateGte: z.number().optional().describe('Unix timestamp ms — tasks due after this'),
    dueDateLte: z.number().optional().describe('Unix timestamp ms — tasks due before this'),
    includeSubtasks: z.boolean().optional().default(false),
});

const CreateTaskSchema = z.object({
    listId: z.string().describe('ClickUp list ID to add the task to'),
    name: z.string().describe('Task name'),
    description: z.string().optional(),
    status: z.string().optional().describe('Status name (must exist in the list)'),
    priority: z.number().int().min(1).max(4).optional().describe('1=urgent, 2=high, 3=normal, 4=low'),
    dueDate: z.number().optional().describe('Due date as Unix timestamp in milliseconds'),
    assignees: z.array(z.number()).optional().describe('Assignee user IDs'),
    tags: z.array(z.string()).optional(),
    notifyAll: z.boolean().optional().default(false),
});

const UpdateTaskSchema = z.object({
    taskId: z.string().describe('ClickUp task ID'),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.number().int().min(1).max(4).optional(),
    dueDate: z.number().optional(),
});

const DeleteTaskSchema = z.object({
    taskId: z.string().describe('ClickUp task ID to delete'),
});

const SearchTasksSchema = z.object({
    workspaceId: z.string().describe('ClickUp workspace ID'),
    query: z.string().describe('Search query'),
    page: z.number().int().min(0).optional().default(0),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ClickUpGetWorkspacesTool extends BaseTool<typeof GetWorkspacesSchema, {
    workspaces: Array<{ id: string; name: string; color?: string }>;
}> {
    constructor(private config: ClickUpToolConfig = {}) {
        super({
            id: 'clickup_get_workspaces',
            name: 'ClickUp Get Workspaces',
            description: 'List all ClickUp workspaces (teams) accessible to the authenticated user.',
            category: ToolCategory.API,
            parameters: GetWorkspacesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(_input: z.infer<typeof GetWorkspacesSchema>, _ctx: ToolContext) {
        const data = await clickupFetch(getToken(this.config), 'GET', '/team') as {
            teams: Array<{ id: string; name: string; color?: string }>;
        };
        return { workspaces: data.teams ?? [] };
    }
}

export class ClickUpGetSpacesTool extends BaseTool<typeof GetSpacesSchema, {
    spaces: Array<{ id: string; name: string; private: boolean }>;
}> {
    constructor(private config: ClickUpToolConfig = {}) {
        super({
            id: 'clickup_get_spaces',
            name: 'ClickUp Get Spaces',
            description: 'List spaces within a ClickUp workspace.',
            category: ToolCategory.API,
            parameters: GetSpacesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetSpacesSchema>, _ctx: ToolContext) {
        const data = await clickupFetch(getToken(this.config), 'GET', `/team/${input.workspaceId}/space`) as {
            spaces: Array<{ id: string; name: string; private: boolean }>;
        };
        return { spaces: data.spaces ?? [] };
    }
}

export class ClickUpGetListsTool extends BaseTool<typeof GetListsSchema, {
    lists: Array<{ id: string; name: string; taskCount?: number; spaceId: string }>;
}> {
    constructor(private config: ClickUpToolConfig = {}) {
        super({
            id: 'clickup_get_lists',
            name: 'ClickUp Get Lists',
            description: 'List ClickUp lists within a space or folder.',
            category: ToolCategory.API,
            parameters: GetListsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetListsSchema>, _ctx: ToolContext) {
        if (!input.spaceId && !input.folderId) throw new Error('Either spaceId or folderId is required');
        const path = input.folderId ? `/folder/${input.folderId}/list` : `/space/${input.spaceId}/list`;
        const data = await clickupFetch(getToken(this.config), 'GET', path) as {
            lists: Array<{ id: string; name: string; task_count?: number; space: { id: string } }>;
        };
        return {
            lists: (data.lists ?? []).map((l) => {
                const item: { id: string; name: string; taskCount?: number; spaceId: string } = { id: l.id, name: l.name, spaceId: l.space?.id ?? '' };
                if (l.task_count !== undefined) item.taskCount = l.task_count;
                return item;
            }),
        };
    }
}

export class ClickUpGetTasksTool extends BaseTool<typeof GetTasksSchema, { tasks: ClickUpTask[]; count: number }> {
    constructor(private config: ClickUpToolConfig = {}) {
        super({
            id: 'clickup_get_tasks',
            name: 'ClickUp Get Tasks',
            description: 'List tasks in a ClickUp list with optional filters by status, assignee, or due date.',
            category: ToolCategory.API,
            parameters: GetTasksSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetTasksSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({
            page: String(input.page ?? 0),
            order_by: input.orderBy ?? 'created',
            subtasks: String(input.includeSubtasks ?? false),
        });
        if (input.statuses?.length) input.statuses.forEach((s) => params.append('statuses[]', s));
        if (input.assignees?.length) input.assignees.forEach((a) => params.append('assignees[]', a));
        if (input.dueDateGte) params.set('due_date_gt', String(input.dueDateGte));
        if (input.dueDateLte) params.set('due_date_lt', String(input.dueDateLte));

        const data = await clickupFetch(getToken(this.config), 'GET', `/list/${input.listId}/task?${params}`) as {
            tasks: Array<Record<string, unknown>>;
        };
        const tasks = (data.tasks ?? []).map(mapTask);
        return { tasks, count: tasks.length };
    }
}

export class ClickUpCreateTaskTool extends BaseTool<typeof CreateTaskSchema, ClickUpTask> {
    constructor(private config: ClickUpToolConfig = {}) {
        super({
            id: 'clickup_create_task',
            name: 'ClickUp Create Task',
            description: 'Create a new task in a ClickUp list.',
            category: ToolCategory.API,
            parameters: CreateTaskSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateTaskSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = { name: input.name, notify_all: input.notifyAll ?? false };
        if (input['description']) body['description'] = input['description'];
        if (input['status']) body['status'] = input['status'];
        if (input['priority']) body['priority'] = input['priority'];
        if (input.dueDate) body['due_date'] = input.dueDate;
        if (input['assignees']?.length) body['assignees'] = input['assignees'];
        if (input['tags']?.length) body['tags'] = input['tags'];

        const task = await clickupFetch(getToken(this.config), 'POST', `/list/${input.listId}/task`, body) as Record<string, unknown>;
        return mapTask(task);
    }
}

export class ClickUpUpdateTaskTool extends BaseTool<typeof UpdateTaskSchema, ClickUpTask> {
    constructor(private config: ClickUpToolConfig = {}) {
        super({
            id: 'clickup_update_task',
            name: 'ClickUp Update Task',
            description: 'Update a ClickUp task — name, status, priority, description, or due date.',
            category: ToolCategory.API,
            parameters: UpdateTaskSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof UpdateTaskSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {};
        if (input['name']) body['name'] = input['name'];
        if (input['description'] !== undefined) body['description'] = input['description'];
        if (input['status']) body['status'] = input['status'];
        if (input['priority']) body['priority'] = input['priority'];
        if (input.dueDate) body['due_date'] = input.dueDate;

        const task = await clickupFetch(getToken(this.config), 'PUT', `/task/${input.taskId}`, body) as Record<string, unknown>;
        return mapTask(task);
    }
}

export class ClickUpDeleteTaskTool extends BaseTool<typeof DeleteTaskSchema, { success: boolean }> {
    constructor(private config: ClickUpToolConfig = {}) {
        super({
            id: 'clickup_delete_task',
            name: 'ClickUp Delete Task',
            description: 'Permanently delete a ClickUp task.',
            category: ToolCategory.API,
            parameters: DeleteTaskSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof DeleteTaskSchema>, _ctx: ToolContext) {
        await clickupFetch(getToken(this.config), 'DELETE', `/task/${input.taskId}`);
        return { success: true };
    }
}

export class ClickUpSearchTasksTool extends BaseTool<typeof SearchTasksSchema, { tasks: ClickUpTask[]; count: number }> {
    constructor(private config: ClickUpToolConfig = {}) {
        super({
            id: 'clickup_search_tasks',
            name: 'ClickUp Search Tasks',
            description: 'Search tasks across a ClickUp workspace by keyword.',
            category: ToolCategory.API,
            parameters: SearchTasksSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchTasksSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ query: input.query, page: String(input.page ?? 0) });
        const data = await clickupFetch(getToken(this.config), 'GET', `/team/${input.workspaceId}/task?${params}`) as {
            tasks: Array<Record<string, unknown>>;
        };
        const tasks = (data.tasks ?? []).map(mapTask);
        return { tasks, count: tasks.length };
    }
}

export class ClickUpToolkit {
    readonly tools: BaseTool[];
    constructor(config: ClickUpToolConfig = {}) {
        this.tools = [
            new ClickUpGetWorkspacesTool(config),
            new ClickUpGetSpacesTool(config),
            new ClickUpGetListsTool(config),
            new ClickUpGetTasksTool(config),
            new ClickUpCreateTaskTool(config),
            new ClickUpUpdateTaskTool(config),
            new ClickUpDeleteTaskTool(config),
            new ClickUpSearchTasksTool(config),
        ];
    }
}
