import { describe, it, expect } from 'vitest';
import { ConsoleLogger } from '../src/logger.js';
import { RequestContext } from '../src/request-context.js';
import { getTracer, withSpan } from '../src/tracing.js';
import { Metrics } from '../src/metrics.js';

describe('ConsoleLogger', () => {
  it('emits json with bindings and ctx merged', () => {
    const lines: string[] = [];
    const log = new ConsoleLogger({ level: 'debug', bindings: { svc: 'api' }, write: (l) => lines.push(l) });
    log.info('hi', { user: 'u1' });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed['level']).toBe('info');
    expect(parsed['svc']).toBe('api');
    expect(parsed['user']).toBe('u1');
    expect(parsed['message']).toBe('hi');
  });

  it('respects level filter', () => {
    const lines: string[] = [];
    const log = new ConsoleLogger({ level: 'warn', write: (l) => lines.push(l) });
    log.debug('skip');
    log.info('skip');
    log.warn('keep');
    log.error('keep');
    expect(lines).toHaveLength(2);
  });

  it('child inherits bindings', () => {
    const lines: string[] = [];
    const root = new ConsoleLogger({ level: 'debug', bindings: { a: 1 }, write: (l) => lines.push(l) });
    const child = root.child({ b: 2 });
    child.info('x');
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed['a']).toBe(1);
    expect(parsed['b']).toBe(2);
  });
});

describe('RequestContext', () => {
  it('returns undefined outside run()', () => {
    expect(RequestContext.get()).toBeUndefined();
  });

  it('propagates through async boundaries', async () => {
    await RequestContext.run({ requestId: 'r1', tenantId: 't1' }, async () => {
      await Promise.resolve();
      expect(RequestContext.getRequestId()).toBe('r1');
      expect(RequestContext.getTenantId()).toBe('t1');
      expect(RequestContext.getTraceId()).toBeUndefined();
    });
  });
});

describe('Tracing', () => {
  it('getTracer returns an object with startActiveSpan', () => {
    const tracer = getTracer('1.0.0');
    expect(typeof tracer.startActiveSpan).toBe('function');
  });

  it('withSpan resolves with the function return value (no-op provider)', async () => {
    const result = await withSpan('test.span', { foo: 'bar' }, async (_span) => {
      return 42;
    });
    expect(result).toBe(42);
  });

  it('withSpan propagates errors (no-op provider)', async () => {
    await expect(
      withSpan('test.error', {}, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});

describe('Metrics', () => {
  it('exposes expected counter/histogram keys', () => {
    expect(typeof Metrics.agentRunsTotal.add).toBe('function');
    expect(typeof Metrics.agentRunDurationMs.record).toBe('function');
    expect(typeof Metrics.llmTokensTotal.add).toBe('function');
    expect(typeof Metrics.llmCostUsd.add).toBe('function');
    expect(typeof Metrics.httpRequestsTotal.add).toBe('function');
    expect(typeof Metrics.httpActiveStreams.add).toBe('function');
    expect(typeof Metrics.guardrailViolationsTotal.add).toBe('function');
    expect(typeof Metrics.circuitBreakerOpensTotal.add).toBe('function');
  });
});
