/**
 * OTLP Span Validation Tests
 *
 * Verifies that `withSpan()` emits spans with the **correct attributes, status,
 * and event records** — not just that it "runs". Without these tests a refactor
 * could silently drop all telemetry while every other test keeps passing.
 *
 * Strategy
 * ─────────
 * We build a zero-dependency in-memory TracerProvider using only
 * `@opentelemetry/api` (already installed). The provider records every
 * `startActiveSpan` call, captures attribute mutations, status codes, events
 * (recordException), and parent/child relationships entirely in-process.
 *
 * No `@opentelemetry/sdk-trace-base` is required.
 *
 * Coverage:
 *   1.  Span is started and ended
 *   2.  Initial attributes are set
 *   3.  Status is set to OK on success
 *   4.  Status is set to ERROR on failure
 *   5.  The error is recorded as a span event
 *   6.  ConfusedAIError attributes (error.code, error.retryable) are set
 *   7.  Undefined attributes are dropped (not serialised as "undefined")
 *   8.  Span name matches the name passed to withSpan
 *   9.  Nested spans set the parent correctly (child/parent relationship)
 *   10. SpanOptions (kind) are forwarded
 *   11. Metrics counters are callable (smoke test — no-op provider)
 *   12. Metrics histograms are callable (smoke test)
 *   13. ConsoleLogger emits JSON with correct fields
 *   14. RequestContext preserves requestId across async boundaries
 *   15. withSpan return value is propagated (contract regression)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    trace,
    SpanStatusCode,
    SpanKind,
    type Span,
    type SpanOptions,
    type SpanStatus,
    type Tracer,
    type TracerProvider,
    type SpanContext,
    type Context,
} from '@opentelemetry/api';

import { withSpan, getTracer, TRACER_NAME } from '../src/tracing.js';
import { Metrics } from '../src/metrics.js';
import { ConsoleLogger } from '../src/logger.js';
import { RequestContext } from '../src/request-context.js';
import { ConfusedAIError } from '@confused-ai/contracts';

// ── Tiny in-memory TracerProvider (zero extra deps) ───────────────────────────

export interface CapturedSpanEvent {
    name: string;
    attributes?: Record<string, unknown>;
}

export interface CapturedSpan {
    name: string;
    kind: SpanKind;
    attributes: Record<string, unknown>;
    status: SpanStatus;
    events: CapturedSpanEvent[];
    spanId: string;
    parentSpanId: string | undefined;
    ended: boolean;
}

let _spanStore: CapturedSpan[] = [];
let _activeSpanStack: CapturedSpan[] = [];
let _spanCounter = 0;

function makeSpanId(): string {
    return `span-${++_spanCounter}`;
}

function buildInMemorySpan(name: string, kind: SpanKind, attributes: Record<string, unknown>, parentSpanId: string | undefined): [Span, CapturedSpan] {
    const spanId = makeSpanId();
    const captured: CapturedSpan = {
        name,
        kind,
        attributes: { ...attributes },
        status: { code: SpanStatusCode.UNSET },
        events: [],
        spanId,
        parentSpanId,
        ended: false,
    };

    const span: Span = {
        spanContext(): SpanContext {
            return { traceId: 'trace-0', spanId, traceFlags: 1, isRemote: false };
        },
        setAttribute(key: string, value: unknown): Span {
            captured.attributes[key] = value;
            return span;
        },
        setAttributes(attrs: Record<string, unknown>): Span {
            Object.assign(captured.attributes, attrs);
            return span;
        },
        setStatus(status: SpanStatus): Span {
            captured.status = status;
            return span;
        },
        recordException(exception: unknown): void {
            const msg = exception instanceof Error ? exception.message : String(exception);
            captured.events.push({
                name: 'exception',
                attributes: {
                    'exception.message': msg,
                    'exception.type': exception instanceof Error ? exception.constructor.name : 'unknown',
                },
            });
        },
        addEvent(name: string, attrs?: Record<string, unknown>): Span {
            captured.events.push({ name, attributes: attrs });
            return span;
        },
        updateName(newName: string): Span {
            captured.name = newName;
            return span;
        },
        end(): void {
            captured.ended = true;
            _activeSpanStack = _activeSpanStack.filter((s) => s.spanId !== spanId);
            _spanStore.push(captured);
        },
        isRecording(): boolean { return !captured.ended; },
        addLink(): Span { return span; },
        addLinks(): Span { return span; },
    };

    return [span, captured];
}

function buildInMemoryTracer(): Tracer {
    return {
        startSpan(name: string, options?: SpanOptions): Span {
            const kind = options?.kind ?? SpanKind.INTERNAL;
            const attrs = (options?.attributes ?? {}) as Record<string, unknown>;
            const parentId = _activeSpanStack[_activeSpanStack.length - 1]?.spanId;
            const [span, captured] = buildInMemorySpan(name, kind, attrs, parentId);
            _activeSpanStack.push(captured);
            return span;
        },

        startActiveSpan<F extends (span: Span) => unknown>(
            name: string,
            optionsOrFn: SpanOptions | F,
            ctxOrFn?: Context | F,
            fn?: F,
        ): ReturnType<F> {
            let opts: SpanOptions = {};
            let callback: F;

            if (typeof optionsOrFn === 'function') {
                callback = optionsOrFn;
            } else if (typeof ctxOrFn === 'function') {
                opts = optionsOrFn as SpanOptions;
                callback = ctxOrFn;
            } else {
                opts = optionsOrFn as SpanOptions;
                callback = fn!;
            }

            const kind = opts.kind ?? SpanKind.INTERNAL;
            const attrs = (opts.attributes ?? {}) as Record<string, unknown>;
            const parentId = _activeSpanStack[_activeSpanStack.length - 1]?.spanId;
            const [span, captured] = buildInMemorySpan(name, kind, attrs, parentId);
            _activeSpanStack.push(captured);
            return callback(span) as ReturnType<F>;
        },
    };
}

const inMemoryProvider: TracerProvider = {
    getTracer(): Tracer { return buildInMemoryTracer(); },
};

interface TestEnv {
    getSpans: () => CapturedSpan[];
}

function installTestProvider(): TestEnv {
    _spanStore = [];
    _activeSpanStack = [];
    _spanCounter = 0;
    trace.setGlobalTracerProvider(inMemoryProvider);
    return { getSpans: () => [..._spanStore] };
}

function resetProvider(): void {
    _spanStore = [];
    _activeSpanStack = [];
    // Restore no-op by re-setting the existing (no-op) provider reference
    trace.setGlobalTracerProvider(trace.getTracerProvider());
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('withSpan — span lifecycle', () => {
    let env: TestEnv;

    beforeEach(() => {
        env = installTestProvider();
    });

    afterEach(() => {
        resetProvider();
    });

    // 1. Span is started and ended
    it('records exactly one finished span', async () => {
        await withSpan('test.lifecycle', {}, async () => 'ok');
        expect(env.getSpans()).toHaveLength(1);
    });

    // 2. Initial attributes are set
    it('sets initial attributes on the span', async () => {
        await withSpan('test.attrs', { agent_name: 'my-agent', step: 3 }, async () => 'ok');
        const [span] = env.getSpans();
        expect(span!.attributes['agent_name']).toBe('my-agent');
        expect(span!.attributes['step']).toBe(3);
    });

    // 3. Status OK on success
    it('sets SpanStatusCode.OK on successful completion', async () => {
        await withSpan('test.ok', {}, async () => 42);
        const [span] = env.getSpans();
        expect(span!.status.code).toBe(SpanStatusCode.OK);
    });

    // 4. Status ERROR on failure
    it('sets SpanStatusCode.ERROR when the function throws', async () => {
        await expect(
            withSpan('test.error', {}, async () => { throw new Error('boom'); }),
        ).rejects.toThrow('boom');
        const [span] = env.getSpans();
        expect(span!.status.code).toBe(SpanStatusCode.ERROR);
        expect(span!.status.message).toBe('boom');
    });

    // 5. Error event recorded
    it('records the error as a span event on failure', async () => {
        await expect(
            withSpan('test.event', {}, async () => { throw new Error('recorded'); }),
        ).rejects.toThrow('recorded');
        const [span] = env.getSpans();
        const errorEvent = span!.events.find((e) => e.name === 'exception');
        expect(errorEvent).toBeDefined();
        expect(errorEvent!.attributes?.['exception.message']).toBe('recorded');
    });

    // 6. ConfusedAIError attributes
    it('sets error.code and error.retryable for ConfusedAIError', async () => {
        const confusedError = new ConfusedAIError({
            code: 'VALIDATION_FAILED',
            message: 'bad input',
            retryable: false,
        });
        await expect(
            withSpan('test.confused-error', {}, async () => { throw confusedError; }),
        ).rejects.toThrow();
        const [span] = env.getSpans();
        expect(span!.attributes['error.code']).toBe('VALIDATION_FAILED');
        expect(span!.attributes['error.retryable']).toBe(false);
    });

    // 7. Undefined attributes are dropped
    it('does not include attributes with undefined values', async () => {
        await withSpan('test.undefined-attr', { present: 'yes', absent: undefined }, async () => 'ok');
        const [span] = env.getSpans();
        expect(span!.attributes['present']).toBe('yes');
        expect('absent' in span!.attributes).toBe(false);
    });

    // 8. Span name
    it('uses the exact name passed to withSpan', async () => {
        await withSpan('agent.run', {}, async () => 'ok');
        const [span] = env.getSpans();
        expect(span!.name).toBe('agent.run');
    });

    // 9. Nested spans — parent/child relationship
    it('nested withSpan calls create a parent–child relationship', async () => {
        await withSpan('parent', {}, async () => {
            await withSpan('child', {}, async () => 'inner');
        });
        const spans = env.getSpans();
        // child ends first, then parent
        const child = spans.find((s) => s.name === 'child');
        const parent = spans.find((s) => s.name === 'parent');
        expect(child).toBeDefined();
        expect(parent).toBeDefined();
        expect(child!.parentSpanId).toBe(parent!.spanId);
    });

    // 10. SpanKind forwarded
    it('forwards SpanOptions.kind to the provider', async () => {
        await withSpan('test.kind', {}, async () => 'ok', { kind: SpanKind.CLIENT });
        const [span] = env.getSpans();
        expect(span!.kind).toBe(SpanKind.CLIENT);
    });

    // 15. Return value propagated
    it('propagates the function return value through the span wrapper', async () => {
        const val = await withSpan('test.return', {}, async () => ({ answer: 42 }));
        expect(val).toEqual({ answer: 42 });
    });
});

describe('withSpan — tracer identity', () => {
    it('getTracer returns an object with startActiveSpan', () => {
        const tracer = getTracer('2.0.0');
        expect(typeof tracer.startActiveSpan).toBe('function');
    });

    it('TRACER_NAME is a non-empty string', () => {
        expect(typeof TRACER_NAME).toBe('string');
        expect(TRACER_NAME.length).toBeGreaterThan(0);
    });
});

// ── Metrics smoke tests ────────────────────────────────────────────────────────

describe('Metrics — smoke tests (no-op OTEL provider)', () => {
    // 11. Counters callable
    it('all counters have an .add() method and can be called without throwing', () => {
        expect(() => {
            Metrics.agentRunsTotal.add(1, { agent_name: 'test' });
            Metrics.toolCallsTotal.add(1, { tool_name: 'echo', agent_name: 'test' });
            Metrics.toolErrorsTotal.add(1, { tool_name: 'echo' });
            Metrics.llmTokensTotal.add(100, { model: 'gpt-4o', token_type: 'input' });
            Metrics.llmCostUsd.add(0.001, { model: 'gpt-4o' });
            Metrics.llmErrorsTotal.add(1, { provider: 'openai', error_type: 'timeout' });
            Metrics.circuitBreakerOpensTotal.add(1, { service: 'llm' });
            Metrics.budgetExceededTotal.add(1, { scope: 'user' });
            Metrics.guardrailViolationsTotal.add(1, { rule: 'pii', severity: 'error' });
            Metrics.httpRequestsTotal.add(1, { agent_name: 'test', status_code: '200', method: 'POST' });
        }).not.toThrow();
    });

    // 12. Histograms callable
    it('all histograms have a .record() method and can be called without throwing', () => {
        expect(() => {
            Metrics.agentRunDurationMs.record(250, { agent_name: 'test' });
            Metrics.toolDurationMs.record(50, { tool_name: 'echo' });
            Metrics.httpRequestDurationMs.record(120, { route: '/v1/run', method: 'POST', status_code: '200' });
        }).not.toThrow();
    });

    it('httpActiveStreams (UpDownCounter) has an .add() method', () => {
        expect(() => {
            Metrics.httpActiveStreams.add(1);
            Metrics.httpActiveStreams.add(-1);
        }).not.toThrow();
    });
});

// ── Logger tests ───────────────────────────────────────────────────────────────

describe('ConsoleLogger — structured output', () => {
    // 13. JSON with correct fields
    it('emits timestamp, level, and message fields', () => {
        const lines: string[] = [];
        const log = new ConsoleLogger({ write: (l) => lines.push(l) });
        log.info('test message', { custom: 'value' });
        const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
        expect(typeof entry['timestamp']).toBe('string');
        expect(entry['level']).toBe('info');
        expect(entry['message']).toBe('test message');
        expect(entry['custom']).toBe('value');
    });

    it('child logger merges parent bindings with child bindings', () => {
        const lines: string[] = [];
        const root = new ConsoleLogger({ bindings: { service: 'api' }, write: (l) => lines.push(l) });
        const child = root.child({ traceId: 'abc123' });
        child.warn('child warn');
        const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
        expect(entry['service']).toBe('api');
        expect(entry['traceId']).toBe('abc123');
        expect(entry['level']).toBe('warn');
    });
});

// ── RequestContext ─────────────────────────────────────────────────────────────

describe('RequestContext — async propagation', () => {
    // 14. Preserves requestId across async boundaries
    it('preserves requestId across multiple awaits', async () => {
        await RequestContext.run({ requestId: 'req-span-test', tenantId: 'tenant-1' }, async () => {
            await Promise.resolve(); // yield
            expect(RequestContext.getRequestId()).toBe('req-span-test');
            await new Promise<void>((r) => setImmediate(r)); // deeper yield
            expect(RequestContext.getTenantId()).toBe('tenant-1');
        });
    });

    it('does not leak context outside the run() call', async () => {
        let insideId: string | undefined;
        await RequestContext.run({ requestId: 'scoped-id' }, async () => {
            insideId = RequestContext.getRequestId();
        });
        expect(insideId).toBe('scoped-id');
        // After the run, we should be back to undefined
        expect(RequestContext.get()).toBeUndefined();
    });

    it('nested runs shadow the outer context', async () => {
        await RequestContext.run({ requestId: 'outer' }, async () => {
            expect(RequestContext.getRequestId()).toBe('outer');
            await RequestContext.run({ requestId: 'inner' }, async () => {
                expect(RequestContext.getRequestId()).toBe('inner');
            });
            // Back to outer after nested run completes
            expect(RequestContext.getRequestId()).toBe('outer');
        });
    });
});
