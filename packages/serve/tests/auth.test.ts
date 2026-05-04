import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt, jwtAuth, requireRole } from '../src/auth.js';
import { ConfusedAIError } from '@confused-ai/contracts';

const SECRET = 'test-secret-32-chars-long-xxxxxxx';

// ── signJwt / verifyJwt ────────────────────────────────────────────────────

describe('signJwt + verifyJwt', () => {
  it('produces a valid JWT that verifies correctly', () => {
    const token = signJwt({ sub: 'u1', tenantId: 't1', roles: ['user'] }, SECRET);
    const payload = verifyJwt(token, SECRET);
    expect(payload.sub).toBe('u1');
    expect(payload.tenantId).toBe('t1');
    expect(payload.roles).toEqual(['user']);
  });

  it('rejects a tampered signature', () => {
    const token = signJwt({ sub: 'u1', tenantId: 't1', roles: [] }, SECRET);
    const [h, p, s] = token.split('.');
    const tampered = `${h}.${p}.${(s ?? '') + 'x'}`;
    expect(() => verifyJwt(tampered, SECRET)).toThrow(ConfusedAIError);
  });

  it('rejects a malformed token (wrong number of parts)', () => {
    expect(() => verifyJwt('not.a.jwt.here', SECRET)).toThrow(ConfusedAIError);
  });

  it('rejects an expired token', () => {
    const token = signJwt({ sub: 'u1', tenantId: 't1', roles: [] }, SECRET, -1); // already expired
    expect(() => verifyJwt(token, SECRET)).toThrow(/expired/i);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt({ sub: 'u1', tenantId: 't1', roles: [] }, 'other-secret');
    expect(() => verifyJwt(token, SECRET)).toThrow(ConfusedAIError);
  });
});

// ── jwtAuth middleware ─────────────────────────────────────────────────────

function makeReq(authHeader?: string) {
  return { headers: { authorization: authHeader } };
}
function makeRes() {
  const r = {
    _status: 200,
    _body: undefined as unknown,
    status(c: number) { this._status = c; return this; },
    json(b: unknown) { this._body = b; return this; },
  };
  return r;
}

describe('jwtAuth middleware', () => {
  it('calls next() and sets req.user on a valid token', () => {
    const token = signJwt({ sub: 'u2', tenantId: 't2', roles: ['admin'] }, SECRET);
    const req = makeReq(`Bearer ${token}`) as Parameters<ReturnType<typeof jwtAuth>>[0];
    const res = makeRes();
    let called = false;
    jwtAuth(SECRET)(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.user?.sub).toBe('u2');
  });

  it('returns 401 when no Authorization header', () => {
    const req = makeReq() as Parameters<ReturnType<typeof jwtAuth>>[0];
    const res = makeRes();
    jwtAuth(SECRET)(req, res, () => { /* should not be called */ });
    expect(res._status).toBe(401);
  });

  it('returns 401 on invalid token', () => {
    const req = makeReq('Bearer invalid.token.here') as Parameters<ReturnType<typeof jwtAuth>>[0];
    const res = makeRes();
    jwtAuth(SECRET)(req, res, () => { /* should not be called */ });
    expect(res._status).toBe(401);
  });
});

// ── requireRole middleware ─────────────────────────────────────────────────

describe('requireRole middleware', () => {
  it('calls next() when user has the required role', () => {
    const req = { headers: {}, user: { sub: 'u', tenantId: 't', roles: ['admin'], iat: 0, exp: Infinity } } as Parameters<ReturnType<typeof requireRole>>[0];
    const res = makeRes();
    let called = false;
    requireRole('admin')(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('returns 403 when user lacks the required role', () => {
    const req = { headers: {}, user: { sub: 'u', tenantId: 't', roles: ['user'], iat: 0, exp: Infinity } } as Parameters<ReturnType<typeof requireRole>>[0];
    const res = makeRes();
    requireRole('admin')(req, res, () => { /* should not be called */ });
    expect(res._status).toBe(403);
  });

  it('returns 403 when req.user is undefined', () => {
    const req = { headers: {} } as Parameters<ReturnType<typeof requireRole>>[0];
    const res = makeRes();
    requireRole('admin')(req, res, () => { /* should not be called */ });
    expect(res._status).toBe(403);
  });
});
