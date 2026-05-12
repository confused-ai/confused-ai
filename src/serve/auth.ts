/**
 * JWT authentication + RBAC middleware for the HTTP runtime.
 *
 * Zero external dependencies — HS256 verification is implemented using
 * Node.js `node:crypto` HMAC with `timingSafeEqual` to prevent timing attacks.
 *
 * @module
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfusedAIError, ERROR_CODES } from '../contracts/index.js';

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
  /** Not-before (epoch seconds) — optional standard JWT claim */
  nbf?: number;
  [key: string]: unknown;
}

/**
 * JwtVerifier — pluggable interface for different JWT verification strategies.
 * Allows swapping between HS256 (zero-dependency), JWKS (RS256/EC), etc.
 */
export interface JwtVerifier {
  /**
   * Verify a JWT token and return its decoded payload.
   * @throws {ConfusedAIError} with code `UNAUTHORIZED` on any verification failure
   */
  verify(token: string): Promise<JwtPayload>;
}

/**
 * HS256Verifier — production-grade HS256 JWT verification.
 *
 * Features:
 * - Timing-safe signature verification
 * - Clock tolerance for distributed systems (default 60s)
 * - Validation of `nbf` (not before) and `iat` (issued at) claims
 * - Zero external dependencies
 *
 * @example
 * ```ts
 * const verifier = new HS256Verifier(process.env.JWT_SECRET!, { clockToleranceSecs: 60 });
 * const payload = await verifier.verify(token);
 * ```
 */
export class HS256Verifier implements JwtVerifier {
  constructor(
    private readonly secret: string,
    private readonly options: { clockToleranceSecs?: number } = {},
  ) {}

  verify(token: string): Promise<JwtPayload> {
    const clockTolerance = this.options.clockToleranceSecs ?? 60;
    const payload = verifyJwt(token, this.secret);
    const now = Date.now() / 1000;

    // Check not-before (nbf)
    if (
      typeof payload.nbf === 'number' &&
      now < payload.nbf - clockTolerance
    ) {
      return Promise.reject(new ConfusedAIError({
        code: ERROR_CODES.UNAUTHORIZED,
        message: `JWT not yet valid (nbf: ${payload.nbf}, now: ${now}, tolerance: ${clockTolerance}s)`,
      }));
    }

    // Check issued-at (iat) floor — token shouldn't be from the future
    if (
      typeof payload.iat === 'number' &&
      payload.iat > now + clockTolerance
    ) {
      return Promise.reject(new ConfusedAIError({
        code: ERROR_CODES.UNAUTHORIZED,
        message: `JWT issued in the future (iat: ${payload.iat}, now: ${now})`,
      }));
    }

    return Promise.resolve(payload);
  }
}

/**
 * JwksVerifier — RS256/EC JWT verification with remote JWKS key fetching.
 *
 * Stub implementation for Phase 3. To be completed in Phase 4 with:
 * - HTTP fetch from JWKS URI
 * - Key caching with TTL
 * - Multiple key support (kid matching)
 * - RS256 and EC signature verification
 *
 * @example
 * ```ts
 * const verifier = new JwksVerifier('https://auth.example.com/.well-known/jwks.json');
 * const payload = await verifier.verify(token);
 * ```
 */
export class JwksVerifier implements JwtVerifier {
  private readonly _jwksUri: string;
  private readonly _cacheTtlSeconds: number;

  constructor(
    jwksUri: string,
    options: { cacheTtlSeconds?: number } = {},
  ) {
    this._jwksUri = jwksUri;
    this._cacheTtlSeconds = options.cacheTtlSeconds ?? 300;
  }

  verify(_token: string): Promise<JwtPayload> {
    // Use stored config for future JWKS implementation
    void this._jwksUri;
    void this._cacheTtlSeconds;
    return Promise.reject(new ConfusedAIError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'JwksVerifier not yet implemented — use HS256Verifier for production JWT verification',
    }));
  }
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
