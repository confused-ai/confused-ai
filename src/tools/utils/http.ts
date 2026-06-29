/**
 * HTTP client tool implementation
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';
// Reuse the single hardened SSRF guard (DNS resolution + IMDS/RFC-1918/CGNAT/
// IPv6-mapped blocks). A hostname-string-only check is insufficient: a public
// hostname can resolve to 169.254.169.254 / 10.x / 127.x and bypass it.
import { checkSsrf } from '../http-client.js';

/**
 * HTTP methods
 */
const HttpMethod = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
type HttpMethod = z.infer<typeof HttpMethod>;

/**
 * Parameters for HTTP tool
 */
const HttpToolParameters = z.object({
    url: z.string().url(),
    method: HttpMethod.default('GET'),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    timeout: z.number().min(1000).max(60000).optional(),
});

/**
 * HTTP response
 */
interface HttpResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
}

/**
 * HTTP tool configuration with network safety options
 */
export interface HttpToolConfig extends Partial<Omit<BaseToolConfig<typeof HttpToolParameters>, 'parameters'>> {
    /** Allowlist of hostnames. When set, only these hosts can be reached. */
    allowedHosts?: string[];
    /** Block requests to private/internal network addresses (default: true) */
    blockPrivateNetworks?: boolean;
}

/**
 * HTTP client tool for making web requests
 */
export class HttpClientTool extends BaseTool<typeof HttpToolParameters, HttpResponse> {
    private allowedHosts: string[] | undefined;
    private blockPrivateNetworks: boolean;

    constructor(config?: HttpToolConfig) {
        super({
            name: config?.name ?? 'http_request',
            description: config?.description ?? 'Make HTTP requests to external APIs and websites',
            parameters: HttpToolParameters,
            category: config?.category ?? ToolCategory.WEB,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 30000,
                ...config?.permissions,
            },
            ...(config?.version !== undefined && { version: config.version }),
            ...(config?.author !== undefined && { author: config.author }),
            ...(config?.tags !== undefined && { tags: config.tags }),
        });
        this.allowedHosts = config?.allowedHosts;
        this.blockPrivateNetworks = config?.blockPrivateNetworks ?? true;
    }

    /**
     * Validate URL against host restrictions
     */
    private async validateUrl(urlStr: string): Promise<string | null> {
        let parsed: URL;
        try {
            parsed = new URL(urlStr);
        } catch {
            return `Invalid URL: ${urlStr}`;
        }

        // Block private networks (SSRF protection) — resolves DNS and blocks
        // private/reserved/link-local IPs, not just hostname strings.
        if (this.blockPrivateNetworks) {
            const ssrfErr = await checkSsrf(parsed.hostname);
            if (ssrfErr) return ssrfErr;
        }

        // Check host allowlist
        if (this.allowedHosts && this.allowedHosts.length > 0) {
            const allowed = this.allowedHosts.some(h =>
                parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)
            );
            if (!allowed) {
                return `Host '${parsed.hostname}' is not in the allowed hosts list`;
            }
        }

        return null;
    }

    /**
     * Execute HTTP request
     */
    protected async performExecute(
        params: z.infer<typeof HttpToolParameters>,
        _context: ToolContext
    ): Promise<HttpResponse> {
        const { url, method, headers, body, timeout } = params;

        // Validate URL against SSRF and host restrictions
        const urlError = await this.validateUrl(url);
        if (urlError) {
            throw new Error(urlError);
        }

        const fetchOptions: RequestInit = {
            method,
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'AgentFramework/1.0',
                ...headers,
            },
        };

        if (body && method !== 'GET' && method !== 'HEAD') {
            if (typeof body === 'string') {
                fetchOptions.body = body;
            } else {
                fetchOptions.body = JSON.stringify(body);
                if (!fetchOptions.headers) {
                    fetchOptions.headers = {};
                }
                (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => { controller.abort(); }, timeout ?? 30000);

        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Convert headers
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            // Get response body
            const responseBody = await response.text();

            return {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: responseBody,
            };
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
}