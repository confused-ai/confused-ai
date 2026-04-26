/**
 * HTTP client tool implementation
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';

/** Patterns matching private/internal network addresses (SSRF protection) */
const PRIVATE_HOST_PATTERNS = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^0\.0\.0\.0$/,
    /^\[::1\]$/,
    /^169\.254\./,          // link-local
    /\.internal$/i,
    /\.local$/i,
];

/**
 * Validate a URL is not targeting private/internal networks (SSRF protection)
 */
function isPrivateHost(hostname: string): boolean {
    return PRIVATE_HOST_PATTERNS.some(p => p.test(hostname));
}

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
    private allowedHosts?: string[];
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
            version: config?.version,
            author: config?.author,
            tags: config?.tags,
        });
        this.allowedHosts = config?.allowedHosts;
        this.blockPrivateNetworks = config?.blockPrivateNetworks ?? true;
    }

    /**
     * Validate URL against host restrictions
     */
    private validateUrl(urlStr: string): string | null {
        let parsed: URL;
        try {
            parsed = new URL(urlStr);
        } catch {
            return `Invalid URL: ${urlStr}`;
        }

        // Block private networks (SSRF protection)
        if (this.blockPrivateNetworks && isPrivateHost(parsed.hostname)) {
            return `Blocked: ${parsed.hostname} is a private/internal network address`;
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
        const urlError = this.validateUrl(url);
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
                fetchOptions.headers = {
                    ...fetchOptions.headers,
                    'Content-Type': 'application/json',
                };
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout ?? 30000);

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