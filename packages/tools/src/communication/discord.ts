/**
 * Discord tools — send messages, read history, manage channels.
 * Uses Discord REST API v10 directly (no gateway required).
 * Requires a Bot Token: https://discord.com/developers/applications
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface DiscordToolConfig {
    botToken?: string;
}

const DISCORD_API = 'https://discord.com/api/v10';

function getToken(config: DiscordToolConfig): string {
    const token = config.botToken ?? process.env.DISCORD_BOT_TOKEN;
    if (!token) throw new Error('DiscordTools require DISCORD_BOT_TOKEN');
    return token;
}

async function discordFetch(token: string, path: string, opts: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${DISCORD_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json',
            ...(opts.headers as Record<string, string> | undefined),
        },
    });
    if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SendMsgSchema = z.object({
    channelId: z.string().describe('Discord channel ID'),
    content: z.string().max(2000).describe('Message content (max 2000 chars)'),
    tts: z.boolean().optional().default(false).describe('Text-to-speech message'),
});

const GetMsgsSchema = z.object({
    channelId: z.string().describe('Discord channel ID'),
    limit: z.number().int().min(1).max(100).optional().default(50).describe('Number of messages (max 100)'),
    before: z.string().optional().describe('Get messages before this message ID'),
});

const CreateChannelSchema = z.object({
    guildId: z.string().describe('Discord guild (server) ID'),
    name: z.string().describe('Channel name'),
    topic: z.string().optional().describe('Channel topic'),
    type: z.number().int().optional().default(0).describe('Channel type: 0=text, 2=voice'),
});

const DeleteMsgSchema = z.object({
    channelId: z.string().describe('Discord channel ID'),
    messageId: z.string().describe('Message ID to delete'),
});

const ListMembersSchema = z.object({
    guildId: z.string().describe('Discord guild ID'),
    limit: z.number().int().min(1).max(1000).optional().default(100).describe('Max members to return'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class DiscordSendMessageTool extends BaseTool<typeof SendMsgSchema, { id: string; channelId: string; content: string }> {
    constructor(private config: DiscordToolConfig) {
        super({ id: 'discord_send_message', name: 'Discord Send Message', description: 'Send a text message to a Discord channel.', category: ToolCategory.API, parameters: SendMsgSchema });
    }
    protected async performExecute(input: z.infer<typeof SendMsgSchema>, _ctx: ToolContext) {
        const msg = await discordFetch(getToken(this.config), `/channels/${input.channelId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content: input.content, tts: input.tts ?? false }),
        }) as { id: string; channel_id: string; content: string };
        return { id: msg.id, channelId: msg.channel_id, content: msg.content };
    }
}

export class DiscordGetMessagesTool extends BaseTool<typeof GetMsgsSchema, { messages: Array<{ id: string; content: string; author: string; timestamp: string }> }> {
    constructor(private config: DiscordToolConfig) {
        super({ id: 'discord_get_messages', name: 'Discord Get Messages', description: 'Retrieve recent messages from a Discord channel.', category: ToolCategory.API, parameters: GetMsgsSchema });
    }
    protected async performExecute(input: z.infer<typeof GetMsgsSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ limit: String(input.limit ?? 50) });
        if (input.before) params.set('before', input.before);
        const msgs = await discordFetch(getToken(this.config), `/channels/${input.channelId}/messages?${params}`) as Array<{
            id: string; content: string; author: { username: string }; timestamp: string;
        }>;
        return { messages: msgs.map((m) => ({ id: m.id, content: m.content, author: m.author.username, timestamp: m.timestamp })) };
    }
}

export class DiscordCreateChannelTool extends BaseTool<typeof CreateChannelSchema, { id: string; name: string; type: number }> {
    constructor(private config: DiscordToolConfig) {
        super({ id: 'discord_create_channel', name: 'Discord Create Channel', description: 'Create a new channel in a Discord guild.', category: ToolCategory.API, parameters: CreateChannelSchema });
    }
    protected async performExecute(input: z.infer<typeof CreateChannelSchema>, _ctx: ToolContext) {
        const ch = await discordFetch(getToken(this.config), `/guilds/${input.guildId}/channels`, {
            method: 'POST',
            body: JSON.stringify({ name: input.name, topic: input.topic, type: input.type ?? 0 }),
        }) as { id: string; name: string; type: number };
        return { id: ch.id, name: ch.name, type: ch.type };
    }
}

export class DiscordDeleteMessageTool extends BaseTool<typeof DeleteMsgSchema, { success: boolean }> {
    constructor(private config: DiscordToolConfig) {
        super({ id: 'discord_delete_message', name: 'Discord Delete Message', description: 'Delete a specific message from a Discord channel.', category: ToolCategory.API, parameters: DeleteMsgSchema });
    }
    protected async performExecute(input: z.infer<typeof DeleteMsgSchema>, _ctx: ToolContext) {
        await discordFetch(getToken(this.config), `/channels/${input.channelId}/messages/${input.messageId}`, { method: 'DELETE' });
        return { success: true };
    }
}

export class DiscordListMembersTool extends BaseTool<typeof ListMembersSchema, { members: Array<{ id: string; username: string; roles: string[] }> }> {
    constructor(private config: DiscordToolConfig) {
        super({ id: 'discord_list_members', name: 'Discord List Members', description: 'List members of a Discord guild.', category: ToolCategory.API, parameters: ListMembersSchema });
    }
    protected async performExecute(input: z.infer<typeof ListMembersSchema>, _ctx: ToolContext) {
        const members = await discordFetch(getToken(this.config), `/guilds/${input.guildId}/members?limit=${input.limit ?? 100}`) as Array<{
            user: { id: string; username: string }; roles: string[];
        }>;
        return { members: members.map((m) => ({ id: m.user.id, username: m.user.username, roles: m.roles })) };
    }
}

// ── Toolkit ────────────────────────────────────────────────────────────────

export class DiscordToolkit {
    readonly tools: BaseTool[];
    constructor(config: DiscordToolConfig = {}) {
        this.tools = [
            new DiscordSendMessageTool(config),
            new DiscordGetMessagesTool(config),
            new DiscordCreateChannelTool(config),
            new DiscordDeleteMessageTool(config),
            new DiscordListMembersTool(config),
        ];
    }
}
