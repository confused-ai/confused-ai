import { describe, it, expect } from 'vitest';
import {
  ConfusedAIError,
  ERROR_CODES,
  BudgetExceededError,
  CircuitOpenError,
  isConfusedAIError,
  isRetryable,
} from '../src/errors.js';
import { ok, err, isOk, isErr, unwrap, map, tryCatch } from '../src/result.js';

describe('ConfusedAIError', () => {
  it('captures code, retryable, context, timestamp', () => {
    const e = new ConfusedAIError({
      code: ERROR_CODES.LLM_PROVIDER_ERROR,
      message: 'boom',
      retryable: true,
      context: { provider: 'openai' },
    });
    expect(e.code).toBe('LLM_PROVIDER_ERROR');
    expect(e.retryable).toBe(true);
    expect(e.context).toEqual({ provider: 'openai' });
    expect(typeof e.timestamp).toBe('string');
  });

  it('serialises to JSON', () => {
    const e = new ConfusedAIError({ code: ERROR_CODES.VALIDATION_FAILED, message: 'x' });
    const json = e.toJSON();
    expect(json.code).toBe('VALIDATION_FAILED');
    expect(json.retryable).toBe(false);
  });

  it('preserves cause', () => {
    const cause = new Error('underlying');
    const e = new ConfusedAIError({ code: ERROR_CODES.LLM_PROVIDER_ERROR, message: 'x', cause });
    expect(e.cause).toBe(cause);
  });
});

describe('typed subclasses', () => {
  it('BudgetExceededError', () => {
    const e = new BudgetExceededError({ limitUsd: 1, spentUsd: 1.5, scope: 'user' });
    expect(e.code).toBe(ERROR_CODES.BUDGET_EXCEEDED);
    expect(e.retryable).toBe(false);
    expect(e).toBeInstanceOf(ConfusedAIError);
  });

  it('CircuitOpenError is retryable', () => {
    const e = new CircuitOpenError('llm', 5000);
    expect(e.retryable).toBe(true);
    expect(isRetryable(e)).toBe(true);
  });
});

describe('type guards', () => {
  it('isConfusedAIError', () => {
    expect(isConfusedAIError(new ConfusedAIError({ code: ERROR_CODES.VALIDATION_FAILED, message: 'x' }))).toBe(true);
    expect(isConfusedAIError(new Error('plain'))).toBe(false);
    expect(isConfusedAIError(null)).toBe(false);
  });
});

describe('Result', () => {
  it('ok / err / type guards', () => {
    const a = ok(42);
    const b = err(new ConfusedAIError({ code: ERROR_CODES.VALIDATION_FAILED, message: 'x' }));
    expect(isOk(a)).toBe(true);
    expect(isErr(b)).toBe(true);
    if (isOk(a)) expect(a.value).toBe(42);
  });

  it('unwrap throws on err', () => {
    const r = err(new ConfusedAIError({ code: ERROR_CODES.VALIDATION_FAILED, message: 'x' }));
    expect(() => unwrap(r)).toThrow(ConfusedAIError);
  });

  it('map transforms ok', () => {
    const r = map(ok(2), (n) => n * 3);
    if (isOk(r)) expect(r.value).toBe(6);
  });

  it('tryCatch wraps async functions', async () => {
    const good = await tryCatch(() => 1, () => new ConfusedAIError({ code: ERROR_CODES.VALIDATION_FAILED, message: 'x' }));
    expect(isOk(good)).toBe(true);

    const bad = await tryCatch(() => { throw new Error('nope'); },
      (e) => new ConfusedAIError({ code: ERROR_CODES.VALIDATION_FAILED, message: String(e) }));
    expect(isErr(bad)).toBe(true);
  });
});
