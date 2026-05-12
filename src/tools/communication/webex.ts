/**
 * Webex messaging tools — send messages and manage rooms via Cisco Webex API.
 * API docs: https://developer.webex.com/docs/api/v1/messages
 * Token: https://developer.webex.com/docs/getting-started
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface WebexToolConfig {
    /** Webex access token (or WEBEX_ACCESS_TOKEN env var) */
    accessToken?: string;
}

function getToken(config: WebexToolConfig): string {
    const token = config.accessToken ?? process.env['WEBEX_ACCESS_TOKEN'];
    if (!token) throw new Error('WebexTools require WEBEX_ACCESS_TOKEN');
    return token;
}

async function webexRequest(token: string, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`https://webexapis.com/v1${path}`, {
        method,
        ...(body ? { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: { Authorization: `Bearer ${token}` } }),
    });
    if (!res.ok) throw new Error(`Webex API ${String(res.status)}: ${await res.text()}`);
    if (res.status === 204) return { success: true };
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SendMessageSchemaBase = z.object({
    roomId: z.string().optional().describe('Webex room/space ID to send the message to'),
    toPersonEmail: z.string().email().optional().describe('Email of the person to send a direct message to'),
    text: z.string().optional().describe('Plain text message'),
    markdown: z.string().optional().describe('Markdown-formatted message'),
    html: z.string().optional().describe('HTML-formatted message'),
    files: z.array(z.string().url()).optional().describe('URLs of files to attach'),
});
/** Base schema for BaseTool<T> constraint (ZodObject only — no ZodEffects). */
const SendMessageSchema = SendMessageSchemaBase;

const ListRoomsSchema = z.object({
    type: z.enum(['direct', 'group']).optional().describe('Filter by room type'),
    max: z.number().int().min(1).max(1000).optional().default(50).describe('Maximum number of rooms'),
});

const GetMessagesSchema = z.object({
    roomId: z.string().describe('Webex room/space ID'),
    max: z.number().int().min(1).max(1000).optional().default(50).describe('Maximum number of messages'),
    before: z.string().optional().describe('List messages before this ISO 8601 date'),
    mentionedPeople: z.string().optional().describe('Filter to messages mentioning this person ID'),
});

const CreateRoomSchema = z.object({
    title: z.string().describe('Room/space title'),
    isLocked: z.boolean().optional().default(false).describe('Lock the room (only moderators can add members)'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class WebexSendMessageTool extends BaseTool<typeof SendMessageSchema> {
    constructor(private config: WebexToolConfig = {}) {
        super({
            id: 'webex_send_message',
            name: 'Webex Send Message',
            description: 'Send a message to a Webex room or directly to a person.',
            category: ToolCategory.API,
            parameters: SendMessageSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SendMessageSchema>, _ctx: ToolContext) {
        if (!input.roomId && !input.toPersonEmail) {
            throw new Error('Either roomId or toPersonEmail must be provided');
        }
        return webexRequest(getToken(this.config), 'POST', '/messages', input);
    }
}

export class WebexListRoomsTool extends BaseTool<typeof ListRoomsSchema> {
    constructor(private config: WebexToolConfig = {}) {
        super({
            id: 'webex_list_rooms',
            name: 'Webex List Rooms',
            description: 'List Webex rooms/spaces the authenticated user belongs to.',
            category: ToolCategory.API,
            parameters: ListRoomsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListRoomsSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ max: String(input.max) });
        if (input.type) params.set('type', input.type);
        return webexRequest(getToken(this.config), 'GET', `/rooms?${params.toString()}`);
    }
}

export class WebexGetMessagesTool extends BaseTool<typeof GetMessagesSchema> {
    constructor(private config: WebexToolConfig = {}) {
        super({
            id: 'webex_get_messages',
            name: 'Webex Get Messages',
            description: 'Get messages from a Webex room.',
            category: ToolCategory.API,
            parameters: GetMessagesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetMessagesSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ roomId: input.roomId, max: String(input.max) });
        if (input.before) params.set('before', input.before);
        if (input.mentionedPeople) params.set('mentionedPeople', input.mentionedPeople);
        return webexRequest(getToken(this.config), 'GET', `/messages?${params.toString()}`);
    }
}

export class WebexCreateRoomTool extends BaseTool<typeof CreateRoomSchema> {
    constructor(private config: WebexToolConfig = {}) {
        super({
            id: 'webex_create_room',
            name: 'Webex Create Room',
            description: 'Create a new Webex room/space.',
            category: ToolCategory.API,
            parameters: CreateRoomSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateRoomSchema>, _ctx: ToolContext) {
        return webexRequest(getToken(this.config), 'POST', '/rooms', {
            title: input.title,
            isLocked: input.isLocked,
        });
    }
}

export class WebexToolkit {
    readonly sendMessage: WebexSendMessageTool;
    readonly listRooms: WebexListRoomsTool;
    readonly getMessages: WebexGetMessagesTool;
    readonly createRoom: WebexCreateRoomTool;

    constructor(config: WebexToolConfig = {}) {
        this.sendMessage = new WebexSendMessageTool(config);
        this.listRooms = new WebexListRoomsTool(config);
        this.getMessages = new WebexGetMessagesTool(config);
        this.createRoom = new WebexCreateRoomTool(config);
    }

    getTools() {
        return [this.sendMessage, this.listRooms, this.getMessages, this.createRoom];
    }
}
