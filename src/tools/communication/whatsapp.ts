/**
 * WhatsApp Business API tools — send messages via WhatsApp Cloud API.
 * API key: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface WhatsAppToolConfig {
    /** WhatsApp Cloud API access token (or WHATSAPP_TOKEN env var) */
    accessToken?: string;
    /** Phone Number ID from Meta dashboard (or WHATSAPP_PHONE_NUMBER_ID env var) */
    phoneNumberId?: string;
}

function getConfig(config: WhatsAppToolConfig): { token: string; phoneNumberId: string } {
    const token = config.accessToken ?? process.env['WHATSAPP_TOKEN'];
    const phoneNumberId = config.phoneNumberId ?? process.env['WHATSAPP_PHONE_NUMBER_ID'];
    if (!token) throw new Error('WhatsAppTools require WHATSAPP_TOKEN');
    if (!phoneNumberId) throw new Error('WhatsAppTools require WHATSAPP_PHONE_NUMBER_ID');
    return { token, phoneNumberId };
}

async function whatsappPost(token: string, phoneNumberId: string, body: object): Promise<unknown> {
    const res = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        }
    );
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SendTextSchema = z.object({
    to: z.string().describe('Recipient phone number in E.164 format (e.g. +1234567890)'),
    message: z.string().min(1).max(4096).describe('Text message to send'),
    previewUrl: z.boolean().optional().default(false).describe('Enable URL preview in the message'),
});

const SendTemplateSchema = z.object({
    to: z.string().describe('Recipient phone number in E.164 format'),
    templateName: z.string().describe('Name of the approved WhatsApp template'),
    languageCode: z.string().optional().default('en_US').describe('Template language code'),
    components: z.array(z.object({
        type: z.enum(['header', 'body', 'button']),
        parameters: z.array(z.object({
            type: z.enum(['text', 'currency', 'date_time', 'image', 'document', 'video']),
            text: z.string().optional(),
        })),
    })).optional().describe('Template component parameters'),
});

const SendImageSchema = z.object({
    to: z.string().describe('Recipient phone number in E.164 format'),
    imageUrl: z.string().url().describe('URL of the image to send'),
    caption: z.string().optional().describe('Optional caption for the image'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class WhatsAppSendTextTool extends BaseTool<typeof SendTextSchema> {
    constructor(private config: WhatsAppToolConfig = {}) {
        super({
            id: 'whatsapp_send_text',
            name: 'WhatsApp Send Text',
            description: 'Send a text message via WhatsApp Business Cloud API.',
            category: ToolCategory.API,
            parameters: SendTextSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SendTextSchema>, _ctx: ToolContext) {
        const { token, phoneNumberId } = getConfig(this.config);
        return whatsappPost(token, phoneNumberId, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: input.to,
            type: 'text',
            text: { preview_url: input.previewUrl ?? false, body: input.message },
        });
    }
}

export class WhatsAppSendTemplateTool extends BaseTool<typeof SendTemplateSchema> {
    constructor(private config: WhatsAppToolConfig = {}) {
        super({
            id: 'whatsapp_send_template',
            name: 'WhatsApp Send Template',
            description: 'Send a pre-approved WhatsApp message template.',
            category: ToolCategory.API,
            parameters: SendTemplateSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SendTemplateSchema>, _ctx: ToolContext) {
        const { token, phoneNumberId } = getConfig(this.config);
        return whatsappPost(token, phoneNumberId, {
            messaging_product: 'whatsapp',
            to: input.to,
            type: 'template',
            template: {
                name: input.templateName,
                language: { code: input.languageCode ?? 'en_US' },
                components: input.components ?? [],
            },
        });
    }
}

export class WhatsAppSendImageTool extends BaseTool<typeof SendImageSchema> {
    constructor(private config: WhatsAppToolConfig = {}) {
        super({
            id: 'whatsapp_send_image',
            name: 'WhatsApp Send Image',
            description: 'Send an image message via WhatsApp Business Cloud API.',
            category: ToolCategory.API,
            parameters: SendImageSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SendImageSchema>, _ctx: ToolContext) {
        const { token, phoneNumberId } = getConfig(this.config);
        return whatsappPost(token, phoneNumberId, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: input.to,
            type: 'image',
            image: { link: input.imageUrl, caption: input.caption },
        });
    }
}

export class WhatsAppToolkit {
    readonly sendText: WhatsAppSendTextTool;
    readonly sendTemplate: WhatsAppSendTemplateTool;
    readonly sendImage: WhatsAppSendImageTool;

    constructor(config: WhatsAppToolConfig = {}) {
        this.sendText = new WhatsAppSendTextTool(config);
        this.sendTemplate = new WhatsAppSendTemplateTool(config);
        this.sendImage = new WhatsAppSendImageTool(config);
    }

    getTools() {
        return [this.sendText, this.sendTemplate, this.sendImage];
    }
}
