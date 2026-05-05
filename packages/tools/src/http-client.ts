/**
 * @confused-ai/tools — built-in HTTP client tool.
 *
 * SRP  — this file owns only the HTTP tool.
 * DIP  — returns the Tool interface; no class inheritance.
 * DS   — uses built-in fetch (zero deps). URL validation is O(1).
 *
 * SSRF protection is enabled by default. The following hosts are always blocked:
 *   - loopback (127.x, ::1, localhost)
 *   - private RFC-1918 ranges (10.x, 172.16-31.x, 192.168.x)
 *   - link-local / cloud metadata (169.254.x — covers AWS/GCP/Azure IMDS)
 *   - .internal / .local hostnames
 *
 * Override with `allowedDomains` / `blockedDomains` options.
 */

import { z } from 'zod';
import { defineTool } from './types.js';

// ── SSRF block-list (checked on every request) ────────────────────────────
const SSRF_BLOCKED_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,       // AWS/GCP/Azure instance metadata service (IMDS)
  /^100\.64\./,        // Carrier-grade NAT (RFC 6598) — may reach internal services
  /\.internal$/i,
  /\.local$/i,
];

function isSsrfBlocked(hostname: string): boolean {
  return SSRF_BLOCKED_PATTERNS.some(p => p.test(hostname));
}

// ── Schema ─────────────────────────────────────────────────────────────────
const HttpInputSchema = z.object({
  url:     z.string().url(),
  method:  z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body:    z.string().optional(),
  /** Timeout in ms. Default 30 000. */
  timeout: z.number().int().positive().max(120_000).optional(),
});

// ── Options ────────────────────────────────────────────────────────────────
export interface HttpClientToolOptions {
  /**
   * Explicit domain allowlist.  When set, only hostnames that equal or are a
   * subdomain of a listed domain are permitted.
   * Example: `['api.github.com', 'openai.com']`
   */
  allowedDomains?: string[];
  /**
   * Additional hostnames/patterns to block on top of the built-in SSRF list.
   * Example: `['internal-proxy.corp']`
   */
  blockedDomains?: string[];
  /**
   * Disable the built-in SSRF block-list.
   * **Only set this to `true` in fully-trusted, isolated environments.**
   * @default false
   */
  disableSsrfProtection?: boolean;
}

// ── Factory ────────────────────────────────────────────────────────────────
/**
 * Create an HTTP client tool with configurable SSRF protection.
 *
 * @example
 * // Default — SSRF protection on, any public URL allowed
 * const http = createHttpClientTool();
 *
 * @example
 * // Domain allowlist — only GitHub and OpenAI APIs reachable
 * const http = createHttpClientTool({ allowedDomains: ['api.github.com', 'api.openai.com'] });
 *
 * @example
 * // Block an extra domain on top of built-in SSRF list
 * const http = createHttpClientTool({ blockedDomains: ['corp-proxy.internal.example.com'] });
 */
export function createHttpClientTool(options?: HttpClientToolOptions) {
  const { allowedDomains, blockedDomains = [], disableSsrfProtection = false } = options ?? {};

  function validateUrl(rawUrl: string): string | null {
    let parsed: URL;
    try { parsed = new URL(rawUrl); } catch { return `Invalid URL: ${rawUrl}`; }

    const host = parsed.hostname.toLowerCase();

    // SSRF block-list
    if (!disableSsrfProtection && isSsrfBlocked(host)) {
      return `SSRF blocked: requests to "${host}" are not permitted. ` +
        'This host matches a private/internal network range.';
    }

    // Extra blocked domains
    if (blockedDomains.some(d => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))) {
      return `Blocked: "${host}" is on the blocked-domains list.`;
    }

    // Domain allowlist (if configured)
    if (allowedDomains && allowedDomains.length > 0) {
      const permitted = allowedDomains.some(
        d => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`)
      );
      if (!permitted) {
        return `"${host}" is not in the allowed-domains list: [${allowedDomains.join(', ')}].`;
      }
    }

    return null;
  }

  return defineTool({
    name:        'http_request',
    description: 'Make an HTTP request to a URL. Returns the response body as text. SSRF protection blocks private/internal addresses by default.',
    parameters:  HttpInputSchema,
    async execute({ url, method, headers, body, timeout = 30_000 }) {
      const err = validateUrl(url);
      if (err) throw new Error(err);

      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, timeout);

      try {
        const requestInit: RequestInit = {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          signal:  controller.signal,
          ...(method !== 'GET' && method !== 'HEAD' && body !== undefined && { body }),
        };

        const response = await fetch(url, requestInit);
        const text = await response.text();
        return {
          status:  response.status,
          ok:      response.ok,
          headers: Object.fromEntries(response.headers.entries()),
          body:    text,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  });
}

/**
 * Pre-built HTTP client with default SSRF protection and no domain restrictions.
 * For production with LLM-controlled agents, prefer `createHttpClientTool({ allowedDomains: [...] })`.
 */
export const httpClient = createHttpClientTool();
