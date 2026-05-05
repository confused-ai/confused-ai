/**
 * Google Calendar tools — list, create, update, and delete calendar events.
 * Requires OAuth2 access token with calendar scopes.
 * Get token: https://developers.google.com/calendar/api/quickstart/nodejs
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface GoogleCalendarToolConfig {
    /** OAuth2 access token (or GOOGLE_CALENDAR_ACCESS_TOKEN env var) */
    accessToken?: string;
    /** Default calendar ID (default: "primary") */
    calendarId?: string;
}

function getToken(config: GoogleCalendarToolConfig): string {
    const token = config.accessToken ?? process.env['GOOGLE_CALENDAR_ACCESS_TOKEN'];
    if (!token) throw new Error('GoogleCalendarTools require GOOGLE_CALENDAR_ACCESS_TOKEN');
    return token;
}

async function calFetch(token: string, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`Google Calendar API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return null;
    return res.json();
}

interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    attendees?: Array<{ email: string; responseStatus?: string }>;
    htmlLink?: string;
    status: string;
}

function mapEvent(e: Record<string, unknown>): CalendarEvent {
    const start = e['start'] as { dateTime?: string; date?: string };
    const end = e['end'] as { dateTime?: string; date?: string };
    const result: CalendarEvent = {
        id: e['id'] as string,
        summary: e['summary'] as string ?? '(No title)',
        start: start?.dateTime ?? start?.date ?? '',
        end: end?.dateTime ?? end?.date ?? '',
        status: e['status'] as string ?? 'confirmed',
    };
    if (e['description'] !== undefined) result.description = e['description'] as string;
    if (e['location'] !== undefined) result.location = e['location'] as string;
    if (e['attendees'] !== undefined) result.attendees = e['attendees'] as Array<{ email: string; responseStatus?: string }>;
    if (e['htmlLink'] !== undefined) result.htmlLink = e['htmlLink'] as string;
    return result;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ListEventsSchema = z.object({
    calendarId: z.string().optional().default('primary'),
    timeMin: z.string().optional().describe('ISO datetime — only events starting after this time'),
    timeMax: z.string().optional().describe('ISO datetime — only events starting before this time'),
    maxResults: z.number().int().min(1).max(2500).optional().default(10),
    query: z.string().optional().describe('Free-text search across event fields'),
    orderBy: z.enum(['startTime', 'updated']).optional().default('startTime'),
});

const CreateEventSchema = z.object({
    summary: z.string().describe('Event title'),
    description: z.string().optional(),
    location: z.string().optional(),
    startDateTime: z.string().describe('ISO 8601 datetime (e.g. 2025-01-15T10:00:00-07:00)'),
    endDateTime: z.string().describe('ISO 8601 datetime'),
    timeZone: z.string().optional().default('UTC'),
    attendees: z.array(z.string()).optional().describe('List of attendee email addresses'),
    calendarId: z.string().optional().default('primary'),
    sendNotifications: z.boolean().optional().default(true),
});

const UpdateEventSchema = z.object({
    eventId: z.string().describe('Event ID to update'),
    calendarId: z.string().optional().default('primary'),
    summary: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    startDateTime: z.string().optional(),
    endDateTime: z.string().optional(),
    timeZone: z.string().optional(),
});

const DeleteEventSchema = z.object({
    eventId: z.string().describe('Event ID to delete'),
    calendarId: z.string().optional().default('primary'),
    sendNotifications: z.boolean().optional().default(true),
});

const GetEventSchema = z.object({
    eventId: z.string().describe('Event ID to retrieve'),
    calendarId: z.string().optional().default('primary'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class GoogleCalendarListEventsTool extends BaseTool<typeof ListEventsSchema, { events: CalendarEvent[]; count: number }> {
    constructor(private config: GoogleCalendarToolConfig = {}) {
        super({
            id: 'google_calendar_list_events',
            name: 'Google Calendar List Events',
            description: 'List upcoming calendar events, optionally filtered by time range or keyword.',
            category: ToolCategory.API,
            parameters: ListEventsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListEventsSchema>, _ctx: ToolContext) {
        const calId = input.calendarId ?? this.config.calendarId ?? 'primary';
        const params = new URLSearchParams({
            maxResults: String(input.maxResults ?? 10),
            singleEvents: 'true',
            orderBy: input.orderBy ?? 'startTime',
        });
        if (input.timeMin) params.set('timeMin', input.timeMin);
        if (input.timeMax) params.set('timeMax', input.timeMax);
        if (input.query) params.set('q', input.query);

        const data = await calFetch(getToken(this.config), 'GET', `/calendars/${encodeURIComponent(calId)}/events?${params}`) as {
            items: Array<Record<string, unknown>>;
        };
        const events = (data.items ?? []).map(mapEvent);
        return { events, count: events.length };
    }
}

export class GoogleCalendarCreateEventTool extends BaseTool<typeof CreateEventSchema, CalendarEvent> {
    constructor(private config: GoogleCalendarToolConfig = {}) {
        super({
            id: 'google_calendar_create_event',
            name: 'Google Calendar Create Event',
            description: 'Create a new calendar event with optional attendees, location, and description.',
            category: ToolCategory.API,
            parameters: CreateEventSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateEventSchema>, _ctx: ToolContext) {
        const calId = input.calendarId ?? this.config.calendarId ?? 'primary';
        const body: Record<string, unknown> = {
            summary: input.summary,
            start: { dateTime: input.startDateTime, timeZone: input.timeZone ?? 'UTC' },
            end: { dateTime: input.endDateTime, timeZone: input.timeZone ?? 'UTC' },
        };
        if (input['description']) body['description'] = input['description'];
        if (input['location']) body['location'] = input['location'];
        if (input['attendees']?.length) body['attendees'] = input['attendees'].map((e) => ({ email: e }));

        const params = new URLSearchParams({ sendNotifications: String(input.sendNotifications ?? true) });
        const event = await calFetch(getToken(this.config), 'POST', `/calendars/${encodeURIComponent(calId)}/events?${params}`, body) as Record<string, unknown>;
        return mapEvent(event);
    }
}

export class GoogleCalendarUpdateEventTool extends BaseTool<typeof UpdateEventSchema, CalendarEvent> {
    constructor(private config: GoogleCalendarToolConfig = {}) {
        super({
            id: 'google_calendar_update_event',
            name: 'Google Calendar Update Event',
            description: 'Update an existing calendar event — title, time, location, or description.',
            category: ToolCategory.API,
            parameters: UpdateEventSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof UpdateEventSchema>, _ctx: ToolContext) {
        const calId = input.calendarId ?? this.config.calendarId ?? 'primary';
        const body: Record<string, unknown> = {};
        if (input['summary']) body['summary'] = input['summary'];
        if (input['description'] !== undefined) body['description'] = input['description'];
        if (input['location'] !== undefined) body['location'] = input['location'];
        if (input.startDateTime) body['start'] = { dateTime: input.startDateTime, timeZone: input.timeZone ?? 'UTC' };
        if (input.endDateTime) body['end'] = { dateTime: input.endDateTime, timeZone: input.timeZone ?? 'UTC' };

        const event = await calFetch(getToken(this.config), 'PATCH', `/calendars/${encodeURIComponent(calId)}/events/${input.eventId}`, body) as Record<string, unknown>;
        return mapEvent(event);
    }
}

export class GoogleCalendarDeleteEventTool extends BaseTool<typeof DeleteEventSchema, { success: boolean }> {
    constructor(private config: GoogleCalendarToolConfig = {}) {
        super({
            id: 'google_calendar_delete_event',
            name: 'Google Calendar Delete Event',
            description: 'Delete a calendar event permanently.',
            category: ToolCategory.API,
            parameters: DeleteEventSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof DeleteEventSchema>, _ctx: ToolContext) {
        const calId = input.calendarId ?? this.config.calendarId ?? 'primary';
        const params = new URLSearchParams({ sendNotifications: String(input.sendNotifications ?? true) });
        await calFetch(getToken(this.config), 'DELETE', `/calendars/${encodeURIComponent(calId)}/events/${input.eventId}?${params}`);
        return { success: true };
    }
}

export class GoogleCalendarGetEventTool extends BaseTool<typeof GetEventSchema, CalendarEvent> {
    constructor(private config: GoogleCalendarToolConfig = {}) {
        super({
            id: 'google_calendar_get_event',
            name: 'Google Calendar Get Event',
            description: 'Retrieve full details of a specific calendar event by ID.',
            category: ToolCategory.API,
            parameters: GetEventSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetEventSchema>, _ctx: ToolContext) {
        const calId = input.calendarId ?? this.config.calendarId ?? 'primary';
        const event = await calFetch(getToken(this.config), 'GET', `/calendars/${encodeURIComponent(calId)}/events/${input.eventId}`) as Record<string, unknown>;
        return mapEvent(event);
    }
}

export class GoogleCalendarToolkit {
    readonly tools: BaseTool[];
    constructor(config: GoogleCalendarToolConfig = {}) {
        this.tools = [
            new GoogleCalendarListEventsTool(config),
            new GoogleCalendarCreateEventTool(config),
            new GoogleCalendarUpdateEventTool(config),
            new GoogleCalendarDeleteEventTool(config),
            new GoogleCalendarGetEventTool(config),
        ];
    }
}
