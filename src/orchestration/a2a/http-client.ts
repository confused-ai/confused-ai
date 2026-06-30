/**
 * Minimal HTTP {@link A2AClient}: POST outbound messages to a broker-style endpoint.
 * Injects W3C `traceparent` / `tracestate` headers for distributed tracing across
 * multi-agent swarms when a {@link TraceContext} is provided.
 *
 * Outbound only: `subscribe` throws, because inbound delivery requires a broker
 * push transport (SSE/WebSocket) or polling that this minimal client does not
 * implement. Use a transport-specific A2A client for inbound messages.
 */

import type { IA2AClient, A2AMessage } from './types.js';
import type { TraceContext } from '../_trace-context.js';
import { injectTraceHeaders } from '../_trace-context.js';
import { newId } from '../../contracts/index.js';

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
    return newId('a2a');
}

/**
 * Sends `POST {baseUrl}/send` with JSON body matching {@link A2AMessage} fields (without id/timestamp).
 * Expects JSON response with full message including `id` and `timestamp`.
 */
export class HttpA2AClient implements IA2AClient {
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
        // Fail loud: a silent no-op would drop every inbound message while looking
        // like a working subscription. Inbound delivery needs SSE/WebSocket/polling.
        throw new Error(
            'HttpA2AClient is outbound-only: subscribe() is not supported. Inbound A2A ' +
            'message delivery requires a broker push transport (SSE/WebSocket) or polling. ' +
            'Use a transport-specific A2A client to receive messages.',
        );
    }
}

export function createHttpA2AClient(config: HttpA2AClientConfig): IA2AClient {
    return new HttpA2AClient(config);
}
