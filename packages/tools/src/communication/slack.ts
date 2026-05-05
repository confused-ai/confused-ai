/**
 * Slack tool implementation - TypeScript SlackTools
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';

/**
 * Slack API response types
 */
interface SlackPostMessageResponse {
    ok: boolean;
    channel?: string;
    ts?: string;
    message?: unknown;
    error?: string;
}

interface SlackChannel {
    id: string;
    name: string;
}

interface SlackChannelsResponse {
    ok: boolean;
    channels?: SlackChannel[];
    error?: string;
}

interface SlackMessage {
    text?: string;
    user?: string;
    ts?: string;
    subtype?: string;
    bot_id?: string;
    attachments?: unknown[];
}

interface SlackHistoryResponse {
    ok: boolean;
    messages?: SlackMessage[];
    error?: string;
}

interface SlackResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

/**
 * Parameters for sending a Slack message
 */
const SlackSendMessageParameters = z.object({
    channel: z.string().describe('The channel ID or name to send the message to'),
    text: z.string().describe('The text of the message to send'),
    thread_ts: z.string().optional().describe('Timestamp of the parent message (for threaded replies)'),
});

/**
 * Slack send message tool
 */
export class SlackSendMessageTool extends BaseTool<typeof SlackSendMessageParameters, SlackResult> {
    private token: string;
    private baseUrl = 'https://slack.com/api';

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof SlackSendMessageParameters>, 'parameters'>> & {
            token?: string;
        }
    ) {
        super({
            name: config?.name ?? 'slack_send_message',
            description: config?.description ?? 'Send a message to a Slack channel',
            parameters: SlackSendMessageParameters,
            category: config?.category ?? ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });

        this.token = config?.token || process.env['SLACK_TOKEN'] || '';

        if (!this.token) {
            throw new Error('Slack token is required. Set SLACK_TOKEN environment variable or pass token in config.');
        }
    }

    protected async performExecute(
        params: z.infer<typeof SlackSendMessageParameters>,
        _context: ToolContext
    ): Promise<SlackResult> {
        try {
            const body: Record<string, string> = {
                channel: params.channel,
                text: params.text,
            };

            if (params.thread_ts) {
                body['thread_ts'] = params['thread_ts'];
            }

            const response = await fetch(`${this.baseUrl}/chat.postMessage`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = (await response.json()) as SlackPostMessageResponse;

            if (data.ok) {
                return {
                    success: true,
                    data: {
                        channel: data.channel,
                        ts: data.ts,
                        message: data.message,
                    },
                };
            } else {
                return {
                    success: false,
                    error: data.error || 'Unknown Slack API error',
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * Parameters for listing Slack channels
 */
const SlackListChannelsParameters = z.object({
    limit: z.number().min(1).max(200).optional().default(100).describe('Maximum number of channels to return'),
});

/**
 * Slack list channels tool
 */
export class SlackListChannelsTool extends BaseTool<typeof SlackListChannelsParameters, SlackResult> {
    private token: string;
    private baseUrl = 'https://slack.com/api';

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof SlackListChannelsParameters>, 'parameters'>> & {
            token?: string;
        }
    ) {
        super({
            name: config?.name ?? 'slack_list_channels',
            description: config?.description ?? 'List all channels in the Slack workspace',
            parameters: SlackListChannelsParameters,
            category: config?.category ?? ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });

        this.token = config?.token || process.env['SLACK_TOKEN'] || '';

        if (!this.token) {
            throw new Error('Slack token is required. Set SLACK_TOKEN environment variable or pass token in config.');
        }
    }

    protected async performExecute(
        params: z.infer<typeof SlackListChannelsParameters>,
        _context: ToolContext
    ): Promise<SlackResult> {
        try {
            const response = await fetch(`${this.baseUrl}/conversations.list?limit=${params.limit}`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            const data = (await response.json()) as SlackChannelsResponse;

            if (data.ok) {
                const channels = (data.channels || []).map((channel) => ({
                    id: channel.id,
                    name: channel.name,
                }));

                return {
                    success: true,
                    data: channels,
                };
            } else {
                return {
                    success: false,
                    error: data.error || 'Unknown Slack API error',
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * Parameters for getting channel history
 */
const SlackGetChannelHistoryParameters = z.object({
    channel: z.string().describe('The channel ID to fetch history from'),
    limit: z.number().min(1).max(200).optional().default(100).describe('Maximum number of messages to return'),
});

/**
 * Slack get channel history tool
 */
export class SlackGetChannelHistoryTool extends BaseTool<typeof SlackGetChannelHistoryParameters, SlackResult> {
    private token: string;
    private baseUrl = 'https://slack.com/api';

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof SlackGetChannelHistoryParameters>, 'parameters'>> & {
            token?: string;
        }
    ) {
        super({
            name: config?.name ?? 'slack_get_channel_history',
            description: config?.description ?? 'Get the message history of a Slack channel',
            parameters: SlackGetChannelHistoryParameters,
            category: config?.category ?? ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });

        this.token = config?.token || process.env['SLACK_TOKEN'] || '';

        if (!this.token) {
            throw new Error('Slack token is required. Set SLACK_TOKEN environment variable or pass token in config.');
        }
    }

    protected async performExecute(
        params: z.infer<typeof SlackGetChannelHistoryParameters>,
        _context: ToolContext
    ): Promise<SlackResult> {
        try {
            const response = await fetch(
                `${this.baseUrl}/conversations.history?channel=${encodeURIComponent(params.channel)}&limit=${params.limit}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );

            const data = (await response.json()) as SlackHistoryResponse;

            if (data.ok) {
                const messages = (data.messages || []).map((msg) => ({
                    text: msg.text,
                    user: msg.user || (msg.bot_id ? 'bot' : 'unknown'),
                    ts: msg.ts,
                    subtype: msg.subtype || 'normal',
                    attachments: msg.attachments,
                }));

                return {
                    success: true,
                    data: messages,
                };
            } else {
                return {
                    success: false,
                    error: data.error || 'Unknown Slack API error',
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * Slack toolkit
 */
export class SlackToolkit {
    static create(options?: {
        token?: string;
        enableSendMessage?: boolean;
        enableListChannels?: boolean;
        enableGetHistory?: boolean;
    }): Array<SlackSendMessageTool | SlackListChannelsTool | SlackGetChannelHistoryTool> {
        const tools: Array<SlackSendMessageTool | SlackListChannelsTool | SlackGetChannelHistoryTool> = [];

        if (options?.enableSendMessage !== false) {
            tools.push(new SlackSendMessageTool({ ...(options?.token !== undefined && { token: options.token }) }));
        }
        if (options?.enableListChannels !== false) {
            tools.push(new SlackListChannelsTool({ ...(options?.token !== undefined && { token: options.token }) }));
        }
        if (options?.enableGetHistory !== false) {
            tools.push(new SlackGetChannelHistoryTool({ ...(options?.token !== undefined && { token: options.token }) }));
        }

        return tools;
    }
}
