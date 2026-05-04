/**
 * @confused-ai/playground — unit tests.
 *
 * Tests cover:
 *  - GET /  → returns 200 HTML
 *  - GET /health → returns 200 JSON
 *  - GET /api/agents → lists agents
 *  - POST /api/chat → forwards prompt to agent run fn, returns text
 *  - POST /api/chat with bad JSON → 400
 *  - POST /api/chat with unknown agent → 400
 *  - POST /api/chat with missing message → 400
 *  - POST /api/chat with blank message → 400
 *  - POST /api/chat when agent throws → 500
 *  - GET /unknown → 404
 *  - createPlayground with empty agents → rejects
 *  - stop() closes the server
 */

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { createPlayground, type PlaygroundServer } from '@confused-ai/playground';

// ── HTTP helper ────────────────────────────────────────────────────────────────

interface HttpResponse {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
}

function httpRequest(
    port: number,
    opts: { method?: string; path?: string; body?: string; headers?: Record<string, string> },
): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: 'localhost',
                port,
                path:     opts.path   ?? '/',
                method:   opts.method ?? 'GET',
                headers:  opts.headers ?? {},
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () =>
                    resolve({
                        status:  res.statusCode ?? 0,
                        headers: res.headers as Record<string, string | string[] | undefined>,
                        body:    Buffer.concat(chunks).toString('utf8'),
                    }),
                );
                res.on('error', reject);
            },
        );
        req.on('error', reject);
        if (opts.body) req.write(opts.body);
        req.end();
    });
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

function echoAgent() {
    return {
        name: 'echo',
        run: async (prompt: string) => `echo: ${prompt}`,
    };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('@confused-ai/playground', () => {
    let svc: PlaygroundServer | undefined;

    afterEach(async () => {
        if (svc) {
            await svc.stop();
            svc = undefined;
        }
    });

    it('createPlayground with empty agents list rejects', async () => {
        await expect(createPlayground([])).rejects.toThrow('at least one agent');
    });

    describe('HTTP routes', () => {
        it('GET / returns 200 HTML', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            const res = await httpRequest(svc.port, { path: '/' });
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/html');
            expect(res.body).toContain('<!DOCTYPE html>');
            expect(res.body).toContain('Agent Playground');
        });

        it('GET / includes Content-Security-Policy header', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            const res = await httpRequest(svc.port, { path: '/' });
            expect(res.headers['content-security-policy']).toBeDefined();
        });

        it('GET /health returns 200 { status: "ok" }', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            const res = await httpRequest(svc.port, { path: '/health' });
            expect(res.status).toBe(200);
            const json = JSON.parse(res.body) as { status: string };
            expect(json.status).toBe('ok');
        });

        it('GET /api/agents returns agent names array', async () => {
            svc = await createPlayground(
                [echoAgent(), { name: 'other', run: async () => 'hi' }],
                { port: 0 },
            );
            const res = await httpRequest(svc.port, { path: '/api/agents' });
            expect(res.status).toBe(200);
            const json = JSON.parse(res.body) as { agents: string[] };
            expect(json.agents).toEqual(['echo', 'other']);
        });

        it('GET /unknown returns 404', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            const res = await httpRequest(svc.port, { path: '/no-such-path' });
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/chat', () => {
        function postChat(port: number, body: unknown): Promise<HttpResponse> {
            const raw = JSON.stringify(body);
            return httpRequest(port, {
                method: 'POST',
                path: '/api/chat',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': String(Buffer.byteLength(raw)),
                },
                body: raw,
            });
        }

        it('forwards prompt to agent and returns text', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            const res = await postChat(svc.port, { agent: 'echo', message: 'hello' });
            expect(res.status).toBe(200);
            const json = JSON.parse(res.body) as { agent: string; text: string };
            expect(json.agent).toBe('echo');
            expect(json.text).toBe('echo: hello');
        });

        it('defaults to first agent when "agent" field is omitted', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            const res = await postChat(svc.port, { message: 'ping' });
            expect(res.status).toBe(200);
            const json = JSON.parse(res.body) as { text: string };
            expect(json.text).toBe('echo: ping');
        });

        it('returns 400 for invalid JSON body', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            const raw = 'not-json{{{';
            const res = await httpRequest(svc.port, {
                method: 'POST',
                path: '/api/chat',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': String(Buffer.byteLength(raw)),
                },
                body: raw,
            });
            expect(res.status).toBe(400);
        });

        it('returns 400 for unknown agent', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            const res = await postChat(svc.port, { agent: 'ghost', message: 'hello' });
            expect(res.status).toBe(400);
            const json = JSON.parse(res.body) as { error: string };
            expect(json.error).toContain('ghost');
        });

        it('returns 400 when message is missing', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            const res = await postChat(svc.port, { agent: 'echo' });
            expect(res.status).toBe(400);
        });

        it('returns 400 when message is blank (whitespace only)', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            const res = await postChat(svc.port, { agent: 'echo', message: '   ' });
            expect(res.status).toBe(400);
        });

        it('returns 500 when agent run() throws', async () => {
            svc = await createPlayground(
                [{ name: 'boom', run: async () => { throw new Error('boom!'); } }],
                { port: 0 },
            );
            const res = await postChat(svc.port, { agent: 'boom', message: 'trigger error' });
            expect(res.status).toBe(500);
            const json = JSON.parse(res.body) as { error: string };
            expect(json.error).toBe('boom!');
        });
    });

    describe('custom options', () => {
        it('respects custom title in the HTML', async () => {
            svc = await createPlayground([echoAgent()], { port: 0, title: 'My Custom Playground' });
            const res = await httpRequest(svc.port, { path: '/' });
            expect(res.body).toContain('My Custom Playground');
        });

        it('resolves the OS-assigned port when port is 0', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            expect(svc.port).toBeGreaterThan(0);
        });
    });

    describe('stop()', () => {
        it('stop() resolves and closes the server', async () => {
            svc = await createPlayground([echoAgent()], { port: 0 });
            await expect(svc.stop()).resolves.toBeUndefined();
            svc = undefined;
        });
    });
});
