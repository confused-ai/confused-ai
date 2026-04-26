import http from 'node:http';
import { describe, expect, it, afterEach } from 'vitest';
import type { CreateAgentResult } from '../src/create-agent/types.js';
import type { Message } from '../src/providers/types.js';
import { createHttpService, listenService, getRuntimeOpenApiJson } from '../src/runtime/index.js';

function request(
    port: number,
    opts: { method: string; path: string; headers?: http.OutgoingHttpHeaders; body?: string }
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { hostname: '127.0.0.1', port, path: opts.path, method: opts.method, headers: opts.headers },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString('utf8'),
                    })
                );
                res.on('error', reject);
            }
        );
        req.on('error', reject);
        if (opts.body) req.write(opts.body);
        req.end();
    });
}

const mockAgent = (): CreateAgentResult => ({
    name: 'mock',
    instructions: 'test',
    async run(prompt, opts) {
        opts?.onChunk?.('hel');
        opts?.onChunk?.('lo');
        return {
            text: 'hello',
            markdown: { name: 'response.md', content: 'hello', mimeType: 'text/markdown' as const, type: 'markdown' as const },
            steps: 1,
            finishReason: 'stop',
            messages: [],
        };
    },
    async createSession() {
        return 'session-mock';
    },
    async getSessionMessages(_sessionId: string): Promise<Message[]> {
        return [];
    },
});

describe('createHttpService', () => {
    let svc: Awaited<ReturnType<typeof listenService>> | undefined;

    afterEach(async () => {
        if (svc) {
            await svc.close();
            svc = undefined;
        }
    });

    it('serves OpenAPI and lists /v1/chat', async () => {
        const spec = getRuntimeOpenApiJson();
        const paths = (spec as { paths: Record<string, unknown> }).paths;
        expect(paths).toHaveProperty('/v1/chat');
        // Use direct property access to avoid bun's path-separator interpretation
        expect(paths['/v1/openapi.json']).toBeDefined();

        const s = createHttpService({ agents: { a: mockAgent() }, tracing: false });
        svc = await listenService(s, 0);
        const port = svc.port;
        const res = await request(port, { method: 'GET', path: '/v1/openapi.json' });
        expect(res.status).toBe(200);
        const json = JSON.parse(res.body) as { paths: Record<string, unknown> };
        expect(json.paths['/v1/health']).toBeDefined();
    });

    it('streams chat as SSE when stream: true', async () => {
        const s = createHttpService({ agents: { a: mockAgent() }, tracing: false });
        svc = await listenService(s, 0);
        const port = svc.port;
        const res = await request(port, {
            method: 'POST',
            path: '/v1/chat',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'hi', agent: 'a', stream: true }),
        });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/event-stream/);
        const lines = res.body.split('\n').filter((l) => l.startsWith('data: '));
        const events = lines.map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
        const chunks = events.filter((e) => e.type === 'chunk');
        expect(chunks.length).toBeGreaterThanOrEqual(1);
        expect((chunks[0] as { text: string }).text).toBeDefined();
        const done = events.find((e) => e.type === 'done') as
            | { type: string; text: string; sessionId: string; finishReason: string }
            | undefined;
        expect(done?.text).toBe('hello');
        expect(done?.finishReason).toBe('stop');
    });
});
