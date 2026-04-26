import http from 'node:http';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { CreateAgentResult } from '../create-agent.js';
import type { CreateHttpServiceOptions, HttpService, RequestAuditEntry } from './types.js';
import { getRuntimeOpenApiJson } from './openapi.js';
import { createAuthMiddleware } from './auth.js';
import type { AuditEntry } from '../production/audit-store.js';
import type { IdempotencyStore } from '../production/idempotency.js';
import { InMemoryIdempotencyStore } from '../production/idempotency.js';
import { attachWebSocketTransport } from './ws-transport.js';
import { createAdminHandler, type AdminStats } from './admin.js';import { extractTraceContext } from '../observability/trace-context.js';
const CORS_HEADERS =
    'Content-Type, Accept, X-Session-Id, X-User-Id, X-Request-Id';

function normalizeAgents(
    agents: CreateHttpServiceOptions['agents']
): Record<string, CreateAgentResult> {
    if (Array.isArray(agents)) {
        const out: Record<string, CreateAgentResult> = {};
        for (const { name, agent } of agents) {
            out[name] = agent;
        }
        return out;
    }
    return agents;
}

function sendJson(
    res: http.ServerResponse,
    status: number,
    body: unknown,
    cors?: string,
    requestId?: string
): void {
    if (cors) {
        res.setHeader('Access-Control-Allow-Origin', cors);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS);
    }
    if (requestId) {
        res.setHeader('X-Request-ID', requestId);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(status);
    res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage, maxBytes = 1_048_576): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        req.on('data', (c: Buffer | string) => {
            const chunk = Buffer.isBuffer(c) ? c : Buffer.from(c);
            totalBytes += chunk.byteLength;
            if (totalBytes > maxBytes) {
                req.destroy();
                const err = Object.assign(new Error('Request body too large'), { code: 'BODY_TOO_LARGE' });
                reject(err);
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

const AUDIT_MAX = 500;

/**
 * Stateless, session-scoped HTTP API for production deployments.
 * Exposes health, OpenAPI, agent listing, and chat (JSON or SSE). Horizontally
 * safe when the session store and stores behind agents are shared (e.g. Redis/DB).
 */
export function createHttpService(
    options: CreateHttpServiceOptions,
    port = Number(process.env.PORT) || 8787
): HttpService {
    const map = normalizeAgents(options.agents);
    // Legacy in-memory audit (used when no persistent auditStore is provided)
    const audit: RequestAuditEntry[] = [];
    const tracing = options.tracing ?? true;
    const cors = options.cors;
    const maxBodyBytes = options.maxBodyBytes ?? 1_048_576; // 1 MB default
    const authMiddleware = options.auth ? createAuthMiddleware(options.auth) : null;

    // Idempotency store — defaults to in-memory if not provided
    const idempotencyOpts = options.idempotency;
    const idempotencyStore: IdempotencyStore | null = idempotencyOpts
        ? (idempotencyOpts.store ?? new InMemoryIdempotencyStore())
        : null;
    const idempotencyTtlMs = idempotencyOpts?.ttlMs ?? 86_400_000; // 24 hours
    const idempotencyHeader = idempotencyOpts?.headerName?.toLowerCase() ?? 'x-idempotency-key';

    // Persistent audit store (optional — falls back to in-memory array)
    const auditStore = options.auditStore ?? null;

    // HITL approval store (optional)
    const approvalStore = options.approvalStore ?? null;

    // Admin stats (shared mutable counter — incremented per request)
    const adminStats: AdminStats = { totalRequests: 0, totalErrors: 0, totalTokens: 0 };
    const serverStartedAt = new Date();

    // Admin API handler (null when disabled)
    const adminHandler = options.adminApi?.enabled
        ? createAdminHandler({
              options: {
                  ...options.adminApi,
                  auditStore: options.adminApi?.auditStore ?? auditStore ?? undefined,
              },
              agents: map,
              auditRingBuffer: () => audit,
              startedAt: serverStartedAt,
              stats: adminStats,
          })
        : null;

    const server = http.createServer(async (req, res) => {
        const path = (req.url ?? '/').split('?')[0] ?? '/';
        const method = req.method ?? 'GET';
        // Assign a correlation ID for every request — echo client-supplied or generate one
        const rid = (req.headers['x-request-id'] as string | undefined) || randomUUID();
        res.setHeader('X-Request-ID', rid);

        if (cors && method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', cors);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS);
            res.writeHead(204);
            res.end();
            return;
        }

        // Run auth middleware (skips public paths internally)
        let authIdentity: string | undefined;
        if (authMiddleware) {
            const ctx = await authMiddleware(req, res);
            if (!ctx) return; // middleware already wrote 401
            authIdentity = ctx.identity;
            // Attach auth context to request for downstream use
            (req as NodeJS.Dict<unknown> & IncomingMessage)['authContext'] = ctx;
        }

        // HTTP-level rate limiting: key by identity → forwarded-for → remote IP
        if (options.rateLimit && path !== '/health' && path !== '/v1/health') {
            const rateLimitKey =
                authIdentity ||
                (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
                req.socket.remoteAddress ||
                'unknown';
            try {
                await options.rateLimit.check(rateLimitKey);
            } catch {
                sendJson(res, 429, { error: 'Too many requests' }, cors, rid);
                return;
            }
        }

        // Admin API — dispatch before main routes
        if (adminHandler) {
            const handled = await adminHandler(req, res, path, cors);
            if (handled) {
                adminStats.totalRequests++;
                return;
            }
        }

        adminStats.totalRequests++;

        const pushAudit = (status: number, extra: Partial<RequestAuditEntry> = {}): void => {
            if (!tracing) return;
            const id = extra.id ?? randomUUID();
            const entry: RequestAuditEntry = {
                id,
                at: new Date().toISOString(),
                method,
                path,
                status,
                ...extra,
            };
            // Persist to durable store if provided
            if (auditStore) {
                const auditEntry: AuditEntry = {
                    id: entry.id,
                    timestamp: entry.at,
                    method: entry.method,
                    path: entry.path,
                    status: entry.status,
                    agentName: entry.agent,
                    sessionId: entry.sessionId,
                    ip: (req.headers['x-forwarded-for'] as string | undefined) || (req.socket?.remoteAddress),
                };
                auditStore.append(auditEntry).catch(() => { /* fire-and-forget */ });
            } else {
                // Fallback: in-memory ring buffer
                audit.push(entry);
                if (audit.length > AUDIT_MAX) audit.shift();
            }
        };

        try {
            if (method === 'GET' && (path === '/health' || path === '/v1/health')) {
                sendJson(
                    res,
                    200,
                    { status: 'ok', service: 'confused-ai', time: new Date().toISOString() },
                    cors,
                    rid
                );
                pushAudit(200, { id: rid });
                return;
            }

            if (method === 'GET' && (path === '/v1/agents' || path === '/agents')) {
                const list = Object.keys(map).map((name) => ({
                    name,
                    title: map[name]!.name,
                }));
                sendJson(res, 200, { agents: list }, cors, rid);
                pushAudit(200, { id: rid });
                return;
            }

            if (method === 'GET' && (path === '/v1/audit' || path === '/audit') && tracing) {
                sendJson(res, 200, { entries: audit }, cors, rid);
                pushAudit(200, { id: rid });
                return;
            }

            if (method === 'GET' && (path === '/v1/openapi.json' || path === '/openapi.json')) {
                sendJson(res, 200, getRuntimeOpenApiJson(), cors, rid);
                pushAudit(200, { id: rid });
                return;
            }

            if (method === 'POST' && (path === '/v1/chat' || path === '/chat')) {
                let raw: string;
                try {
                    raw = await readBody(req, maxBodyBytes);
                } catch (e) {
                    const code = (e as NodeJS.ErrnoException).code;
                    if (code === 'BODY_TOO_LARGE') {
                        sendJson(res, 413, { error: 'Request body too large' }, cors);
                        pushAudit(413);
                        return;
                    }
                    throw e;
                }
                let body: {
                    message?: string;
                    agent?: string;
                    sessionId?: string;
                    userId?: string;
                    stream?: boolean;
                };
                try {
                    body = raw ? (JSON.parse(raw) as typeof body) : {};
                } catch {
                    sendJson(res, 400, { error: 'Invalid JSON' }, cors);
                    pushAudit(400);
                    return;
                }

                const agentName = body.agent ?? Object.keys(map)[0];
                if (!agentName || !map[agentName]) {
                    sendJson(
                        res,
                        400,
                        { error: 'Unknown or missing agent. Pass { "agent": "name" } or register one agent.' },
                        cors
                    );
                    pushAudit(400, { agent: body.agent });
                    return;
                }

                if (!body.message || typeof body.message !== 'string') {
                    sendJson(res, 400, { error: 'Missing "message" string' }, cors);
                    pushAudit(400, { agent: agentName });
                    return;
                }

                // ── Idempotency check ─────────────────────────────────────
                const idempotencyKey = req.headers[idempotencyHeader] as string | undefined;
                if (idempotencyStore && idempotencyKey) {
                    const cached = await idempotencyStore.get(idempotencyKey);
                    if (cached) {
                        // Return cached response without re-running the agent
                        res.setHeader('Content-Type', 'application/json; charset=utf-8');
                        res.setHeader('X-Idempotency-Replay', 'true');
                        if (cors) res.setHeader('Access-Control-Allow-Origin', cors);
                        res.writeHead(cached.responseStatus);
                        res.end(cached.responseBody);
                        pushAudit(cached.responseStatus, { agent: agentName });
                        return;
                    }
                }

                const agent = map[agentName]!;
                const sessionId =
                    body.sessionId ||
                    (req.headers['x-session-id'] as string | undefined) ||
                    (await agent.createSession(body.userId));

                // ── W3C Trace Context extraction ──────────────────────────
                const incomingTrace = extractTraceContext(
                    req.headers as Record<string, string | string[] | undefined>
                );

                // rid is already set at the top of the request handler
                const accept = req.headers.accept;
                const wantsStream =
                    body.stream === true ||
                    (typeof accept === 'string' && accept.includes('text/event-stream'));

                if (wantsStream) {
                    if (cors) {
                        res.setHeader('Access-Control-Allow-Origin', cors);
                        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                        res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS);
                    }
                    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
                    res.setHeader('Cache-Control', 'no-cache, no-transform');
                    res.setHeader('Connection', 'keep-alive');
                    res.setHeader('X-Accel-Buffering', 'no');
                    res.writeHead(200);

                    const writeEvent = (payload: Record<string, unknown>) => {
                        res.write(`data: ${JSON.stringify(payload)}\n\n`);
                    };

                    try {
                        const result = await agent.run(body.message, {
                            sessionId,
                            userId: body.userId,
                            onChunk: (text) => writeEvent({ type: 'chunk', text }),
                        });
                        writeEvent({
                            type: 'done',
                            id: rid,
                            agent: agentName,
                            sessionId,
                            text: result.text,
                            steps: result.steps,
                            finishReason: result.finishReason,
                            ...(incomingTrace && { traceId: incomingTrace.traceId }),
                        });
                        pushAudit(200, { id: rid, agent: agentName, sessionId });
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        writeEvent({ type: 'error', message: msg });
                        pushAudit(500, { id: rid, agent: agentName, sessionId });
                    }
                    res.end();
                    return;
                }

                const result = await agent.run(body.message, {
                    sessionId,
                    userId: body.userId,
                });

                const responseBody = JSON.stringify({
                    id: rid,
                    agent: agentName,
                    sessionId,
                    text: result.text,
                    steps: result.steps,
                    finishReason: result.finishReason,
                    ...(incomingTrace && { traceId: incomingTrace.traceId }),
                });

                // Cache response for idempotency
                if (idempotencyStore && idempotencyKey) {
                    await idempotencyStore.set(idempotencyKey, 200, responseBody, idempotencyTtlMs).catch(() => {
                        /* fire-and-forget */
                    });
                }

                sendJson(
                    res,
                    200,
                    JSON.parse(responseBody) as Record<string, unknown>,
                    cors
                );
                pushAudit(200, { id: rid, agent: agentName, sessionId });
                return;
            }

            if (method === 'POST' && (path === '/v1/sessions' || path === '/sessions')) {
                let bodyRaw: string;
                try {
                    bodyRaw = await readBody(req, maxBodyBytes);
                } catch (e) {
                    const code = (e as NodeJS.ErrnoException).code;
                    if (code === 'BODY_TOO_LARGE') {
                        sendJson(res, 413, { error: 'Request body too large' }, cors);
                        pushAudit(413);
                        return;
                    }
                    throw e;
                }
                let userId: string | undefined;
                if (bodyRaw) {
                    try {
                        const b = JSON.parse(bodyRaw) as { userId?: string };
                        userId = b.userId;
                    } catch {
                        /* ignore */
                    }
                }
                const agentName = Object.keys(map)[0];
                if (!agentName) {
                    sendJson(res, 500, { error: 'No agents registered' }, cors);
                    return;
                }
                const sessionId = await map[agentName]!.createSession(userId);
                sendJson(res, 201, { sessionId, defaultAgent: agentName }, cors);
                return;
            }

            // ── HITL Approval endpoints ───────────────────────────────────
            if (approvalStore && method === 'GET' && (path === '/v1/approvals' || path === '/approvals')) {
                const pending = await approvalStore.listPending();
                sendJson(res, 200, { approvals: pending }, cors);
                pushAudit(200);
                return;
            }

            if (approvalStore && method === 'POST') {
                // Match /v1/approvals/:id or /approvals/:id
                const approvalMatch = /^\/(?:v1\/)?approvals\/([^/]+)$/.exec(path);
                if (approvalMatch) {
                    const approvalId = approvalMatch[1]!;
                    let decisionBody: { approved?: boolean; comment?: string; decidedBy?: string } = {};
                    try {
                        const raw = await readBody(req, maxBodyBytes);
                        if (raw) decisionBody = JSON.parse(raw) as typeof decisionBody;
                    } catch {
                        sendJson(res, 400, { error: 'Invalid JSON' }, cors);
                        return;
                    }
                    if (typeof decisionBody.approved !== 'boolean') {
                        sendJson(res, 400, { error: 'Missing required field: approved (boolean)' }, cors);
                        return;
                    }
                    const existing = await approvalStore.get(approvalId);
                    if (!existing) {
                        sendJson(res, 404, { error: `Approval request '${approvalId}' not found` }, cors);
                        return;
                    }
                    const updated = await approvalStore.decide(approvalId, {
                        approved: decisionBody.approved,
                        comment: decisionBody.comment,
                        decidedBy: decisionBody.decidedBy,
                    });
                    sendJson(res, 200, updated, cors);
                    pushAudit(200);
                    return;
                }
            }

            sendJson(res, 404, { error: 'Not found' }, cors);
            pushAudit(404);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            sendJson(res, 500, { error: msg }, cors);
            pushAudit(500);
            adminStats.totalErrors++;
        }
    });

    // Attach WebSocket transport when enabled
    if (options.websocket) {
        attachWebSocketTransport(server, map);
    }

    return {
        port,
        server,
        close: () =>
            new Promise((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            }),
        getAuditLog: () => audit.slice(),
    };
}

/**
 * Start listening. Returns the same {@link HttpService} with an updated `port` if
 * the OS assigned an ephemeral port (when passing `0`).
 */
export function listenService(svc: HttpService, port?: number): Promise<HttpService> {
    return new Promise((resolve, reject) => {
        svc.server.once('error', reject);
        const p = port ?? svc.port;
        svc.server.listen(p, '0.0.0.0', () => {
            const address = svc.server.address();
            if (address && typeof address === 'object') {
                (svc as { port: number }).port = address.port;
            }
            resolve(svc);
        });
    });
}
