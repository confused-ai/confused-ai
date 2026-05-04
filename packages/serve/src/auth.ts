/**
 * JWT authentication + RBAC middleware for the HTTP runtime.
 *
 * Zero external dependencies — HS256 verification is implemented using
 * Node.js `node:crypto` HMAC with `timingSafeEqual` to prevent timing attacks.
 *
 * @module
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfusedAIError, ERROR_CODES } from '@confused-ai/contracts';

// ── JWT types ──────────────────────────────────────────────────────────────

export interface JwtPayload {
  /** Subject (userId) */
  sub: string;
  tenantId: string;
  roles: string[];
  /** Issued-at (epoch seconds) */
  iat: number;
  /** Expiry (epoch seconds) */
  exp: number;
  [key: string]: unknown;
}

// ── Low-level JWT helpers ──────────────────────────────────────────────────

function base64UrlDecode(str: string): Buffer {
  // Re-pad and convert URL-safe chars back to standard base64
  const padded = str + '=='.slice(0, (4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Verify an HS256 JWT and return its decoded payload.
 *
 * @throws {ConfusedAIError} with code `UNAUTHORIZED` on any failure
 */
export function verifyJwt(token: string, secret: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new ConfusedAIError({ code: ERROR_CODES.UNAUTHORIZED, message: 'Malformed JWT' });
  }

  const [header, payload, sig] = parts as [string, string, string];

  // Verify header declares HS256
  let headerObj: Record<string, unknown>;
  try {
    headerObj = JSON.parse(base64UrlDecode(header).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new ConfusedAIError({ code: ERROR_CODES.UNAUTHORIZED, message: 'Invalid JWT header' });
  }
  if (headerObj['alg'] !== 'HS256') {
    throw new ConfusedAIError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: `Unsupported JWT algorithm: ${String(headerObj['alg'])}`,
    });
  }

  // Timing-safe signature check
  const expected = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest();
  const actual = base64UrlDecode(sig);
  const safeLen = Math.max(expected.length, actual.length);
  // Pad to same length before timingSafeEqual (it requires equal-length buffers)
  const ePadded = Buffer.concat([expected, Buffer.alloc(safeLen - expected.length)]);
  const aPadded = Buffer.concat([actual, Buffer.alloc(safeLen - actual.length)]);

  if (expected.length !== actual.length || !timingSafeEqual(ePadded, aPadded)) {
    throw new ConfusedAIError({ code: ERROR_CODES.UNAUTHORIZED, message: 'Invalid JWT signature' });
  }

  // Decode claims
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(base64UrlDecode(payload).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new ConfusedAIError({ code: ERROR_CODES.UNAUTHORIZED, message: 'Invalid JWT payload' });
  }

  // Expiry check
  if (typeof claims['exp'] === 'number' && Date.now() / 1000 > claims['exp']) {
    throw new ConfusedAIError({ code: ERROR_CODES.UNAUTHORIZED, message: 'JWT expired' });
  }

  return claims as unknown as JwtPayload;
}

// ── Express-compatible middleware types ───────────────────────────────────

export interface AuthenticatedReq {
  headers: Record<string, string | string[] | undefined>;
  user?: JwtPayload;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): unknown;
}
type Next = (err?: unknown) => void;
export type AuthMiddleware = (req: AuthenticatedReq, res: Res, next: Next) => void;

// ── Middleware factories ───────────────────────────────────────────────────

/**
 * Express-compatible JWT Bearer authentication middleware.
 *
 * On success, attaches the decoded payload to `req.user`.
 * On failure, responds with `401 UNAUTHORIZED`.
 *
 * @example
 * ```ts
 * app.use(jwtAuth(process.env.JWT_SECRET!));
 * app.post('/v1/chat', (req, res) => {
 *   console.log(req.user?.sub); // userId
 * });
 * ```
 */
export function jwtAuth(secret: string): AuthMiddleware {
  return (req, res, next) => {
    const auth = Array.isArray(req.headers['authorization'])
      ? req.headers['authorization'][0]
      : req.headers['authorization'];

    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Bearer token required' });
      return;
    }

    try {
      req.user = verifyJwt(auth.slice(7), secret);
      next();
    } catch (e) {
      const msg = e instanceof ConfusedAIError ? e.message : 'Invalid token';
      res.status(401).json({ error: 'UNAUTHORIZED', message: msg });
    }
  };
}

/**
 * Express-compatible role-guard middleware.
 *
 * Must be used **after** `jwtAuth()`. Responds with `403 FORBIDDEN` when
 * the authenticated user does not have the required role.
 *
 * @example
 * ```ts
 * app.delete('/v1/agents/:id',
 *   jwtAuth(secret),
 *   requireRole('admin'),
 *   deleteAgentHandler,
 * );
 * ```
 */
export function requireRole(role: string): AuthMiddleware {
  return (req, res, next) => {
    if (!req.user?.roles.includes(role)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Role '${role}' required`,
        required: role,
      });
      return;
    }
    next();
  };
}

/**
 * Utility: sign a minimal HS256 JWT (useful in tests and CLI tooling).
 *
 * @example
 * ```ts
 * const token = signJwt({ sub: 'u1', tenantId: 't1', roles: ['user'] }, secret, 3600);
 * ```
 */
export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds = 3600,
): string {
  const now = Math.floor(Date.now() / 1000);
  // TS struggles to narrow Omit<JwtPayload,…> spread with index-sig; assertion is safe here
  const claims = { ...payload, iat: now, exp: now + expiresInSeconds } as JwtPayload;

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const body = Buffer.from(JSON.stringify(claims))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const sig = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${header}.${body}.${sig}`;
}
