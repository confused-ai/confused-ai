import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateBody, validate } from '../src/validate.js';
import { ChatRequestSchema } from '../src/schemas.js';
import { ValidationError } from '@confused-ai/contracts';

describe('validateBody', () => {
  it('returns ok with parsed data', () => {
    const r = validateBody(ChatRequestSchema, { message: 'hi' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.stream).toBe(false);
  });

  it('returns ValidationError on failure', () => {
    const r = validateBody(ChatRequestSchema, { message: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(ValidationError);
  });
});

describe('validate middleware', () => {
  it('calls next() on success and replaces req.body with typed data', () => {
    const schema = z.object({ n: z.coerce.number() });
    const req: { body: unknown } = { body: { n: '5' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect((req.body as { n: number }).n).toBe(5);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds with 400 on failure', () => {
    const schema = z.object({ n: z.number() });
    const req = { body: { n: 'not-a-number' } };
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status, json: vi.fn() };
    const next = vi.fn();
    validate(schema)(req, res as never, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
