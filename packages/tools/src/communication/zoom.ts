/**
 * Zoom meeting tools — create and manage Zoom meetings via Zoom API.
 * API docs: https://developers.zoom.us/docs/api/
 * App: https://marketplace.zoom.us/develop/create (OAuth or Server-to-Server OAuth)
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface ZoomToolConfig {
    /** Zoom OAuth access token (or ZOOM_ACCESS_TOKEN env var) */
    accessToken?: string;
    /** Zoom Account ID for Server-to-Server OAuth (or ZOOM_ACCOUNT_ID env var) */
    accountId?: string;
    /** Zoom Client ID for Server-to-Server OAuth (or ZOOM_CLIENT_ID env var) */
    clientId?: string;
    /** Zoom Client Secret for Server-to-Server OAuth (or ZOOM_CLIENT_SECRET env var) */
    clientSecret?: string;
}

async function getAccessToken(config: ZoomToolConfig): Promise<string> {
    // First try direct token
    const directToken = config.accessToken ?? process.env['ZOOM_ACCESS_TOKEN'];
    if (directToken) return directToken;

    // Try Server-to-Server OAuth
    const accountId = config.accountId ?? process.env['ZOOM_ACCOUNT_ID'];
    const clientId = config.clientId ?? process.env['ZOOM_CLIENT_ID'];
    const clientSecret = config.clientSecret ?? process.env['ZOOM_CLIENT_SECRET'];

    if (!accountId || !clientId || !clientSecret) {
        throw new Error('ZoomTools require ZOOM_ACCESS_TOKEN or (ZOOM_ACCOUNT_ID + ZOOM_CLIENT_ID + ZOOM_CLIENT_SECRET)');
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
        method: 'POST',
        headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) throw new Error(`Zoom OAuth ${res.status}: ${await res.text()}`);
    const data = await res.json() as { access_token: string };
    return data.access_token;
}

async function zoomRequest(token: string, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`https://api.zoom.us/v2${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`Zoom API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return { success: true };
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const CreateMeetingSchema = z.object({
    topic: z.string().describe('Meeting topic/title'),
    duration: z.number().int().min(1).optional().default(60).describe('Duration in minutes'),
    startTime: z.string().optional()
        .describe('Start time in ISO 8601 format (e.g. 2024-01-15T10:00:00). Omit for instant meeting.'),
    timezone: z.string().optional().default('UTC').describe('Timezone for the meeting'),
    agenda: z.string().optional().describe('Meeting agenda'),
    password: z.string().optional().describe('Meeting password'),
    hostVideo: z.boolean().optional().default(true).describe('Start video for host'),
    participantVideo: z.boolean().optional().default(false).describe('Start video for participants'),
    waitingRoom: z.boolean().optional().default(true).describe('Enable waiting room'),
    muteUponEntry: z.boolean().optional().default(true).describe('Mute participants on entry'),
});

const GetMeetingSchema = z.object({
    meetingId: z.union([z.string(), z.number()]).describe('Zoom meeting ID'),
});

const ListMeetingsSchema = z.object({
    type: z.enum(['scheduled', 'live', 'upcoming', 'upcoming_meetings', 'previous_meetings'])
        .optional().default('upcoming').describe('Type of meetings to list'),
    pageSize: z.number().int().min(1).max(300).optional().default(30).describe('Number of records per page'),
});

const DeleteMeetingSchema = z.object({
    meetingId: z.union([z.string(), z.number()]).describe('Zoom meeting ID to delete'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ZoomCreateMeetingTool extends BaseTool<typeof CreateMeetingSchema> {
    constructor(private config: ZoomToolConfig = {}) {
        super({
            id: 'zoom_create_meeting',
            name: 'Zoom Create Meeting',
            description: 'Create a new Zoom meeting and return the join URL.',
            category: ToolCategory.API,
            parameters: CreateMeetingSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateMeetingSchema>, _ctx: ToolContext) {
        const token = await getAccessToken(this.config);
        const meetingType = input.startTime ? 2 : 1; // 1=instant, 2=scheduled
        return zoomRequest(token, 'POST', '/users/me/meetings', {
            topic: input.topic,
            type: meetingType,
            start_time: input.startTime,
            duration: input.duration ?? 60,
            timezone: input.timezone ?? 'UTC',
            agenda: input.agenda,
            password: input.password,
            settings: {
                host_video: input.hostVideo ?? true,
                participant_video: input.participantVideo ?? false,
                waiting_room: input.waitingRoom ?? true,
                mute_upon_entry: input.muteUponEntry ?? true,
            },
        });
    }
}

export class ZoomGetMeetingTool extends BaseTool<typeof GetMeetingSchema> {
    constructor(private config: ZoomToolConfig = {}) {
        super({
            id: 'zoom_get_meeting',
            name: 'Zoom Get Meeting',
            description: 'Get details of a Zoom meeting by meeting ID.',
            category: ToolCategory.API,
            parameters: GetMeetingSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetMeetingSchema>, _ctx: ToolContext) {
        const token = await getAccessToken(this.config);
        return zoomRequest(token, 'GET', `/meetings/${input.meetingId}`);
    }
}

export class ZoomListMeetingsTool extends BaseTool<typeof ListMeetingsSchema> {
    constructor(private config: ZoomToolConfig = {}) {
        super({
            id: 'zoom_list_meetings',
            name: 'Zoom List Meetings',
            description: 'List Zoom meetings for the authenticated user.',
            category: ToolCategory.API,
            parameters: ListMeetingsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListMeetingsSchema>, _ctx: ToolContext) {
        const token = await getAccessToken(this.config);
        const params = new URLSearchParams({
            type: input.type ?? 'upcoming',
            page_size: String(input.pageSize ?? 30),
        });
        return zoomRequest(token, 'GET', `/users/me/meetings?${params}`);
    }
}

export class ZoomDeleteMeetingTool extends BaseTool<typeof DeleteMeetingSchema> {
    constructor(private config: ZoomToolConfig = {}) {
        super({
            id: 'zoom_delete_meeting',
            name: 'Zoom Delete Meeting',
            description: 'Delete/cancel a Zoom meeting.',
            category: ToolCategory.API,
            parameters: DeleteMeetingSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof DeleteMeetingSchema>, _ctx: ToolContext) {
        const token = await getAccessToken(this.config);
        return zoomRequest(token, 'DELETE', `/meetings/${input.meetingId}`);
    }
}

export class ZoomToolkit {
    readonly createMeeting: ZoomCreateMeetingTool;
    readonly getMeeting: ZoomGetMeetingTool;
    readonly listMeetings: ZoomListMeetingsTool;
    readonly deleteMeeting: ZoomDeleteMeetingTool;

    constructor(config: ZoomToolConfig = {}) {
        this.createMeeting = new ZoomCreateMeetingTool(config);
        this.getMeeting = new ZoomGetMeetingTool(config);
        this.listMeetings = new ZoomListMeetingsTool(config);
        this.deleteMeeting = new ZoomDeleteMeetingTool(config);
    }

    getTools() {
        return [this.createMeeting, this.getMeeting, this.listMeetings, this.deleteMeeting];
    }
}
