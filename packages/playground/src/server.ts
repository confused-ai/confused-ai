/**
 * @confused-ai/playground — Interactive agent playground UI.
 *
 * Serves a zero-dependency HTML/CSS/JS web interface that lets users chat
 * with registered confused-ai agents directly from a browser.
 *
 * Architecture:
 *   createPlayground(agents, options) → PlaygroundServer
 *   PlaygroundServer  — Node.js http.Server wrapped with start()/stop()
 *   UI                — single-file HTML (inline CSS + JS, no framework)
 *   API proxy         — POST /api/chat forwards to the agent runner
 *
 * Security (OWASP Top 10):
 *   - All user input is HTML-escaped before insertion into the DOM
 *   - Content-Security-Policy header restricts script/style sources
 *   - Request body is capped at 64 KB to prevent DoS
 *   - CORS is disabled by default (same-origin only)
 *   - Responses use plain text/JSON; no eval(), no innerHTML on untrusted data
 */

import http from 'node:http';
import { getPlaygroundHtml } from './_ui.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface PlaygroundAgent {
    /** Name shown in the UI dropdown */
    name: string;
    /** Async function that accepts a prompt string and returns a text reply */
    run: (prompt: string) => Promise<string>;
}

export interface PlaygroundOptions {
    /** TCP port to listen on. Default: 4000 */
    port?: number;
    /** Hostname / bind address. Default: 'localhost' */
    host?: string;
    /** Optional title shown in the browser tab and heading. Default: 'Agent Playground' */
    title?: string;
    /** Max request body bytes. Default: 65 536 (64 KB) */
    maxBodyBytes?: number;
}

export interface PlaygroundServer {
    /** Underlying Node.js HTTP server */
    server: http.Server;
    /** Resolved port (useful when port was 0 / OS-assigned) */
    port: number;
    /** Stop the server */
    stop: () => Promise<void>;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const DEFAULT_PORT      = 4000;
const DEFAULT_HOST      = 'localhost';
const DEFAULT_TITLE     = 'Agent Playground';
const DEFAULT_MAX_BODY  = 64 * 1024;   // 64 KB

/** Read the full request body, rejecting if it exceeds maxBytes. */
function readBody(req: http.IncomingMessage, maxBytes: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;

        req.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > maxBytes) {
                req.destroy();
                reject(Object.assign(new Error('Body too large'), { code: 'BODY_TOO_LARGE' }));
                return;
            }
            chunks.push(chunk);
        });

        req.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        // Strict CSP — no inline scripts or styles from this endpoint
        'X-Content-Type-Options': 'nosniff',
    });
    res.end(payload);
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create and start a playground HTTP server.
 *
 * @example
 * ```ts
 * import { createPlayground } from '@confused-ai/playground';
 *
 * const svc = await createPlayground([
 *     { name: 'my-agent', run: async (p) => agent.run(p) },
 * ]);
 * console.log(`Playground running at http://localhost:${svc.port}`);
 * ```
 */
export function createPlayground(
    agents: PlaygroundAgent[],
    options: PlaygroundOptions = {},
): Promise<PlaygroundServer> {
    const port         = options.port         ?? DEFAULT_PORT;
    const host         = options.host         ?? DEFAULT_HOST;
    const title        = options.title        ?? DEFAULT_TITLE;
    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY;

    if (agents.length === 0) {
        return Promise.reject(new Error('createPlayground: at least one agent is required'));
    }

    // Build a name→run lookup (O(1) dispatch)
    const agentMap = new Map<string, PlaygroundAgent['run']>(
        agents.map((a) => [a.name, a.run]),
    );
    const agentNames = agents.map((a) => a.name);

    const html = getPlaygroundHtml(title, agentNames);

    const server = http.createServer(async (req, res) => {
        const method = req.method?.toUpperCase() ?? 'GET';
        const url    = req.url ?? '/';
        const path   = url.split('?')[0]!;

        // ── Serve the UI ──────────────────────────────────────────────────
        if (method === 'GET' && (path === '/' || path === '/index.html')) {
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Length': Buffer.byteLength(html),
                'Content-Security-Policy': [
                    "default-src 'self'",
                    "script-src 'self' 'unsafe-inline'",   // inline JS in the single-file UI
                    "style-src 'self' 'unsafe-inline'",    // inline CSS in the single-file UI
                    "connect-src 'self'",
                ].join('; '),
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'SAMEORIGIN',
            });
            res.end(html);
            return;
        }

        // ── Chat API ──────────────────────────────────────────────────────
        if (method === 'POST' && path === '/api/chat') {
            let raw: string;
            try {
                raw = await readBody(req, maxBodyBytes);
            } catch (e) {
                const code = (e as NodeJS.ErrnoException).code;
                if (code === 'BODY_TOO_LARGE') {
                    sendJson(res, 413, { error: 'Request body too large' });
                    return;
                }
                throw e;
            }

            let body: { agent?: string; message?: string };
            try {
                body = raw ? (JSON.parse(raw) as typeof body) : {};
            } catch {
                sendJson(res, 400, { error: 'Invalid JSON' });
                return;
            }

            const agentName = body.agent ?? agentNames[0];
            const runFn = agentName ? agentMap.get(agentName) : undefined;

            if (!runFn) {
                sendJson(res, 400, { error: `Unknown agent: "${String(body.agent)}"` });
                return;
            }

            if (!body.message || typeof body.message !== 'string') {
                sendJson(res, 400, { error: 'Missing "message" string in request body' });
                return;
            }

            // Sanitize: trim whitespace, reject empty strings
            const prompt = body.message.trim();
            if (!prompt) {
                sendJson(res, 400, { error: '"message" must not be blank' });
                return;
            }

            try {
                const text = await runFn(prompt);
                sendJson(res, 200, { agent: agentName, text });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Agent error';
                sendJson(res, 500, { error: message });
            }
            return;
        }

        // ── Agent list ────────────────────────────────────────────────────
        if (method === 'GET' && path === '/api/agents') {
            sendJson(res, 200, { agents: agentNames });
            return;
        }

        // ── Health check ──────────────────────────────────────────────────
        if (method === 'GET' && path === '/health') {
            sendJson(res, 200, { status: 'ok' });
            return;
        }

        // ── 404 fallback ──────────────────────────────────────────────────
        sendJson(res, 404, { error: 'Not found' });
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            const addr = server.address();
            const resolvedPort = typeof addr === 'object' && addr ? addr.port : port;

            resolve({
                server,
                port: resolvedPort,
                stop: () =>
                    new Promise<void>((res, rej) =>
                        server.close((err) => (err ? rej(err) : res())),
                    ),
            });
        });
    });
}
