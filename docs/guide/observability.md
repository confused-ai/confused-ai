---
title: Observability
description: OTLP tracing, Prometheus metrics, structured logging, and span tracking for AI agents.
outline: [2, 3]
---

# Observability

`@confused-ai/observe` provides OTLP tracing, Prometheus metrics, and structured logging. Every agent run, tool call, and LLM request is automatically instrumented.

## Structured logger

```ts
import { ConsoleLogger, LogLevel } from 'confused-ai/observe';

const logger = new ConsoleLogger({
  level: LogLevel.INFO,
  prettyPrint: process.env.NODE_ENV !== 'production',
  // Automatically masks: sk-*, AIza*, AKIA*, Bearer tokens, JSON secrets
});

logger.info('Agent started', { agentName: 'MyAgent', sessionId: 'abc' });
logger.error('Run failed', { error: err.message, runId: 'xyz' });
```

Sensitive values (API keys, JWT tokens, AWS credentials) are automatically redacted in log output.

## OTLP tracing

Export traces to any OpenTelemetry-compatible backend (Jaeger, Tempo, Honeycomb, DataDog, etc.):

```ts
import { OtelTracer } from 'confused-ai/observe';

const tracer = new OtelTracer({
  serviceName: 'my-agent-service',
  endpoint: 'http://localhost:4318/v1/traces',  // OTLP HTTP endpoint
});

await tracer.start();

// Traces are created automatically for every agent.run(), tool call, and LLM call
const result = await ai.run({ prompt: 'Hello' });
// → trace with spans: agent.run → agentic.step → llm.generate → tool.call
```

### Environment-based config

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
OTEL_SERVICE_NAME=my-agent-service
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```

```ts
import { OtelTracer } from 'confused-ai/observe';

// Reads OTEL_* env vars automatically
const tracer = new OtelTracer({ fromEnv: true });
```

## Prometheus metrics

Expose a `/metrics` endpoint for Prometheus scraping:

```ts
import { PrometheusMetrics } from 'confused-ai/observe';
import { serve } from 'confused-ai';

const metrics = new PrometheusMetrics({
  prefix: 'agent_',
  labels: { service: 'my-agent', env: 'production' },
});

await serve(ai, { port: 3000, metrics });
// GET /metrics → Prometheus text format
```

Default metrics exposed:
- `agent_runs_total` — total agent runs by finish reason
- `agent_run_duration_seconds` — run latency histogram
- `agent_steps_per_run` — ReAct steps histogram
- `agent_tool_calls_total` — tool invocations by tool name
- `agent_llm_tokens_total` — token usage by type (prompt/completion)
- `agent_errors_total` — errors by type
- `agent_circuit_breaker_state` — circuit breaker status

## Custom metrics

```ts
import { MetricsCollector } from 'confused-ai/observe';

const metrics = new MetricsCollector();

// Counter
metrics.increment('custom.events', 1, { event: 'user_query' });

// Gauge
metrics.gauge('active_sessions', sessionCount);

// Histogram
metrics.histogram('embedding_time_ms', duration);
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
