# Observability

fluxion has built-in logging, metrics, and distributed tracing via OpenTelemetry.

## Console logging

Zero-config — all agents log to console by default:

```ts
import { ConsoleLogger } from 'fluxion/observability';

const logger = new ConsoleLogger({ level: 'info' }); // debug | info | warn | error

const myAgent = agent({
  model: 'gpt-4o',
  instructions: '...',
  logger,
});
```

## OpenTelemetry tracing

Export traces to any OTLP-compatible backend (Jaeger, Zipkin, Honeycomb, Datadog, etc.):

```ts
import { OtlpExporter } from 'fluxion/observability';

const exporter = new OtlpExporter({
  endpoint: 'http://localhost:4318/v1/traces', // OTLP HTTP endpoint
  headers: { 'x-honeycomb-team': process.env.HONEYCOMB_API_KEY! },
});

const myAgent = agent({
  model: 'gpt-4o',
  instructions: '...',
  tracer: exporter.getTracer('my-service'),
});
```

## Metrics

Track latency, token usage, error rates, and custom counters:

```ts
import { Metrics } from 'fluxion/observability';

const metrics = new Metrics({
  exporter: 'console', // or 'otlp' with endpoint
});

// Automatic metrics for all agent runs:
// - agent.run.duration (histogram, ms)
// - agent.run.tokens.input (counter)
// - agent.run.tokens.output (counter)
// - agent.tool.calls (counter, by tool name)
// - agent.errors (counter, by error type)

// Custom metrics
const orderCount = metrics.counter('orders.processed');
orderCount.add(1, { region: 'us-east-1' });
```

## Eval / evaluation

Score agent outputs against expected results using built-in accuracy scorers:

```ts
import { EvalAggregator, ExactMatchAccuracy, LevenshteinAccuracy, wordOverlapF1, rougeLWords } from 'fluxion/observability';

const aggregator = new EvalAggregator([
  new ExactMatchAccuracy(),
  new LevenshteinAccuracy(),
]);

const results = aggregator.run([
  { prediction: 'Paris', reference: 'Paris' },
  { prediction: 'Rome', reference: 'Paris' },
]);

console.log(results);
// { exactMatch: 0.5, levenshtein: 0.6, ... }

// Or individual scorers:
const f1 = wordOverlapF1('TypeScript is great', 'TypeScript is awesome');  // → 0.67
const rouge = rougeLWords('the cat sat', 'the cat sat on the mat');        // → 0.75
```

## LLM-as-judge

Use an LLM to score agent outputs with a rubric — ideal for open-ended evaluations where exact-match scorers fall short.

```ts
import { runLlmAsJudge, createMultiCriteriaJudge, runEvalBatch } from 'fluxion/observability';
import { OpenAIProvider } from 'fluxion/llm';

const llm = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o-mini' });

// Single judgment
const result = await runLlmAsJudge({
  llm,
  rubric: 'Is the response factually accurate and concise?',
  candidate: 'The Eiffel Tower is in Rome.',
  reference: 'The Eiffel Tower is in Paris.',
  maxScore: 10,
});
console.log(result.score);     // e.g. 2
console.log(result.rationale); // 'Incorrect city — the tower is in Paris, not Rome.'

// Multi-criteria judgment
const judge = createMultiCriteriaJudge({
  llm,
  criteria: [
    { name: 'accuracy', description: 'Factual correctness', weight: 2 },
    { name: 'clarity',  description: 'Clear and readable prose', weight: 1 },
  ],
});

const multiResult = await judge.judge({
  candidate: 'Paris is the capital of France.',
  reference: 'Paris is the capital of France.',
});
console.log(multiResult.totalScore); // weighted aggregate

// Batch eval
const batchResults = await runEvalBatch({
  llm,
  cases: [
    { input: 'Capital of France?', output: 'Paris', reference: 'Paris' },
    { input: 'Capital of Germany?', output: 'Munich', reference: 'Berlin' },
  ],
  rubric: 'Is the answer correct?',
});
console.log(batchResults.summary); // { pass: 1, fail: 1, avgScore: 5.5 }
```

Built-in criteria presets: `RAG_CRITERIA` (faithfulness, relevance, completeness) and `AGENT_CRITERIA` (task completion, efficiency, safety).

## External trace ingestion (Langfuse / LangSmith)

Send traces and run data to Langfuse or LangSmith without requiring their full SDK.

### Langfuse

```ts
import { sendLangfuseBatch } from 'fluxion/observability';
import type { LangfuseIngestClientConfig } from 'fluxion/observability';

const config: LangfuseIngestClientConfig = {
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  // baseUrl: 'https://cloud.langfuse.com', // default
};

// Batch ingest trace events — call this in your afterRun hook
await sendLangfuseBatch(config, [
  {
    type: 'trace-create',
    body: { id: runId, name: 'agent.run', input: prompt, output: responseText },
  },
]);
```

### LangSmith

```ts
import { sendLangSmithRunBatch } from 'fluxion/observability';
import type { LangSmithRunPayload } from 'fluxion/observability';

const run: LangSmithRunPayload = {
  id: runId,
  name: 'agent.run',
  run_type: 'chain',
  inputs: { prompt },
  outputs: { text: responseText },
  start_time: startTs,
  end_time: Date.now(),
};

await sendLangSmithRunBatch(
  { apiKey: process.env.LANGCHAIN_API_KEY! },
  [run]
);
```

## Lifecycle hooks for custom observability

The most flexible option — use hooks to plug in any observability stack:

```ts
import { defineAgent } from 'fluxion';
import * as Sentry from '@sentry/node';

const myAgent = defineAgent({
  model: 'gpt-4o',
  instructions: '...',
}).hooks({
  beforeRun: async (ctx) => {
    ctx.metadata.sentryTx = Sentry.startTransaction({
      name: 'agent.run',
      op: 'ai.agent',
    });
  },

  afterRun: async (output, ctx) => {
    (ctx.metadata.sentryTx as Sentry.Transaction).finish();
  },

  onError: async (error, ctx) => {
    Sentry.captureException(error);
    (ctx.metadata.sentryTx as Sentry.Transaction).finish();
  },
});
```

## Telemetry (built-in)

Framework-level telemetry is captured automatically. Opt out if needed:

```ts
import { configureTelemetry } from 'fluxion';

configureTelemetry({
  enabled: false,    // disable all telemetry
  endpoint: '...',   // custom OTLP endpoint
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
});
```
