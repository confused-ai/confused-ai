/**
 * Resend email tool — transactional email via Resend.
 * API key: https://resend.com/api-keys
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface ResendToolConfig {
    /** Resend API key (or RESEND_API_KEY env var) */
    apiKey?: string;
    /** Default from address */
    from?: string;
}

function getKey(config: ResendToolConfig): string {
    const key = config.apiKey ?? process.env.RESEND_API_KEY;
    if (!key) throw new Error('ResendTool requires RESEND_API_KEY');
    return key;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SendEmailSchema = z.object({
    to: z.union([z.string().email(), z.array(z.string().email())])
        .describe('Recipient email address(es)'),
    subject: z.string().describe('Email subject'),
    html: z.string().optional().describe('HTML body of the email'),
    text: z.string().optional().describe('Plain text body of the email'),
    from: z.string().optional().describe('Sender email address (overrides config default)'),
    cc: z.union([z.string().email(), z.array(z.string().email())]).optional()
        .describe('CC recipient(s)'),
    bcc: z.union([z.string().email(), z.array(z.string().email())]).optional()
        .describe('BCC recipient(s)'),
    replyTo: z.string().email().optional().describe('Reply-to address'),
    tags: z.array(z.object({ name: z.string(), value: z.string() })).optional()
        .describe('Custom tags for tracking'),
});

const GetEmailSchema = z.object({
    emailId: z.string().describe('Resend email ID to retrieve'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ResendSendEmailTool extends BaseTool<typeof SendEmailSchema, {
    id: string;
    from: string;
    to: string[];
    createdAt: string;
}> {
    constructor(private config: ResendToolConfig = {}) {
        super({
            id: 'resend_send_email',
            name: 'Resend Send Email',
            description: 'Send transactional emails via Resend. Supports HTML and plain text with CC/BCC.',
            category: ToolCategory.API,
            parameters: SendEmailSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SendEmailSchema>, _ctx: ToolContext) {
        const from = input.from ?? this.config.from ?? process.env.RESEND_FROM_EMAIL;
        if (!from) throw new Error('ResendSendEmailTool requires a from address');

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${getKey(this.config)}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from,
                to: Array.isArray(input.to) ? input.to : [input.to],
                subject: input.subject,
                html: input.html,
                text: input.text,
                cc: input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : undefined,
                bcc: input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : undefined,
                reply_to: input.replyTo,
                tags: input.tags,
            }),
        });
        if (!res.ok) throw new Error(`Resend API ${res.status}: ${await res.text()}`);
        return res.json() as Promise<{ id: string; from: string; to: string[]; createdAt: string }>;
    }
}

export class ResendGetEmailTool extends BaseTool<typeof GetEmailSchema> {
    constructor(private config: ResendToolConfig = {}) {
        super({
            id: 'resend_get_email',
            name: 'Resend Get Email',
            description: 'Retrieve the status and details of a sent email by its ID.',
            category: ToolCategory.API,
            parameters: GetEmailSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetEmailSchema>, _ctx: ToolContext) {
        const res = await fetch(`https://api.resend.com/emails/${input.emailId}`, {
            headers: { Authorization: `Bearer ${getKey(this.config)}` },
        });
        if (!res.ok) throw new Error(`Resend API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class ResendToolkit {
    readonly sendEmail: ResendSendEmailTool;
    readonly getEmail: ResendGetEmailTool;

    constructor(config: ResendToolConfig = {}) {
        this.sendEmail = new ResendSendEmailTool(config);
        this.getEmail = new ResendGetEmailTool(config);
    }

    getTools() {
        return [this.sendEmail, this.getEmail];
    }
}
