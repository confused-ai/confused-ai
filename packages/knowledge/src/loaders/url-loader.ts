/**
 * URL Loader
 * ==========
 * Fetches a URL and strips HTML/boilerplate to produce a clean text `Document`.
 * No external deps required — uses the platform's native `fetch`.
 *
 * Usage:
 *   const docs = await loadUrl('https://example.com/blog/post-1');
 *   await engine.addDocuments(docs);
 *
 *   // With custom metadata
 *   const docs = await loadUrl('https://...', { metadata: { category: 'research' } });
 */

import { randomUUID } from 'node:crypto';
import type { Document } from '../types.js';

export interface UrlLoaderOptions {
    /**
     * Timeout in milliseconds for the HTTP request. Default: 10_000.
     */
    timeoutMs?: number;
    /**
     * User-agent string. Default: 'confused-ai-knowledge-loader/1.0'
     */
    userAgent?: string;
    /** Additional metadata to attach to the generated Document */
    metadata?: Record<string, unknown>;
}

/**
 * Fetch a URL and return a single-element `Document[]`.
 * Text is extracted from the HTML by stripping tags and collapsing whitespace.
 * For plain-text or JSON responses the raw body is used as-is.
 */
export async function loadUrl(
    url: string,
    options: UrlLoaderOptions = {},
): Promise<Document[]> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const userAgent = options.userAgent ?? 'confused-ai-knowledge-loader/1.0';
    const extraMeta = options.metadata ?? {};

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let text: string;
    let contentType = 'text/plain';
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': userAgent, Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.8' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
        contentType = res.headers.get('content-type') ?? 'text/plain';
        text = await res.text();
    } finally {
        clearTimeout(timer);
    }

    const content = contentType.includes('html') ? stripHtml(text) : text.trim();

    if (!content) return [];

    return [
        {
            id:      randomUUID(),
            content,
            metadata: { source: url, contentType, fetchedAt: new Date().toISOString(), ...extraMeta },
        },
    ];
}

// ── HTML stripping ────────────────────────────────────────────────────────────

/**
 * Minimal HTML-to-text: removes scripts/styles, strips tags, decodes common
 * HTML entities, and collapses whitespace. No external deps.
 */
function stripHtml(html: string): string {
    return html
        // Remove <script> and <style> blocks entirely
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        // Strip remaining HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Decode common HTML entities
        .replace(/&amp;/g,  '&')
        .replace(/&lt;/g,   '<')
        .replace(/&gt;/g,   '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g,  "'")
        .replace(/&nbsp;/g, ' ')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim();
}
