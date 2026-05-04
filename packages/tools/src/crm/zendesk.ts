/**
 * Zendesk support tools — manage tickets and users via Zendesk REST API.
 * API docs: https://developer.zendesk.com/api-reference/
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface ZendeskToolConfig {
    /** Zendesk subdomain, e.g. "mycompany" (or ZENDESK_SUBDOMAIN env var) */
    subdomain?: string;
    /** Zendesk agent email (or ZENDESK_EMAIL env var) */
    email?: string;
    /** Zendesk API token (or ZENDESK_API_TOKEN env var) */
    apiToken?: string;
}

function getAuth(config: ZendeskToolConfig): { baseUrl: string; headers: Record<string, string> } {
    const subdomain = config.subdomain ?? process.env.ZENDESK_SUBDOMAIN;
    const email = config.email ?? process.env.ZENDESK_EMAIL;
    const apiToken = config.apiToken ?? process.env.ZENDESK_API_TOKEN;
    if (!subdomain) throw new Error('ZendeskTools require ZENDESK_SUBDOMAIN');
    if (!email) throw new Error('ZendeskTools require ZENDESK_EMAIL');
    if (!apiToken) throw new Error('ZendeskTools require ZENDESK_API_TOKEN');
    const credentials = Buffer.from(`${email}/token:${apiToken}`).toString('base64');
    return {
        baseUrl: `https://${subdomain}.zendesk.com/api/v2`,
        headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
    };
}

async function zendeskRequest(auth: ReturnType<typeof getAuth>, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`${auth.baseUrl}${path}`, {
        method,
        headers: auth.headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Zendesk API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return { success: true };
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ListTicketsSchema = z.object({
    status: z.enum(['new', 'open', 'pending', 'hold', 'solved', 'closed']).optional()
        .describe('Filter tickets by status'),
    perPage: z.number().int().min(1).max(100).optional().default(25).describe('Results per page'),
    page: z.number().int().min(1).optional().default(1).describe('Page number'),
});

const GetTicketSchema = z.object({
    ticketId: z.number().int().describe('Zendesk ticket ID'),
});

const CreateTicketSchema = z.object({
    subject: z.string().describe('Ticket subject'),
    body: z.string().describe('Ticket body/description'),
    requesterEmail: z.string().email().optional().describe('Email of the requester'),
    requesterName: z.string().optional().describe('Name of the requester'),
    priority: z.enum(['urgent', 'high', 'normal', 'low']).optional().default('normal')
        .describe('Ticket priority'),
    type: z.enum(['problem', 'incident', 'question', 'task']).optional()
        .describe('Ticket type'),
    tags: z.array(z.string()).optional().describe('Tags to apply to the ticket'),
});

const UpdateTicketSchema = z.object({
    ticketId: z.number().int().describe('Zendesk ticket ID to update'),
    status: z.enum(['new', 'open', 'pending', 'hold', 'solved', 'closed']).optional()
        .describe('New status'),
    priority: z.enum(['urgent', 'high', 'normal', 'low']).optional().describe('New priority'),
    comment: z.string().optional().describe('Comment to add to the ticket'),
    publicComment: z.boolean().optional().default(true).describe('Whether the comment is public'),
    tags: z.array(z.string()).optional().describe('Replace ticket tags'),
});

const SearchTicketsSchema = z.object({
    query: z.string().describe('Zendesk search query (e.g. "status:open type:ticket")'),
    perPage: z.number().int().min(1).max(100).optional().default(10).describe('Results per page'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ZendeskListTicketsTool extends BaseTool<typeof ListTicketsSchema> {
    constructor(private config: ZendeskToolConfig = {}) {
        super({
            id: 'zendesk_list_tickets',
            name: 'Zendesk List Tickets',
            description: 'List Zendesk support tickets, optionally filtered by status.',
            category: ToolCategory.API,
            parameters: ListTicketsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListTicketsSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({
            per_page: String(input.perPage ?? 25),
            page: String(input.page ?? 1),
        });
        const path = input.status
            ? `/tickets?${params}&status=${input.status}`
            : `/tickets?${params}`;
        return zendeskRequest(auth, 'GET', path);
    }
}

export class ZendeskGetTicketTool extends BaseTool<typeof GetTicketSchema> {
    constructor(private config: ZendeskToolConfig = {}) {
        super({
            id: 'zendesk_get_ticket',
            name: 'Zendesk Get Ticket',
            description: 'Get full details of a Zendesk ticket by ID.',
            category: ToolCategory.API,
            parameters: GetTicketSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetTicketSchema>, _ctx: ToolContext) {
        return zendeskRequest(getAuth(this.config), 'GET', `/tickets/${input.ticketId}`);
    }
}

export class ZendeskCreateTicketTool extends BaseTool<typeof CreateTicketSchema> {
    constructor(private config: ZendeskToolConfig = {}) {
        super({
            id: 'zendesk_create_ticket',
            name: 'Zendesk Create Ticket',
            description: 'Create a new Zendesk support ticket.',
            category: ToolCategory.API,
            parameters: CreateTicketSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateTicketSchema>, _ctx: ToolContext) {
        const ticket: Record<string, unknown> = {
            subject: input.subject,
            comment: { body: input.body },
            priority: input.priority ?? 'normal',
        };
        if (input.requesterEmail) {
            ticket['requester'] = { email: input.requesterEmail, name: input.requesterName };
        }
        if (input.type) ticket['type'] = input.type;
        if (input.tags?.length) ticket['tags'] = input.tags;
        return zendeskRequest(getAuth(this.config), 'POST', '/tickets', { ticket });
    }
}

export class ZendeskUpdateTicketTool extends BaseTool<typeof UpdateTicketSchema> {
    constructor(private config: ZendeskToolConfig = {}) {
        super({
            id: 'zendesk_update_ticket',
            name: 'Zendesk Update Ticket',
            description: 'Update a Zendesk ticket status, priority, or add a comment.',
            category: ToolCategory.API,
            parameters: UpdateTicketSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof UpdateTicketSchema>, _ctx: ToolContext) {
        const ticket: Record<string, unknown> = {};
        if (input.status) ticket['status'] = input.status;
        if (input.priority) ticket['priority'] = input.priority;
        if (input.comment) {
            ticket['comment'] = { body: input.comment, public: input.publicComment ?? true };
        }
        if (input.tags) ticket['tags'] = input.tags;
        return zendeskRequest(getAuth(this.config), 'PUT', `/tickets/${input.ticketId}`, { ticket });
    }
}

export class ZendeskSearchTicketsTool extends BaseTool<typeof SearchTicketsSchema> {
    constructor(private config: ZendeskToolConfig = {}) {
        super({
            id: 'zendesk_search_tickets',
            name: 'Zendesk Search Tickets',
            description: 'Search Zendesk tickets using Zendesk search syntax.',
            category: ToolCategory.API,
            parameters: SearchTicketsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchTicketsSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({
            query: input.query,
            per_page: String(input.perPage ?? 10),
        });
        return zendeskRequest(getAuth(this.config), 'GET', `/search?${params}`);
    }
}

export class ZendeskToolkit {
    readonly listTickets: ZendeskListTicketsTool;
    readonly getTicket: ZendeskGetTicketTool;
    readonly createTicket: ZendeskCreateTicketTool;
    readonly updateTicket: ZendeskUpdateTicketTool;
    readonly searchTickets: ZendeskSearchTicketsTool;

    constructor(config: ZendeskToolConfig = {}) {
        this.listTickets = new ZendeskListTicketsTool(config);
        this.getTicket = new ZendeskGetTicketTool(config);
        this.createTicket = new ZendeskCreateTicketTool(config);
        this.updateTicket = new ZendeskUpdateTicketTool(config);
        this.searchTickets = new ZendeskSearchTicketsTool(config);
    }

    getTools() {
        return [this.listTickets, this.getTicket, this.createTicket, this.updateTicket, this.searchTickets];
    }
}
