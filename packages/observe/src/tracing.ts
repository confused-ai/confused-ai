/**
 * OpenTelemetry tracing helpers.
 *
 * `withSpan` wraps an async function in an active span, attaches attributes,
 * marks errors, and ends the span — the canonical way to instrument every
 * agent run, tool call, and LLM completion.
 *
 * @module
 */
import {
  trace,
  SpanStatusCode,
  type Tracer,
  type Span,
  type SpanOptions,
} from '@opentelemetry/api';
import { isConfusedAIError } from '@confused-ai/contracts';

export const TRACER_NAME = 'confused-ai';

/**
 * Returns (or creates) the named OpenTelemetry tracer for confused-ai.
 *
 * @param version - Optional semver string; defaults to `npm_package_version` env var.
 */
export function getTracer(version?: string): Tracer {
  return trace.getTracer(TRACER_NAME, version ?? process.env['npm_package_version'] ?? '0.0.0');
}

export type SpanAttributes = Record<string, string | number | boolean | undefined>;

function cleanAttributes(attrs: SpanAttributes): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Wrap an async function in an active OTEL span.
 *
 * On success the span is marked OK; on failure the error is recorded and
 * `error.code` / `error.retryable` attributes are set for `ConfusedAIError`s.
 *
 * @param name       - Span name (e.g. `'agent.run'`, `'tool.call'`).
 * @param attributes - Initial span attributes — `undefined` values are dropped.
 * @param fn         - Async work to instrument. Receives the live `Span`.
 * @param options    - Optional `SpanOptions` forwarded to `startActiveSpan`.
 */
export async function withSpan<T>(
  name: string,
  attributes: SpanAttributes,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(
    name,
    { ...options, attributes: cleanAttributes(attributes) },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (e) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e instanceof Error ? e.message : String(e),
        });
        if (isConfusedAIError(e)) {
          span.setAttribute('error.code', e.code);
          span.setAttribute('error.retryable', e.retryable);
        }
        if (e instanceof Error) span.recordException(e);
        throw e;
      } finally {
        span.end();
      }
    },
  );
}
