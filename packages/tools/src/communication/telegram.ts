/**
 * Telegram tool implementation - TypeScript TelegramTools
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';

/**
 * Telegram API response
 */
interface TelegramResponse {
    ok: boolean;
    result?: unknown;
    description?: string;
    error_code?: number;
}

interface TelegramResult {
    success: boolean;
    message?: string;
    error?: string;
    response?: unknown;
}

/**
 * Parameters for sending a Telegram message
 */
const TelegramSendMessageParameters = z.object({
    message: z.string().describe('The message to send'),
    chat_id: z.string().optional().describe('Chat ID to send message to (overrides default)'),
    parse_mode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional().describe('Parse mode for the message'),
});

/**
 * Telegram tool for sending messages
 */
export class TelegramTool extends BaseTool<typeof TelegramSendMessageParameters, TelegramResult> {
    private token: string;
    private defaultChatId: string;
    private baseUrl = 'https://api.telegram.org';

    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof TelegramSendMessageParameters>, 'parameters'>> & {
            token?: string;
            chatId?: string;
        }
    ) {
        super({
            name: config?.name ?? 'telegram_send_message',
            description: config?.description ?? 'Send a message to a Telegram chat',
            parameters: TelegramSendMessageParameters,
            category: config?.category ?? ToolCategory.API,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...config,
        });

        this.token = config?.token || process.env['TELEGRAM_TOKEN'] || '';
        this.defaultChatId = config?.chatId || process.env['TELEGRAM_CHAT_ID'] || '';

        if (!this.token) {
            throw new Error('Telegram token is required. Set TELEGRAM_TOKEN environment variable or pass token in config.');
        }
    }

    protected async performExecute(
        params: z.infer<typeof TelegramSendMessageParameters>,
        _context: ToolContext
    ): Promise<TelegramResult> {
        const chatId = params.chat_id || this.defaultChatId;

        if (!chatId) {
            return {
                success: false,
                error: 'Chat ID is required. Set TELEGRAM_CHAT_ID environment variable, pass chatId in config, or provide chat_id in parameters.',
            };
        }

        try {
            const response = await fetch(`${this.baseUrl}/bot${this.token}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: params.message,
                    parse_mode: params.parse_mode,
                }),
            });

            const data = (await response.json()) as TelegramResponse;

            if (data.ok) {
                return {
                    success: true,
                    message: 'Message sent successfully',
                    response: data.result,
                };
            } else {
                return {
                    success: false,
                    error: data.description || 'Unknown error from Telegram API',
                    response: data,
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
 * Telegram toolkit
 */
export class TelegramToolkit {
    static create(options: { token?: string; chatId?: string }): Array<TelegramTool> {
        return [new TelegramTool({ ...(options.token !== undefined && { token: options.token }), ...(options.chatId !== undefined && { chatId: options.chatId }) })];
    }
}
