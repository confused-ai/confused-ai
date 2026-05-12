/**
 * Todoist tools — create, list, and complete tasks via the Todoist REST API v2.
 * API key: https://app.todoist.com/app/settings/integrations/developer
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface TodoistToolConfig {
    /** Todoist API token (or TODOIST_API_TOKEN env var) */
    apiToken?: string;
}

const TODOIST_API = 'https://api.todoist.com/rest/v2';

function getToken(config: TodoistToolConfig): string {
    const token = config.apiToken ?? process.env['TODOIST_API_TOKEN'];
    if (!token) throw new Error('TodoistTools require TODOIST_API_TOKEN');
    return token;
}

async function todoistFetch(token: string, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`${TODOIST_API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`Todoist API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return null;
    return res.json();
}

interface TodoistTask {
    id: string;
    content: string;
    description?: string;
    projectId?: string;
    due?: { date: string; string: string };
    priority: number;
    isCompleted: boolean;
    labels: string[];
    url: string;
}

function mapTask(t: Record<string, unknown>): TodoistTask {
    return {
        id: t['id'] as string,
        content: t['content'] as string,
        ...(t['description'] !== undefined && { description: t['description'] as string }),
        ...(t['project_id'] !== undefined && { projectId: t['project_id'] as string }),
        ...(t['due'] !== undefined && { due: t['due'] as { date: string; string: string } }),
        priority: t['priority'] as number,
        isCompleted: t['is_completed'] as boolean,
        labels: t['labels'] as string[],
        url: t['url'] as string,
    };
}

// ── Schemas ────────────────────────────────────────────────────────────────

const CreateTaskSchema = z.object({
    content: z.string().describe('Task title/content'),
    description: z.string().optional().describe('Optional task description'),
    dueString: z.string().optional().describe('Natural language due date (e.g. "tomorrow", "next Monday", "Jan 15")'),
    priority: z.number().int().min(1).max(4).optional().default(1).describe('Priority: 1=normal, 2=medium, 3=high, 4=urgent'),
    projectId: z.string().optional().describe('Project ID to add the task to'),
    labels: z.array(z.string()).optional().describe('Label names to assign'),
});

const GetTasksSchema = z.object({
    projectId: z.string().optional().describe('Filter by project ID'),
    filter: z.string().optional().describe('Todoist filter query (e.g. "today", "p1", "overdue")'),
    limit: z.number().int().min(1).max(200).optional().default(20),
});

const CompleteTaskSchema = z.object({
    taskId: z.string().describe('Task ID to mark as completed'),
});

const UpdateTaskSchema = z.object({
    taskId: z.string().describe('Task ID to update'),
    content: z.string().optional().describe('New task title'),
    description: z.string().optional().describe('New description'),
    dueString: z.string().optional().describe('New due date'),
    priority: z.number().int().min(1).max(4).optional(),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class TodoistUpdateTaskTool extends BaseTool<typeof UpdateTaskSchema, TodoistTask> {
    constructor(private config: TodoistToolConfig = {}) {
        super({
            id: 'todoist_update_task',
            name: 'Todoist Update Task',
            description: 'Update an existing Todoist task — title, description, due date, or priority.',
            category: ToolCategory.API,
            parameters: UpdateTaskSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof UpdateTaskSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {};
        if (input['content']) body['content'] = input['content'];
        if (input['description']) body['description'] = input['description'];
        if (input.dueString) body['due_string'] = input.dueString;
        if (input['priority']) body['priority'] = input['priority'];
        const task = await todoistFetch(getToken(this.config), 'POST', `/tasks/${input.taskId}`, body) as Record<string, unknown>;
        return mapTask(task);
    }
}

export class TodoistCreateTaskTool extends BaseTool<typeof CreateTaskSchema, TodoistTask> {
    constructor(private config: TodoistToolConfig = {}) {
        super({
            id: 'todoist_create_task',
            name: 'Todoist Create Task',
            description: 'Create a new task in Todoist with optional due date, priority, and project.',
            category: ToolCategory.API,
            parameters: CreateTaskSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateTaskSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = { content: input.content };
        if (input['description']) body['description'] = input['description'];
        if (input.dueString) body['due_string'] = input.dueString;
        if (input['priority']) body['priority'] = input['priority'];
        if (input.projectId) body['project_id'] = input.projectId;
        if (input['labels']?.length) body['labels'] = input['labels'];
        const task = await todoistFetch(getToken(this.config), 'POST', '/tasks', body) as Record<string, unknown>;
        return mapTask(task);
    }
}

export class TodoistGetTasksTool extends BaseTool<typeof GetTasksSchema, { tasks: TodoistTask[]; count: number }> {
    constructor(private config: TodoistToolConfig = {}) {
        super({
            id: 'todoist_get_tasks',
            name: 'Todoist Get Tasks',
            description: 'List active Todoist tasks, optionally filtered by project or filter query.',
            category: ToolCategory.API,
            parameters: GetTasksSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetTasksSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams();
        if (input.projectId) params.set('project_id', input.projectId);
        if (input.filter) params.set('filter', input.filter);
        const path = `/tasks${params.toString() ? '?' + params.toString() : ''}`;
        const tasks = await todoistFetch(getToken(this.config), 'GET', path) as Array<Record<string, unknown>>;
        const mapped = tasks.slice(0, input.limit ?? 20).map(mapTask);
        return { tasks: mapped, count: mapped.length };
    }
}

export class TodoistCompleteTaskTool extends BaseTool<typeof CompleteTaskSchema, { success: boolean }> {
    constructor(private config: TodoistToolConfig = {}) {
        super({
            id: 'todoist_complete_task',
            name: 'Todoist Complete Task',
            description: 'Mark a Todoist task as completed.',
            category: ToolCategory.API,
            parameters: CompleteTaskSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CompleteTaskSchema>, _ctx: ToolContext) {
        await todoistFetch(getToken(this.config), 'POST', `/tasks/${input.taskId}/close`);
        return { success: true };
    }
}

export class TodoistToolkit {
    readonly tools: BaseTool[];
    constructor(config: TodoistToolConfig = {}) {
        this.tools = [
            new TodoistCreateTaskTool(config),
            new TodoistGetTasksTool(config),
            new TodoistCompleteTaskTool(config),
            new TodoistUpdateTaskTool(config),
        ];
    }
}
