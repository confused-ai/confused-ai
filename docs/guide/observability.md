---
title: Observability
description: OTLP tracing, Prometheus metrics, structured logging, and span tracking for AI agents.
outline: [2, 3]
---

# Observability

`@confused-ai/observe` provides OTLP tracing, Prometheus metrics, and structured logging. Every agent run, tool call, and LLM request is automatically instrumented.

## Structured logger

```ts
import { ConsoleLogger } from 'confused-ai/observe';
import type { LogLevel } from 'confused-ai/observe';

const logger = new ConsoleLogger({
  level: 'info',  // LogLevel is 'debug' | 'info' | 'warn' | 'error'
  // Automatically masks: sk-*, AIza*, AKIA*, Bearer tokens, JSON secrets
});

logger.info('Agent started', { agentName: 'MyAgent', sessionId: 'abc' });
logger.error('Run failed', { error: err.message, runId: 'xyz' });
```

Sensitive values (API keys, JWT tokens, AWS credentials) are automatically redacted in log output.

## OTLP tracing

The framework is instrumented with OpenTelemetry. Plug in your own OTEL SDK setup and every `agent.run()`, tool call, and LLM request automatically emits spans.

```ts
// 1. Set up OTEL (standard SDK — not confused-ai-specific)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  serviceName: 'my-agent-service',
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
});
sdk.start();

// 2. Use withSpan() from confused-ai/observe for custom spans
import { withSpan } from 'confused-ai/observe';

const result = await withSpan('my-custom-step', async (span) => {
  span.setAttribute('user_id', userId);
  return await ai.run({ prompt });
});
```

### Environment-based OTEL config

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
OTEL_SERVICE_NAME=my-agent-service
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```

```ts
// OTEL env vars are picked up automatically by the NodeSDK
// OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME, OTEL_RESOURCE_ATTRIBUTES
```

## Prometheus metrics

Expose a `/metrics` endpoint for Prometheus scraping:

```ts
import { createPrometheusHandler } from 'confused-ai/observe';
import { createHttpService } from 'confused-ai/serve';

// Standalone handler — plug into any HTTP framework
const metricsHandler = createPrometheusHandler({
  extraLabels: { service: 'my-agent', env: 'production' },
});

// Hono / Express example:
app.get('/metrics', metricsHandler);
```

Or scrape the metrics text directly:

```ts
import { scrapePrometheusMetrics } from 'confused-ai/observe';

const text = await scrapePrometheusMetrics({ service: 'my-agent' });
// text is Prometheus exposition format
```

Default metrics exposed:
- `agent_runs_total` — total agent runs by finish reason
- `agent_run_duration_seconds` — run latency histogram
- `agent_steps_per_run` — ReAct steps histogram
- `agent_tool_calls_total` — tool invocations by tool name
- `agent_llm_tokens_total` — token usage by type (prompt/completion)
- `agent_errors_total` — errors by type
- `agent_circuit_breaker_state` — circuit breaker status

## Built-in metrics

The framework records these OpenTelemetry metrics automatically via the `Metrics` object:

```ts
import { Metrics } from 'confused-ai/observe';

// Record custom attributes on existing meters
Metrics.agentRunsTotal.add(1, { agent_name: 'SupportAgent' });
Metrics.toolCallsTotal.add(1, { tool_name: 'search', agent_name: 'SupportAgent' });
```

## Hooks-based observability

Use lifecycle hooks to emit custom telemetry:

```ts
const ai = agent({
  model: 'gpt-4o',
  hooks: {
    beforeRun: async (ctx) => {
      span.setAttributes({ prompt_length: ctx.prompt.length });
    },
    afterRun: async (result) => {
      metrics.histogram('run_steps', result.steps);
      metrics.increment('tokens_used', result.usage?.totalTokens ?? 0);
    },
    beforeToolCall: async (tool, args) => {
      logger.debug('Tool call', { tool: tool.id, args });
    },
    afterToolCall: async (tool, result, duration) => {
      metrics.histogram('tool_latency_ms', duration, { tool: tool.id });
    },
    onError: async (err) => {
      alerts.send({ severity: 'error', error: err.message });
    },
  },
});
```

## Span tracking

Create custom spans within tool execute functions:

```ts
import { createSpan } from 'confused-ai/observe';

const myTool = tool({
  id: 'analyse',
  execute: async ({ data }) => {
    return createSpan('analyse.process', async (span) => {
      span.setAttribute('data.size', data.length);
      const result = await processData(data);
      span.setAttribute('result.count', result.length);
      return result;
    });
  },
});
```

## OpenTelemetry graph plugin

Instrument graph/DAG executions with OTLP:

```ts
import { OpenTelemetryPlugin } from 'confused-ai/graph';

const graph = createGraph({
  plugins: [new OpenTelemetryPlugin({ tracer })],
});
```

Each graph node gets its own span, nested under the root execution span.

## Request context propagation

```ts
import { RequestContext } from 'confused-ai/observe';

// Attach trace context to incoming requests
app.use((req, res, next) => {
  RequestContext.run({ traceId: req.headers['x-trace-id'] }, next);
});
```
