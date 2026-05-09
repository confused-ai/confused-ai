import { describe, it, expect, beforeEach } from 'vitest';
import {
  PrometheusRegistry,
  defaultRegistry,
  prometheusMetricsHandler,
} from '../src/prometheus.js';

// ── PrometheusRegistry ────────────────────────────────────────────────────────

describe('PrometheusRegistry', () => {
  let reg: PrometheusRegistry;

  beforeEach(() => {
    reg = new PrometheusRegistry();
  });

  it('renders registered counter with HELP and TYPE lines', () => {
    reg.register({ name: 'req.total', type: 'counter', help: 'Total requests', samples: [] });
    reg.increment('req.total', 3, { method: 'GET' });
    const out = reg.render({ prefix: 'my_' });
    expect(out).toContain('# HELP my_req_total Total requests');
    expect(out).toContain('# TYPE my_req_total counter');
    expect(out).toContain('my_req_total{method="GET"} 3');
  });

  it('increment accumulates values across calls', () => {
    reg.register({ name: 'hits', type: 'counter', help: 'Hits', samples: [] });
    reg.increment('hits', 1);
    reg.increment('hits', 4);
    const out = reg.render({ prefix: '' });
    expect(out).toContain('hits 5');
  });

  it('record overwrites previous value', () => {
    reg.register({ name: 'gauge', type: 'gauge', help: 'G', samples: [] });
    reg.record('gauge', 10);
    reg.record('gauge', 7);
    const out = reg.render({ prefix: '' });
    expect(out).toContain('gauge 7');
  });

  it('labels are included in output', () => {
    reg.register({ name: 'errors', type: 'counter', help: 'Errors', samples: [] });
    reg.increment('errors', 2, { provider: 'openai', type: 'rate_limit' });
    const out = reg.render({ prefix: '' });
    expect(out).toContain('errors{provider="openai",type="rate_limit"} 2');
  });

  it('different label sets are separate samples', () => {
    reg.register({ name: 'calls', type: 'counter', help: 'Calls', samples: [] });
    reg.increment('calls', 1, { tool: 'search' });
    reg.increment('calls', 3, { tool: 'weather' });
    const out = reg.render({ prefix: '' });
    expect(out).toContain('calls{tool="search"} 1');
    expect(out).toContain('calls{tool="weather"} 3');
  });

  it('reset clears all samples', () => {
    reg.register({ name: 'c', type: 'counter', help: 'C', samples: [] });
    reg.increment('c', 5);
    reg.reset();
    const out = reg.render({ prefix: '' });
    // After reset, no sample lines for 'c' (only HELP/TYPE comments remain)
    const sampleLines = out.split('\n').filter((l) => l.startsWith('c '));
    expect(sampleLines).toHaveLength(0);
  });

  it('omits metadata when includeMetadata is false', () => {
    reg.register({ name: 'n', type: 'gauge', help: 'N', samples: [] });
    reg.record('n', 42);
    const out = reg.render({ prefix: '', includeMetadata: false });
    expect(out).not.toContain('# HELP');
    expect(out).not.toContain('# TYPE');
    expect(out).toContain('n 42');
  });

  it('sanitizes dots and hyphens in metric names', () => {
    reg.register({ name: 'agent.run-duration', type: 'histogram', samples: [] });
    const out = reg.render({ prefix: 'prom_' });
    expect(out).toContain('prom_agent_run_duration');
  });

  it('includes scrape timestamp line', () => {
    const out = reg.render({ prefix: '' });
    expect(out).toContain('confused_ai_scrape_time_seconds');
  });
});

// ── defaultRegistry ───────────────────────────────────────────────────────────

describe('defaultRegistry', () => {
  it('is a PrometheusRegistry instance', () => {
    expect(defaultRegistry).toBeInstanceOf(PrometheusRegistry);
  });

  it('has core confused-ai metrics pre-registered', () => {
    const out = defaultRegistry.render({ prefix: 'confused_ai_' });
    expect(out).toContain('confused_ai_agent_runs_total');
    expect(out).toContain('confused_ai_llm_tokens_total');
    expect(out).toContain('confused_ai_http_requests_total');
    expect(out).toContain('confused_ai_background_queue_depth');
  });
});

// ── prometheusMetricsHandler ──────────────────────────────────────────────────

describe('prometheusMetricsHandler', () => {
  function makeRes() {
    const res = {
      headers: {} as Record<string, string>,
      body: '',
      statusCode: 200,
      setHeader(name: string, value: string) { this.headers[name] = value; },
      end(body: string) { this.body = body; },
    };
    return res;
  }

  it('sets correct Content-Type header', () => {
    const handler = prometheusMetricsHandler();
    const res = makeRes();
    handler({}, res);
    expect(res.headers['Content-Type']).toContain('text/plain');
    expect(res.headers['Content-Type']).toContain('0.0.4');
  });

  it('sets Cache-Control: no-cache', () => {
    const handler = prometheusMetricsHandler();
    const res = makeRes();
    handler({}, res);
    expect(res.headers['Cache-Control']).toContain('no-cache');
  });

  it('response body contains metric output', () => {
    const reg = new PrometheusRegistry();
    reg.register({ name: 'test.counter', type: 'counter', help: 'Test', samples: [] });
    reg.increment('test.counter', 1);
    const handler = prometheusMetricsHandler({ registry: reg, prefix: '' });
    const res = makeRes();
    handler({}, res);
    expect(res.body).toContain('test_counter 1');
  });

  it('uses custom prefix', () => {
    const reg = new PrometheusRegistry();
    reg.register({ name: 'reqs', type: 'counter', help: 'Reqs', samples: [] });
    reg.increment('reqs', 2);
    const handler = prometheusMetricsHandler({ registry: reg, prefix: 'myapp_' });
    const res = makeRes();
    handler({}, res);
    expect(res.body).toContain('myapp_reqs 2');
  });
});
