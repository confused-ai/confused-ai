/**
 * @confused-ai/tools — browser fetch tool.
 *
 * SRP  — this file owns only the browser-fetch tool.
 * DIP  — uses defineTool abstraction; no class inheritance.
 *
 * No external dependencies — uses built-in fetch().
 * SSRF protection: blocks private network ranges by default.
 */

import { z }          from 'zod';
import { defineTool } from './types.js';

// ── SSRF protection: private network block-list ────────────────────────────────
// O(1) check per hostname using a pre-compiled regex.

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\]|169\.254\.)/i;

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_RE.test(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal');
}

// ── HTML extraction helpers ────────────────────────────────────────────────────

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m?.[1] ? stripTags(m[1]).trim() : '';
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractLinks(html: string, baseUrl: string): string[] {
  const seen  = new Set<string>();
  const links: string[] = [];
  const re    = /<a[^>]+href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] ?? '').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    try {
      const resolved = new URL(href, baseUrl).href;
      if (!seen.has(resolved)) { seen.add(resolved); links.push(resolved); }
    } catch { /* skip unparseable URLs */ }
  }
  return links;
}

// ── Tool definition ────────────────────────────────────────────────────────────

const BrowserSchema = z.object({
  /** Target URL — must be http:// or https://. */
  url:          z.string().url(),
  /** Fetch timeout in ms. Default 30 000. Max 60 000. */
  timeout:      z.number().min(1_000).max(60_000).default(30_000),
  /** Include page links in result. Default true. */
  includeLinks: z.boolean().default(true),
});

export const browserTool = defineTool({
  name:        'browser_fetch',
  description: 'Fetch a web page and return its title, main text, and links. Blocks private network addresses.',
  parameters:  BrowserSchema,

  async execute({ url, timeout, includeLinks }) {
    // SSRF check — O(1)
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`[browser_fetch] Invalid URL: ${url}`);
    }
    if (isPrivateHost(parsed.hostname)) {
      throw new Error(`[browser_fetch] Blocked: ${parsed.hostname} is a private network address`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, timeout);

    try {
      const response = await fetch(url, {
        method:  'GET',
        headers: {
          'Accept':     'text/html, */*',
          'User-Agent': 'Mozilla/5.0 (compatible; ConfusedAI/1.0)',
        },
        signal: controller.signal,
      });

      const html        = await response.text();
      const title       = extractTitle(html);
      const textContent = stripTags(html).slice(0, 50_000); // cap at 50k chars
      const links       = includeLinks ? extractLinks(html, url) : [];

      return { url, title, textContent, links, status: response.status, ok: response.ok };
    } finally {
      clearTimeout(timer);
    }
  },
});
