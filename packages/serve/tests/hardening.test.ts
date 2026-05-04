import { describe, it, expect } from 'vitest';
import { securityHeaders, cors, bodyLimit } from '../src/hardening.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<{ method: string; headers: Record<string, string> }> = {}) {
  const headers: Record<string, string> = {};
  const req = { method: 'GET', headers: { ...overrides.headers }, ...overrides };
  const res = {
    _headers: {} as Record<string, string>,
    _status: 200,
    _body: undefined as unknown,
    setHeader(k: string, v: string) { this._headers[k.toLowerCase()] = v; },
    status(code: number) { this._status = code; return this; },
    json(body: unknown) { this._body = body; return this; },
    end() { /* noop */ },
  };
  const next = { called: false, fn() { this.called = true; } };
  return { req, res, next: () => next.fn.call(next), nextObj: next };
}

// ── securityHeaders ────────────────────────────────────────────────────────

describe('securityHeaders', () => {
  it('sets CSP, nosniff, frame-options, referrer-policy', () => {
    const { req, res, next } = makeCtx();
    securityHeaders()(req, res, next);
    expect(res._headers['content-security-policy']).toContain("default-src 'self'");
    expect(res._headers['x-content-type-options']).toBe('nosniff');
    expect(res._headers['x-frame-options']).toBe('DENY');
    expect(res._headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('calls next()', () => {
    const { req, res, next, nextObj } = makeCtx();
    securityHeaders()(req, res, next);
    expect(nextObj.called).toBe(true);
  });
});

// ── cors ───────────────────────────────────────────────────────────────────

describe('cors', () => {
  it('allows all origins when origin is "*"', () => {
    const { req, res, next } = makeCtx({ headers: { origin: 'https://example.com' } });
    cors({ origin: '*' })(req, res, next);
    expect(res._headers['access-control-allow-origin']).toBe('https://example.com');
  });

  it('allows a listed origin', () => {
    const { req, res, next } = makeCtx({ headers: { origin: 'https://app.com' } });
    cors({ origin: ['https://app.com'] })(req, res, next);
    expect(res._headers['access-control-allow-origin']).toBe('https://app.com');
  });

  it('does NOT set allow-origin for unlisted origins', () => {
    const { req, res, next } = makeCtx({ headers: { origin: 'https://evil.com' } });
    cors({ origin: ['https://app.com'] })(req, res, next);
    expect(res._headers['access-control-allow-origin']).toBeUndefined();
  });

  it('handles preflight OPTIONS and responds 204', () => {
    const { req, res } = makeCtx({ method: 'OPTIONS', headers: { origin: 'https://app.com' } });
    let ended = false;
    res.end = () => { ended = true; };
    cors({ origin: '*' })(req, res, () => { /* should not be called */ });
    expect(res._status).toBe(204);
    expect(ended).toBe(true);
    expect(res._headers['access-control-allow-methods']).toBeDefined();
  });

  it('sets Vary: Origin when using an allowlist (not "*")', () => {
    const { req, res, next } = makeCtx({ headers: { origin: 'https://app.com' } });
    cors({ origin: ['https://app.com'] })(req, res, next);
    expect(res._headers['vary']).toBe('Origin');
  });

  it('does NOT set Vary: Origin when origin is "*"', () => {
    const { req, res, next } = makeCtx({ headers: { origin: 'https://app.com' } });
    cors({ origin: '*' })(req, res, next);
    expect(res._headers['vary']).toBeUndefined();
  });
});

// ── bodyLimit ──────────────────────────────────────────────────────────────

describe('bodyLimit', () => {
  it('passes through requests within the limit', () => {
    const { req, res, next, nextObj } = makeCtx({ headers: { 'content-length': '100' } });
    bodyLimit(1_000)(req, res, next);
    expect(nextObj.called).toBe(true);
  });

  it('rejects requests exceeding the limit with 413', () => {
    const { req, res, next } = makeCtx({ headers: { 'content-length': '2000' } });
    bodyLimit(1_000)(req, res, next);
    expect(res._status).toBe(413);
    expect((res._body as { error: string }).error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('passes through requests with no content-length header', () => {
    const { req, res, next, nextObj } = makeCtx();
    bodyLimit(100)(req, res, next);
    expect(nextObj.called).toBe(true);
  });
});
