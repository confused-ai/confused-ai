/**
 * Minimal HTTP {@link A2AClient}: POST outbound messages to a broker-style endpoint.
 * Injects W3C `traceparent` / `tracestate` headers for distributed tracing across
 * multi-agent swarms when a {@link TraceContext} is provided.
 *
 * `subscribe` is a stub (poll or WebSocket must be implemented per deployment).
 */

import type { A2AClient, A2AMessage } from '../core/mcp-types.js';
import type { TraceContext } from '../../observability/trace-context.js';
import { injectTraceHeaders } from '../../observability/trace-context.js';

export interface HttpA2AClientConfig {
    /** Base URL of the A2A broker (e.g. https://api.example.com/a2a) */
    readonly baseUrl: string;
    readonly fetchImpl?: typeof fetch;
    /**
     * W3C Trace Context to propagate across agent-to-agent HTTP calls.
     * When provided, `traceparent` and `tracestate` headers are injected
     * into every outbound request, connecting spans into a single distributed trace.
     */
    readonly traceContext?: TraceContext;
}

function genId(): string {
    return `a2a-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Sends `POST {baseUrl}/send` with JSON body matching {@link A2AMessage} fields (without id/timestamp).
 * Expects JSON response with full message including `id` and `timestamp`.
 */
export class HttpA2AClient implements A2AClient {
    private readonly base: string;
    private readonly fetchImpl: typeof fetch;
    private readonly traceContext?: TraceContext;

    constructor(config: HttpA2AClientConfig) {
        this.base = config.baseUrl.replace(/\/$/, '');
        this.fetchImpl = config.fetchImpl ?? fetch;
        this.traceContext = config.traceContext;
    }

    async send(message: Omit<A2AMessage, 'id' | 'timestamp'>): Promise<A2AMessage> {
        const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        // Inject W3C traceparent/tracestate for distributed tracing
        const headers = this.traceContext
            ? injectTraceHeaders(baseHeaders, this.traceContext)
            : baseHeaders;

        const res = await this.fetchImpl(`${this.base}/send`, {
            method: 'POST',
            headers,
            body: JSON.stringify(message),
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`A2A send failed: ${res.status} ${t}`);
        }
        const data = (await res.json()) as A2AMessage;
        return {
            ...data,
            id: data.id ?? genId(),
            timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        };
    }

    subscribe(_agentId: string, _handler: (msg: A2AMessage) => void | Promise<void>): () => void {
        // Inbound delivery requires broker push (SSE/WS) or polling — not implemented here.
        return () => {
            /* noop */
        };
    }
}

export function createHttpA2AClient(config: HttpA2AClientConfig): A2AClient {
    return new HttpA2AClient(config);
}
