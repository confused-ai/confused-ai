# Observability

confused-ai has built-in logging, metrics, and distributed tracing via OpenTelemetry.

## Console logging

Zero-config — all agents log to console by default:

```ts
import { ConsoleLogger } from 'confused-ai/observe';

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
import { OtlpExporter } from 'confused-ai/observe';

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
import { Metrics } from 'confused-ai/observe';

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
import { EvalAggregator, ExactMatchAccuracy, LevenshteinAccuracy, wordOverlapF1, rougeLWords } from 'confused-ai/observe';

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
import { runLlmAsJudge, createMultiCriteriaJudge, runEvalBatch } from 'confused-ai/observe';
import { OpenAIProvider } from 'confused-ai/model';

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
import { sendLangfuseBatch } from 'confused-ai/observe';
import type { LangfuseIngestClientConfig } from 'confused-ai/observe';

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
import { sendLangSmithRunBatch } from 'confused-ai/observe';
import type { LangSmithRunPayload } from 'confused-ai/observe';

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
import { defineAgent } from 'confused-ai';
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
import { configureTelemetry } from 'confused-ai';

configureTelemetry({
  enabled: false,    // disable all telemetry
  endpoint: '...',   // custom OTLP endpoint
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
});
```

---

## Eval Store

`EvalStore` + `runEvalSuite()` give you a **self-hosted, persistent evaluation framework** — no external SaaS required. Run regression-detected evaluations in CI against a golden baseline.

### Quick start

```ts
import { runEvalSuite, SqliteEvalStore } from 'confused-ai/observe';
import { createAgent } from 'confused-ai';

const agent = createAgent({ name: 'qa-bot', llm, instructions: 'Answer questions accurately.' });

const store = SqliteEvalStore.create('./evals.db'); // persists across CI runs

const report = await runEvalSuite({
  suiteName: 'factual-accuracy',
  store,
  agent,
  dataset: [
    { input: 'Capital of France?',  expectedOutput: 'Paris' },
    { input: 'Capital of Germany?', expectedOutput: 'Berlin' },
    { input: 'Capital of Japan?',   expectedOutput: 'Tokyo' },
  ],
  passingScore:       0.8,  // suite fails if averageScore < 0.8
  regressionThreshold: 0.05, // fail if score drops > 5% from baseline
});

console.log(`Score: ${report.averageScore.toFixed(2)}`);
console.log(`Passed: ${report.passedCount}/${report.totalCount}`);

// CI-friendly exit code
if (!report.passed) process.exit(1);
```

### Custom scorer

The default scorer is exact string match. Provide your own for fuzzy or semantic scoring:

```ts
import { runEvalSuite } from 'confused-ai/observe';

const report = await runEvalSuite({
  suiteName: 'semantic-accuracy',
  agent,
  dataset: [...],
  scorer: async (input, expected, actual) => {
    // Return a score between 0.0 and 1.0
    if (!expected) return 1;
    const sim = cosineSimilarity(await embed(expected), await embed(actual));
    return sim;
  },
});
```

### Baseline and regression detection

Save a run as the baseline. Future runs that drop more than `regressionThreshold` below the baseline will fail.

```ts
// First run — mark as baseline
const baseline = await runEvalSuite({
  suiteName: 'factual-accuracy',
  store,
  agent,
  dataset,
  setBaseline: true,  // ← saves this run as the reference point
});

// Subsequent runs — automatically compared against baseline
const followUp = await runEvalSuite({
  suiteName: 'factual-accuracy',
  store,
  agent,
  dataset,
  regressionThreshold: 0.05, // default — fail if > 5% below baseline
});

console.log(`Baseline score: ${followUp.baselineScore}`);
console.log(`This run:       ${followUp.averageScore}`);
console.log(`Delta:          ${followUp.regressionDelta}`); // positive = improvement
```

### `EvalReport` fields

| Field | Type | Description |
|-------|------|-------------|
| `suiteRunId` | `string` | ID of this run |
| `suiteName` | `string` | Suite identifier |
| `averageScore` | `number` | Mean score across all samples |
| `passedCount` | `number` | Samples with score ≥ `passingScore` |
| `totalCount` | `number` | Total samples evaluated |
| `samples` | `EvalDatasetResult[]` | Per-sample detail |
| `passed` | `boolean` | `true` when `averageScore >= passingScore` and no regression |
| `regressionDelta` | `number \| null` | `score - baselineScore`; positive = improvement |
| `baselineScore` | `number \| null` | Baseline average score; `null` if none saved |

### `EvalStore` implementations

| Store | Import | Notes |
|-------|--------|-------|
| `InMemoryEvalStore` | `confused-ai/observability` | Dev/test — data lost on restart |
| `SqliteEvalStore.create(path)` | `confused-ai/observability` | Durable default; survives CI runs |
| `createSqliteEvalStore(path)` | `confused-ai/observability` | Factory shorthand |

### `runEvalSuite()` options reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `suiteName` | `string` | required | Name for grouping runs in the store |
| `dataset` | `EvalDatasetItem[]` | required | `{ input, expectedOutput?, metadata? }` |
| `agent` | `CreateAgentResult` | required | The agent under evaluation |
| `store` | `EvalStore` | — | Omit for transient (no persistence) |
| `scorer` | `EvalScorer` | exact match | `(input, expected, actual) => 0..1` |
| `passingScore` | `number` | `0` | Minimum per-sample score to count as passed |
| `regressionThreshold` | `number` | `0.05` | Max tolerated score drop from baseline |
| `setBaseline` | `boolean` | `false` | Save this run as the new baseline |
| `onSample` | `callback` | — | Progress hook: `(index, total, sample)` |
| `sampleTimeoutMs` | `number` | `60_000` | Per-sample agent timeout |
| `concurrency` | `number` | `1` | Run N samples concurrently |
