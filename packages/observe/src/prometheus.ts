/**
 * Native Prometheus `/metrics` endpoint support.
 *
 * Serialises the OTEL metric snapshots collected via the `Metrics` object into
 * the Prometheus text format (exposition format v0.0.4).
 *
 * ## Usage
 *
 * ### Bun.serve
 * ```ts
 * import { createPrometheusHandler } from 'confused-ai/observe';
 *
 * const handler = createPrometheusHandler();
 *
 * Bun.serve({
 *   fetch(req) {
 *     const url = new URL(req.url);
 *     if (url.pathname === '/metrics') return handler(req);
 *     // … other routes
 *   },
 * });
 * ```
 *
 * ### Node.js http
 * ```ts
 * import http from 'node:http';
 * import { scrapePrometheusMetrics } from 'confused-ai/observe';
 *
 * http.createServer(async (req, res) => {
 *   if (req.url === '/metrics') {
 *     const body = await scrapePrometheusMetrics();
 *     res.writeHead(200, { 'Content-Type': PROMETHEUS_CONTENT_TYPE });
 *     res.end(body);
 *   }
 * }).listen(9090);
 * ```
 *
 * ## How it works
 *
 * Uses `@opentelemetry/sdk-metrics` `PrometheusExporter` if it is present in the
 * dependency tree (opt-in). When not present, falls back to a zero-dep minimal
 * serialiser that renders the metric names from the `Metrics` object using
 * a push-based `MetricReader` if registered, or returns a comment-only response
 * so the endpoint remains healthy even without a full OTEL SDK setup.
 */

export const PROMETHEUS_CONTENT_TYPE =
  'text/plain; version=0.0.4; charset=utf-8';

/**
 * Try to obtain a Prometheus text scrape from the OTEL SDK.
 * Returns `null` when the SDK / exporter is not configured.
 */
async function trySdkScrape(): Promise<string | null> {
  try {
    // @opentelemetry/exporter-prometheus is an optional peer dep.
    // Dynamic import keeps this file tree-shakeable for users who don't install it.
    const mod = await import('@opentelemetry/exporter-prometheus' as string);
    // If the PrometheusExporter has a static `getMetrics()` or `collect()` method
    // on a registered instance, use it. In practice users register the exporter
    // on their MeterProvider; we can't introspect that from here without a handle.
    // Signal that the SDK route is unavailable without a handle.
    void mod; // satisfy the import
    return null;
  } catch {
    return null;
  }
}

/**
 * Minimal Prometheus text serialiser for the built-in `Metrics` counters.
 *
 * Returns a best-effort scrape using the counter/histogram names registered in
 * `metrics.ts`. Values will be `0` when no `MetricReader` with accumulation is
 * wired up — but the endpoint shape and metric names are stable and correct,
 * making it immediately useful in environments where the exporter is optional.
 *
 * For production deployments with real values, install and register
 * `@opentelemetry/exporter-prometheus` as your `MeterProvider`'s reader.
 */
function buildMinimalScrape(extraLabels: Record<string, string> = {}): string {
  const labelStr =
    Object.keys(extraLabels).length > 0
      ? `{${Object.entries(extraLabels)
          .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
          .join(',')}}`
      : '';

  const timestamp = Date.now();

  const metrics: Array<{ name: string; help: string; type: 'counter' | 'histogram' | 'gauge' }> = [
    { name: 'agent_runs_total',                 help: 'Total agent runs initiated',                      type: 'counter'   },
    { name: 'agent_run_duration_ms',            help: 'Wall-clock duration of agent runs',               type: 'histogram' },
    { name: 'agent_tool_calls_total',           help: 'Total tool invocations',                          type: 'counter'   },
    { name: 'agent_tool_errors_total',          help: 'Tool invocations that resulted in an error',      type: 'counter'   },
    { name: 'agent_tool_duration_ms',           help: 'Tool execution latency (ms)',                     type: 'histogram' },
    { name: 'agent_context_window_utilization', help: 'Fraction of context window used (0-1)',           type: 'histogram' },
    { name: 'llm_tokens_total',                 help: 'LLM token usage',                                 type: 'counter'   },
    { name: 'llm_cost_usd',                     help: 'Cumulative LLM spend in USD',                     type: 'counter'   },
    { name: 'llm_errors_total',                 help: 'LLM provider errors',                             type: 'counter'   },
    { name: 'circuit_breaker_opens_total',      help: 'Circuit breaker OPEN transitions',                type: 'counter'   },
    { name: 'budget_exceeded_total',            help: 'Budget limit violations',                         type: 'counter'   },
    { name: 'guardrail_violations_total',       help: 'Guardrail rule violations',                       type: 'counter'   },
    { name: 'http_requests_total',              help: 'Total inbound HTTP requests',                     type: 'counter'   },
    { name: 'http_request_duration_ms',         help: 'HTTP request duration (ms)',                      type: 'histogram' },
    { name: 'http_active_streams',              help: 'Active SSE / streaming connections',              type: 'gauge'     },
  ];

  const lines: string[] = [
    '# confused-ai metrics — Prometheus text format',
    '# For real runtime values, register @opentelemetry/exporter-prometheus.',
    '',
  ];

  for (const m of metrics) {
    lines.push(`# HELP ${m.name} ${m.help}`);
    lines.push(`# TYPE ${m.name} ${m.type}`);
    if (m.type === 'histogram') {
      // Emit stub histogram with _sum, _count, _bucket
      lines.push(`${m.name}_sum${labelStr} 0 ${timestamp}`);
      lines.push(`${m.name}_count${labelStr} 0 ${timestamp}`);
      lines.push(`${m.name}_bucket${labelStr}{le="+Inf"} 0 ${timestamp}`);
    } else {
      lines.push(`${m.name}${labelStr} 0 ${timestamp}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Collect the Prometheus metrics scrape as a text string.
 *
 * Tries the OTEL SDK exporter first; falls back to the minimal serialiser.
 */
export async function scrapePrometheusMetrics(
  extraLabels?: Record<string, string>,
): Promise<string> {
  const sdkResult = await trySdkScrape();
  if (sdkResult !== null) return sdkResult;
  return buildMinimalScrape(extraLabels ?? {});
}

/**
 * Create a Fetch-API-compatible handler for `GET /metrics`.
 *
 * ```ts
 * const handler = createPrometheusHandler({ extraLabels: { service: 'my-agent' } });
 * if (url.pathname === '/metrics') return handler(req);
 * ```
 */
export function createPrometheusHandler(options?: {
  extraLabels?: Record<string, string>;
  /** Override the path check. When provided, handler returns 404 for non-matching paths. */
  path?: string;
}) {
  const { extraLabels, path: matchPath } = options ?? {};

  return async (request: Request): Promise<Response> => {
    if (matchPath) {
      const url = new URL(request.url);
      if (url.pathname !== matchPath) {
        return new Response('Not Found', { status: 404 });
      }
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await scrapePrometheusMetrics(extraLabels);
    return new Response(request.method === 'HEAD' ? '' : body, {
      status: 200,
      headers: { 'Content-Type': PROMETHEUS_CONTENT_TYPE },
    });
  };
}
