import { describe, it, expect } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker.js';
import { withRetry } from '../src/retry.js';
import { runToolWithTimeout, createDeadline } from '../src/timeout.js';
import {
  CircuitOpenError,
  ConfusedAIError,
  ERROR_CODES,
  ToolTimeoutError,
  ExecutionTimeoutError,
} from '@confused-ai/contracts';

describe('CircuitBreaker', () => {
  it('opens after threshold failures', async () => {
    const cb = new CircuitBreaker({ threshold: 2, timeout: 1000, service: 's' });
    const boom = (): Promise<never> => Promise.reject(new Error('x'));
    await expect(cb.call(boom)).rejects.toThrow();
    await expect(cb.call(boom)).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');
    await expect(cb.call(boom)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('transitions OPEN → HALF_OPEN → CLOSED on success', async () => {
    let t = 0;
    const cb = new CircuitBreaker({ threshold: 1, timeout: 100, service: 's', now: () => t });
    await expect(cb.call(() => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');
    t += 200;
    const result = await cb.call(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toBe('CLOSED');
  });

  it('HALF_OPEN failure trips back to OPEN immediately', async () => {
    let t = 0;
    const cb = new CircuitBreaker({ threshold: 1, timeout: 100, service: 's', now: () => t });
    await expect(cb.call(() => Promise.reject(new Error('x')))).rejects.toThrow();
    t += 200;
    await expect(cb.call(() => Promise.reject(new Error('y')))).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');
  });
});

describe('withRetry', () => {
  it('retries retryable ConfusedAIError until success', async () => {
    let calls = 0;
    const result = await withRetry(
      () => {
        calls++;
        if (calls < 3) {
          return Promise.reject(
            new ConfusedAIError({ code: ERROR_CODES.LLM_RATE_LIMITED, message: 'r', retryable: true }),
          );
        }
        return Promise.resolve('ok');
      },
      { maxAttempts: 5, initialDelayMs: 1, maxDelayMs: 1, multiplier: 1, jitter: false, sleep: () => Promise.resolve() },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry non-retryable errors', async () => {
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls++;
          return Promise.reject(
            new ConfusedAIError({ code: ERROR_CODES.VALIDATION_FAILED, message: 'v', retryable: false }),
          );
        },
        { maxAttempts: 3, sleep: () => Promise.resolve() },
      ),
    ).rejects.toBeInstanceOf(ConfusedAIError);
    expect(calls).toBe(1);
  });

  it('throws lastError after maxAttempts', async () => {
    await expect(
      withRetry(
        () => Promise.reject(new ConfusedAIError({ code: ERROR_CODES.LLM_RATE_LIMITED, message: 'r', retryable: true })),
        { maxAttempts: 2, sleep: () => Promise.resolve() },
      ),
    ).rejects.toBeInstanceOf(ConfusedAIError);
  });
});

describe('runToolWithTimeout', () => {
  it('returns value when completes in time', async () => {
    expect(await runToolWithTimeout(() => Promise.resolve(7), 1000, 't')).toBe(7);
  });

  it('throws ToolTimeoutError when slow', async () => {
    await expect(
      runToolWithTimeout(() => new Promise((r) => setTimeout(() => r(1), 200)), 20, 't'),
    ).rejects.toBeInstanceOf(ToolTimeoutError);
  });
});

describe('createDeadline', () => {
  it('asserts when expired', () => {
    let t = 0;
    const d = createDeadline(100, 'agent.run', () => t);
    expect(d.expired()).toBe(false);
    t += 200;
    expect(d.expired()).toBe(true);
    expect(() => d.assert()).toThrow(ExecutionTimeoutError);
  });

  it('remainingMs returns positive value before expiry', () => {
    let t = 0;
    const d = createDeadline(1000, 'agent.run', () => t);
    expect(d.remainingMs()).toBe(1000);
    t += 400;
    expect(d.remainingMs()).toBe(600);
  });

  it('remainingMs clamps to 0 after expiry', () => {
    let t = 0;
    const d = createDeadline(100, 'scope', () => t);
    t += 500;
    expect(d.remainingMs()).toBe(0);
  });

  it('assert is a no-op when not expired', () => {
    let t = 0;
    const d = createDeadline(5000, 'scope', () => t);
    expect(() => d.assert()).not.toThrow();
  });
});

describe('withRetry non-Error throw', () => {
  it('wraps a non-Error retryable string throw in ConfusedAIError', async () => {
    await expect(
      withRetry(
        () => Promise.reject('plain-string-error'),
        {
          maxAttempts: 2,
          sleep: () => Promise.resolve(),
          retryOn: () => true,
        },
      ),
    ).rejects.toBeInstanceOf(ConfusedAIError);
  });
});
