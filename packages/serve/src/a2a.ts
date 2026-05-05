/**
 * A2A (Agent-to-Agent) Protocol Support
 * ======================================
 * Implements the Google A2A spec (https://github.com/google-a2a/a2a) additions:
 *
 *   1. AgentCard endpoint  — `GET /.well-known/agent.json`
 *      Advertises capabilities, authentication requirements, and endpoint URLs.
 *
 *   2. HMAC request signing — `verifyA2ASignature(req, secret)`
 *      Verifies the `X-A2A-Signature` header (HMAC-SHA256 of the request body
 *      with a shared secret). Used for agent-to-agent calls where mTLS is
 *      unavailable.
 *
 *   3. AgentCard middleware — `agentCardMiddleware(card)`
 *      Express-compatible middleware that serves the AgentCard JSON.
 *
 * Security:
 *   - HMAC comparison uses `timingSafeEqual` to prevent timing attacks (OWASP A02).
 *   - Nonce tracking prevents replay attacks within a configurable window.
 *   - Signature algorithm is fixed to `sha256` to prevent algorithm confusion.
 *
 * Usage:
 *   // 1. Define your card
 *   const card: AgentCard = {
 *     name: 'my-agent', version: '1.0.0',
 *     capabilities: { streaming: true, tools: true },
 *     url: 'https://my-agent.example.com',
 *     authentication: { type: 'hmac', algorithm: 'sha256' },
 *   };
 *
 *   // 2. Mount middleware
 *   app.use(agentCardMiddleware(card));
 *
 *   // 3. Verify inbound calls
 *   app.post('/v1/run', async (req, res) => {
 *     const ok = await verifyA2ASignature(req, process.env.A2A_SECRET!);
 *     if (!ok) return res.status(401).json({ error: 'invalid signature' });
 *     ...
 *   });
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

// ── AgentCard types ───────────────────────────────────────────────────────────

export interface AgentCapabilities {
    /** Agent supports streaming (SSE / WebSocket) responses */
    streaming?: boolean;
    /** Agent can use external tools */
    tools?: boolean;
    /** Agent supports multi-turn conversations */
    multiTurn?: boolean;
    /** Agent supports long-running async tasks */
    asyncTasks?: boolean;
    /** Custom capabilities */
    [key: string]: boolean | undefined;
}

export interface AgentAuthentication {
    /** Authentication mechanism required to call this agent */
    type: 'none' | 'bearer' | 'hmac' | 'mtls' | 'oauth2';
    /** For hmac — signing algorithm. Default: 'sha256' */
    algorithm?: string;
    /** For oauth2 — authorization endpoint URL */
    authorizationEndpoint?: string;
    /** For oauth2 — token endpoint URL */
    tokenEndpoint?: string;
    /** Scopes required */
    scopes?: string[];
}

/** Google A2A-compatible AgentCard */
export interface AgentCard {
    /** Human-readable agent name */
    name: string;
    /** SemVer version string */
    version: string;
    /** Short description */
    description?: string;
    /** Base URL where this agent is hosted */
    url: string;
    /** Advertised capabilities */
    capabilities: AgentCapabilities;
    /** Authentication requirements */
    authentication: AgentAuthentication;
    /** List of supported input/output MIME types */
    defaultInputModes?: string[];
    defaultOutputModes?: string[];
    /** Skills / sub-capabilities the agent exposes */
    skills?: Array<{ id: string; name: string; description?: string; tags?: string[] }>;
    /** Custom provider metadata */
    provider?: { organization?: string; url?: string };
}

// ── HMAC signature verification ───────────────────────────────────────────────

/** Max age of a valid signature (ms). Default: 5 minutes. */
const DEFAULT_NONCE_WINDOW_MS = 5 * 60 * 1000;

/** In-memory nonce store for replay prevention. Cleared lazily on expiry. */
const _usedNonces = new Map<string, number>();

function _pruneNonces(): void {
    const cutoff = Date.now() - DEFAULT_NONCE_WINDOW_MS;
    for (const [nonce, ts] of _usedNonces) {
        if (ts < cutoff) _usedNonces.delete(nonce);
    }
}

export interface A2ASignatureOptions {
    /** Header name carrying the signature. Default: 'x-a2a-signature' */
    signatureHeader?: string;
    /** Header name carrying the timestamp (Unix seconds). Default: 'x-a2a-timestamp' */
    timestampHeader?: string;
    /** Header name carrying the nonce. Default: 'x-a2a-nonce' */
    nonceHeader?: string;
    /** Allowed clock skew in ms. Default: 300_000 (5 min) */
    maxAgeMs?: number;
}

/**
 * Verify an inbound A2A HMAC-SHA256 signature.
 *
 * Expected signature = HMAC-SHA256(`${timestamp}.${nonce}.${rawBody}`, secret)
 * encoded as hex.
 *
 * Returns `true` if the signature is valid, `false` otherwise.
 * Throws never — all errors are returned as `false`.
 */
export async function verifyA2ASignature(
    request: {
        headers: Record<string, string | string[] | undefined>;
        body?: string | Buffer | Uint8Array;
    },
    secret: string,
    options: A2ASignatureOptions = {},
): Promise<boolean> {
    try {
        const sigHeader   = options.signatureHeader  ?? 'x-a2a-signature';
        const tsHeader    = options.timestampHeader  ?? 'x-a2a-timestamp';
        const nonceHeader = options.nonceHeader      ?? 'x-a2a-nonce';
        const maxAge      = options.maxAgeMs         ?? DEFAULT_NONCE_WINDOW_MS;

        const rawSig  = String(request.headers[sigHeader]  ?? '');
        const rawTs   = String(request.headers[tsHeader]   ?? '');
        const nonce   = String(request.headers[nonceHeader] ?? '');

        if (!rawSig || !rawTs || !nonce) return false;

        // Validate timestamp (replay window)
        const tsMs = parseInt(rawTs, 10) * 1000;
        if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > maxAge) return false;

        // Replay prevention — nonce must not have been seen before
        _pruneNonces();
        if (_usedNonces.has(nonce)) return false;

        // Compute expected signature — narrow string primitive first so that
        // instanceof is only applied to object types (avoids TS2358).
        const rawBody = request.body;
        const body = typeof rawBody === 'string'
            ? rawBody
            : Buffer.isBuffer(rawBody)
                ? rawBody.toString('utf8')
                : rawBody !== undefined
                    ? Buffer.from(rawBody as Uint8Array).toString('utf8')
                    : '';

        const payload = `${rawTs}.${nonce}.${body}`;
        const expected = createHmac('sha256', secret).update(payload).digest('hex');

        const sigBuf = Buffer.from(rawSig, 'hex');
        const expBuf = Buffer.from(expected, 'hex');

        if (sigBuf.length !== expBuf.length) return false;

        const valid = timingSafeEqual(sigBuf, expBuf);
        if (valid) _usedNonces.set(nonce, Date.now());
        return valid;
    } catch {
        return false;
    }
}

/**
 * Sign an outbound A2A request.
 * Returns the headers to attach to the request.
 */
export function signA2ARequest(
    body: string,
    secret: string,
    options: A2ASignatureOptions = {},
): Record<string, string> {
    const sigHeader   = options.signatureHeader  ?? 'x-a2a-signature';
    const tsHeader    = options.timestampHeader  ?? 'x-a2a-timestamp';
    const nonceHeader = options.nonceHeader      ?? 'x-a2a-nonce';

    const ts    = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString('hex');
    const payload = `${ts}.${nonce}.${body}`;
    const sig   = createHmac('sha256', secret).update(payload).digest('hex');

    return {
        [sigHeader]:   sig,
        [tsHeader]:    ts,
        [nonceHeader]: nonce,
    };
}

// ── Middleware ────────────────────────────────────────────────────────────────

interface Req { url?: string; method?: string; headers: Record<string, string | string[] | undefined> }
interface Res { writeHead(code: number, headers?: Record<string, string>): void; end(body?: string): void }
type Next = () => void;

/**
 * Express-compatible middleware that serves the `AgentCard` JSON at
 * `GET /.well-known/agent.json`.
 *
 * @example
 * ```ts
 * app.use(agentCardMiddleware(card));
 * // curl http://localhost:3000/.well-known/agent.json
 * ```
 */
export function agentCardMiddleware(card: AgentCard): (req: Req, res: Res, next: Next) => void {
    const payload = JSON.stringify(card, null, 2);
    const byteLen = Buffer.byteLength(payload).toString();

    return (req, res, next) => {
        if (req.method === 'GET' && req.url === '/.well-known/agent.json') {
            res.writeHead(200, {
                'Content-Type':   'application/json; charset=utf-8',
                'Content-Length': byteLen,
                'Cache-Control':  'public, max-age=300',
            });
            res.end(payload);
            return;
        }
        next();
    };
}

/**
 * Express-compatible HMAC signature verification middleware.
 * Reads the raw body from `req.body` (string or Buffer) — ensure a raw body
 * parser has run before this middleware.
 *
 * Responds 401 when the signature is missing, expired, or invalid.
 *
 * @example
 * ```ts
 * app.use(express.raw({ type: '*\/*' }));
 * app.use(a2aSignatureMiddleware(process.env.A2A_SECRET!));
 * ```
 */
export function a2aSignatureMiddleware(
    secret: string,
    options: A2ASignatureOptions = {},
): (req: Req & { body?: unknown }, res: Res, next: Next) => void {
    return (req, res, next) => {
        verifyA2ASignature(
            req as Parameters<typeof verifyA2ASignature>[0],
            secret,
            options,
        ).then((valid) => {
            if (!valid) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'invalid or missing A2A signature' }));
                return;
            }
            next();
        }).catch(() => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'signature verification failed' }));
        });
    };
}
