import http from 'node:http';
import { describe, expect, it, afterEach } from 'vitest';
import type { CreateAgentResult } from '../src/create-agent/types.js';
import type { Message } from '../src/providers/types.js';
import { createHttpService, listenService, getRuntimeOpenApiJson } from '../src/runtime/index.js';
import { canListenOnLoopback } from './support/network.js';

const CAN_LISTEN_ON_LOOPBACK = await canListenOnLoopback();

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

function echoAgent(onRun?: (prompt: string) => void): CreateAgentResult {
    return {
        name: 'echo',
        instructions: 'echo',
        async run(prompt) {
            onRun?.(prompt);
            return {
                text: prompt,
                markdown: { name: 'response.md', content: prompt, mimeType: 'text/markdown' as const, type: 'markdown' as const },
                steps: 1,
                finishReason: 'stop',
                messages: [],
            };
        },
        async createSession() {
            return 'session-echo';
        },
        async getSessionMessages(_sessionId: string): Promise<Message[]> {
            return [];
        },
    };
}

describe.skipIf(!CAN_LISTEN_ON_LOOPBACK)('createHttpService', () => {
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

        const s = createHttpService({ agents: { a: mockAgent() }, tracing: false, host: '127.0.0.1' });
        svc = await listenService(s, 0);
        const port = svc.port;
        const res = await request(port, { method: 'GET', path: '/v1/openapi.json' });
        expect(res.status).toBe(200);
        const json = JSON.parse(res.body) as { paths: Record<string, unknown> };
        expect(json.paths['/v1/health']).toBeDefined();
    });

    it('streams chat as SSE when stream: true', async () => {
        const s = createHttpService({ agents: { a: mockAgent() }, tracing: false, host: '127.0.0.1' });
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

    it('replays only the same idempotent request scope', async () => {
        const seen: string[] = [];
        const s = createHttpService({
            agents: { a: echoAgent((prompt) => { seen.push(prompt); }) },
            tracing: false,
            idempotency: {},
            host: '127.0.0.1',
        });
        svc = await listenService(s, 0);
        const port = svc.port;

        const first = await request(port, {
            method: 'POST',
            path: '/v1/chat',
            headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': 'same-key' },
            body: JSON.stringify({ message: 'first', agent: 'a' }),
        });
        const replay = await request(port, {
            method: 'POST',
            path: '/v1/chat',
            headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': 'same-key' },
            body: JSON.stringify({ message: 'first', agent: 'a' }),
        });
        const different = await request(port, {
            method: 'POST',
            path: '/v1/chat',
            headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': 'same-key' },
            body: JSON.stringify({ message: 'second', agent: 'a' }),
        });

        expect(first.status).toBe(200);
        expect(replay.headers['x-idempotency-replay']).toBe('true');
        expect(JSON.parse(replay.body) as { text: string }).toEqual(JSON.parse(first.body) as { text: string });
        expect(JSON.parse(different.body) as { text: string }).toMatchObject({ text: 'second' });
        expect(seen).toEqual(['first', 'second']);
    });

    it('ignores spoofed x-forwarded-for by default for rate limiting and audit', async () => {
        const seenKeys: string[] = [];
        const auditEntries: Array<{ ip?: string }> = [];
        const s = createHttpService({
            agents: { a: echoAgent() },
            tracing: true,
            host: '127.0.0.1',
            rateLimit: { check(key) { seenKeys.push(key); } },
            auditStore: { async append(entry) { auditEntries.push({ ip: entry.ip }); } },
        });
        svc = await listenService(s, 0);
        const port = svc.port;

        const res = await request(port, {
            method: 'POST',
            path: '/v1/chat',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.10' },
            body: JSON.stringify({ message: 'hi', agent: 'a' }),
        });

        expect(res.status).toBe(200);
        expect(seenKeys[0]).not.toBe('203.0.113.10');
        expect(seenKeys[0]).toMatch(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
        expect(auditEntries[0]?.ip).toMatch(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
    });

    it('uses x-forwarded-for only when trustProxy is enabled', async () => {
        const seenKeys: string[] = [];
        const auditEntries: Array<{ ip?: string }> = [];
        const s = createHttpService({
            agents: { a: echoAgent() },
            tracing: true,
            trustProxy: true,
            host: '127.0.0.1',
            rateLimit: { check(key) { seenKeys.push(key); } },
            auditStore: { async append(entry) { auditEntries.push({ ip: entry.ip }); } },
        });
        svc = await listenService(s, 0);
        const port = svc.port;

        const res = await request(port, {
            method: 'POST',
            path: '/v1/chat',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.10, 127.0.0.1' },
            body: JSON.stringify({ message: 'hi', agent: 'a' }),
        });

        expect(res.status).toBe(200);
        expect(seenKeys[0]).toBe('203.0.113.10');
        expect(auditEntries[0]?.ip).toBe('203.0.113.10');
    });
});
