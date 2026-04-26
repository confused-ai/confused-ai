/**
 * Headless browser via Playwright (optional peer: `playwright`).
 *
 * Install: `npm install playwright` and `npx playwright install chromium` (or your CI image).
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import type { ToolContext } from '../core/types.js';
import { ToolCategory } from '../core/types.js';

const PageTitleSchema = z.object({
    url: z.string().url().describe('Page URL to open'),
    timeoutMs: z.number().int().min(1000).max(120_000).optional().default(30_000),
});

/**
 * Navigate with Chromium and return `document.title`.
 */
export class PlaywrightPageTitleTool extends BaseTool<typeof PageTitleSchema, { title: string; url: string }> {
    constructor() {
        super({
            id: 'playwright_page_title',
            name: 'playwright_page_title',
            description:
                'Open a URL in headless Chromium and return the page title (requires npm package `playwright`).',
            parameters: PageTitleSchema,
            category: ToolCategory.WEB,
            permissions: {
                allowNetwork: true,
                allowFileSystem: false,
                maxExecutionTimeMs: 120_000,
            },
        });
    }

    protected async performExecute(
        input: z.infer<typeof PageTitleSchema>,
        _ctx: ToolContext
    ): Promise<{ title: string; url: string }> {
        let playwright: typeof import('playwright');
        try {
            playwright = await import('playwright');
        } catch {
            throw new Error(
                'PlaywrightPageTitleTool requires the `playwright` package. Install: npm install playwright'
            );
        }
        const browser = await playwright.chromium.launch({ headless: true });
        try {
            const page = await browser.newPage();
            await page.goto(input.url, { timeout: input.timeoutMs, waitUntil: 'domcontentloaded' });
            const title = await page.title();
            return { title, url: input.url };
        } finally {
            await browser.close();
        }
    }
}
