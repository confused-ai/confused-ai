/**
 * Browserbase tools — run headless browsers in the cloud via Browserbase API.
 * API docs: https://docs.browserbase.com/api-reference
 * API key: https://www.browserbase.com/settings
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface BrowserbaseToolConfig {
    /** Browserbase API key (or BROWSERBASE_API_KEY env var) */
    apiKey?: string;
    /** Browserbase project ID (or BROWSERBASE_PROJECT_ID env var) */
    projectId?: string;
}

function getAuth(config: BrowserbaseToolConfig): { apiKey: string; projectId: string } {
    const apiKey = config.apiKey ?? process.env['BROWSERBASE_API_KEY'];
    const projectId = config.projectId ?? process.env['BROWSERBASE_PROJECT_ID'];
    if (!apiKey) throw new Error('BrowserbaseTools require BROWSERBASE_API_KEY');
    if (!projectId) throw new Error('BrowserbaseTools require BROWSERBASE_PROJECT_ID');
    return { apiKey, projectId };
}

// ── Schemas ────────────────────────────────────────────────────────────────

const CreateSessionSchema = z.object({
    browserSettings: z.object({
        viewport: z.object({
            width: z.number().int().optional().default(1920),
            height: z.number().int().optional().default(1080),
        }).optional(),
        stealth: z.boolean().optional().default(true).describe('Enable stealth mode to avoid bot detection'),
    }).optional(),
    timeout: z.number().int().optional().default(300).describe('Session timeout in seconds'),
    region: z.string().optional().default('us-east-1').describe('Cloud region for the browser'),
});

const GetSessionSchema = z.object({
    sessionId: z.string().describe('Browserbase session ID'),
});

const ScreenshotSchema = z.object({
    url: z.string().url().describe('URL to capture a screenshot of'),
    fullPage: z.boolean().optional().default(false).describe('Capture full-page screenshot'),
    width: z.number().int().optional().default(1280),
    height: z.number().int().optional().default(800),
    waitFor: z.number().int().optional().default(2000).describe('Wait time in ms before screenshot'),
});

const ExtractPageSchema = z.object({
    url: z.string().url().describe('URL to extract content from'),
    waitFor: z.number().int().optional().default(2000).describe('Wait time in ms before extraction'),
    selector: z.string().optional().describe('CSS selector to wait for before extracting'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class BrowserbaseCreateSessionTool extends BaseTool<typeof CreateSessionSchema, {
    id: string;
    status: string;
    connectUrl: string;
    replayUrl: string;
}> {
    constructor(private config: BrowserbaseToolConfig = {}) {
        super({
            id: 'browserbase_create_session',
            name: 'Browserbase Create Session',
            description: 'Create a new headless browser session on Browserbase.',
            category: ToolCategory.WEB,
            parameters: CreateSessionSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateSessionSchema>, _ctx: ToolContext) {
        const { apiKey, projectId } = getAuth(this.config);
        const res = await fetch('https://www.browserbase.com/v1/sessions', {
            method: 'POST',
            headers: { 'X-BB-API-Key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId,
                browserSettings: {
                    viewport: input.browserSettings?.viewport ?? { width: 1920, height: 1080 },
                    stealth: input.browserSettings?.stealth ?? true,
                },
                timeout: input.timeout ?? 300,
                region: input.region ?? 'us-east-1',
            }),
        });
        if (!res.ok) throw new Error(`Browserbase API ${res.status}: ${await res.text()}`);
        return res.json() as Promise<{ id: string; status: string; connectUrl: string; replayUrl: string }>;
    }
}

export class BrowserbaseGetSessionTool extends BaseTool<typeof GetSessionSchema> {
    constructor(private config: BrowserbaseToolConfig = {}) {
        super({
            id: 'browserbase_get_session',
            name: 'Browserbase Get Session',
            description: 'Get details and status of a Browserbase browser session.',
            category: ToolCategory.WEB,
            parameters: GetSessionSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetSessionSchema>, _ctx: ToolContext) {
        const { apiKey } = getAuth(this.config);
        const res = await fetch(`https://www.browserbase.com/v1/sessions/${input.sessionId}`, {
            headers: { 'X-BB-API-Key': apiKey },
        });
        if (!res.ok) throw new Error(`Browserbase API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class BrowserbaseScreenshotTool extends BaseTool<typeof ScreenshotSchema, {
    sessionId: string;
    screenshotBase64: string;
    url: string;
}> {
    constructor(private config: BrowserbaseToolConfig = {}) {
        super({
            id: 'browserbase_screenshot',
            name: 'Browserbase Screenshot',
            description: 'Capture a screenshot of a web page using a cloud browser.',
            category: ToolCategory.WEB,
            parameters: ScreenshotSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 60000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ScreenshotSchema>, _ctx: ToolContext) {
        const { apiKey, projectId } = getAuth(this.config);
        // Create a session
        const sessionRes = await fetch('https://www.browserbase.com/v1/sessions', {
            method: 'POST',
            headers: { 'X-BB-API-Key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, browserSettings: { viewport: { width: input.width ?? 1280, height: input.height ?? 800 } } }),
        });
        if (!sessionRes.ok) throw new Error(`Browserbase API ${sessionRes.status}: ${await sessionRes.text()}`);
        const session = await sessionRes.json() as { id: string };

        // Request screenshot
        const screenshotRes = await fetch(`https://www.browserbase.com/v1/sessions/${session.id}/screenshot`, {
            method: 'POST',
            headers: { 'X-BB-API-Key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: input.url,
                fullPage: input.fullPage ?? false,
                waitFor: input.waitFor ?? 2000,
            }),
        });
        if (!screenshotRes.ok) throw new Error(`Browserbase API ${screenshotRes.status}: ${await screenshotRes.text()}`);
        const buffer = await screenshotRes.arrayBuffer();
        return {
            sessionId: session.id,
            screenshotBase64: Buffer.from(buffer).toString('base64'),
            url: input.url,
        };
    }
}

export class BrowserbaseExtractPageTool extends BaseTool<typeof ExtractPageSchema, {
    url: string;
    title: string;
    content: string;
    links: Array<{ text: string; href: string }>;
}> {
    constructor(private config: BrowserbaseToolConfig = {}) {
        super({
            id: 'browserbase_extract_page',
            name: 'Browserbase Extract Page',
            description: 'Extract content from a JavaScript-heavy web page using a real browser.',
            category: ToolCategory.WEB,
            parameters: ExtractPageSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 90000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ExtractPageSchema>, _ctx: ToolContext) {
        const { apiKey, projectId } = getAuth(this.config);
        const sessionRes = await fetch('https://www.browserbase.com/v1/sessions', {
            method: 'POST',
            headers: { 'X-BB-API-Key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId }),
        });
        if (!sessionRes.ok) throw new Error(`Browserbase API ${sessionRes.status}: ${await sessionRes.text()}`);
        const session = await sessionRes.json() as { id: string };

        const extractRes = await fetch(`https://www.browserbase.com/v1/sessions/${session.id}/navigate`, {
            method: 'POST',
            headers: { 'X-BB-API-Key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: input.url,
                waitFor: input.waitFor ?? 2000,
                waitForSelector: input.selector,
            }),
        });
        if (!extractRes.ok) throw new Error(`Browserbase API ${extractRes.status}: ${await extractRes.text()}`);
        const data = await extractRes.json() as {
            title?: string;
            content?: string;
            links?: Array<{ text: string; href: string }>;
        };
        return {
            url: input.url,
            title: data.title ?? '',
            content: data.content ?? '',
            links: data.links ?? [],
        };
    }
}

export class BrowserbaseToolkit {
    readonly createSession: BrowserbaseCreateSessionTool;
    readonly getSession: BrowserbaseGetSessionTool;
    readonly screenshot: BrowserbaseScreenshotTool;
    readonly extractPage: BrowserbaseExtractPageTool;

    constructor(config: BrowserbaseToolConfig = {}) {
        this.createSession = new BrowserbaseCreateSessionTool(config);
        this.getSession = new BrowserbaseGetSessionTool(config);
        this.screenshot = new BrowserbaseScreenshotTool(config);
        this.extractPage = new BrowserbaseExtractPageTool(config);
    }

    getTools() {
        return [this.createSession, this.getSession, this.screenshot, this.extractPage];
    }
}
