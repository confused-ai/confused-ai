---
title: Evaluation & Benchmarking
description: LLM-as-judge, ROUGE, text metrics, regression CI, dataset management, and benchmark pipelines.
outline: [2, 3]
---

# Evaluation & Benchmarking

`@confused-ai/eval` provides everything you need to measure, monitor, and improve agent quality.

## Quick start — LLM-as-judge

```ts
import { LLMJudge } from 'confused-ai/eval';

const judge = new LLMJudge({
  llm: myProvider,
  rubric: [
    { criterion: 'accuracy',    weight: 0.4 },
    { criterion: 'completeness', weight: 0.3 },
    { criterion: 'clarity',     weight: 0.3 },
  ],
});

const score = await judge.score({
  prompt: 'What is the capital of France?',
  response: 'The capital of France is Paris.',
  reference: 'Paris',
});

console.log(score.overall);   // 0.95
console.log(score.breakdown); // { accuracy: 1.0, completeness: 0.9, clarity: 0.95 }
```

## Benchmark pipeline

Run a dataset of test cases and get a pass/fail report:

```ts
import { runBenchmark, exactMatchScorer, llmJudgeScorer } from 'confused-ai/eval';

const report = await runBenchmark({
  dataset: [
    { input: 'Capital of France?', expected: 'Paris' },
    { input: 'Capital of Germany?', expected: 'Berlin' },
    { input: '2 + 2 = ?', expected: '4' },
  ],
  agent: myAgent,
  scorers: [
    exactMatchScorer(),
    llmJudgeScorer({ llm: myProvider }),
  ],
  passThreshold: 0.8,  // 80% accuracy required to pass
});

console.log(report.passed);       // true / false
console.log(report.score);        // 0.92
console.log(report.failedCases);  // which inputs failed
```

## Built-in scorers

```ts
import {
  exactMatchScorer,    // strict string equality
  containsScorer,      // expected string appears in response
  wordOverlapScorer,   // F1 word overlap
  rougeLScorer,        // ROUGE-L (longest common subsequence)
  llmJudgeScorer,      // LLM-as-judge with rubric
  customScorer,        // your own scoring function
} from 'confused-ai/eval';

// Custom scorer
const lengthScorer = customScorer('length', (response, expected) => {
  const diff = Math.abs(response.length - expected.length);
  return Math.max(0, 1 - diff / expected.length);
});
```

## Dataset loading

```ts
import { loadDataset } from 'confused-ai/eval';

// Load JSON
const dataset = await loadDataset('./evals/customer-support.json');

// Load JSON Lines (.jsonl)
const jsonl = await loadDataset('./evals/qa-pairs.jsonl');

// Load CSV
const csv = await loadDataset('./evals/test-cases.csv', {
  inputColumn: 'question',
  expectedColumn: 'answer',
});
```

## Eval store — persist and query results

```ts
import { createEvalStore } from 'confused-ai/eval';

const store = createEvalStore({ url: 'file:./evals.db' });

// Save a run
const runId = await store.saveRun({
  agentName: 'CustomerSupport',
  datasetName: 'support-v2',
  score: 0.87,
  cases: report.cases,
});

// Query historical runs
const history = await store.queryRuns({
  agentName: 'CustomerSupport',
  limit: 10,
});

// Detect regression
const baseline = await store.getBaseline('CustomerSupport');
if (report.score < baseline.score - 0.05) {
  throw new Error(`Regression detected: ${report.score} < ${baseline.score}`);
}
```

## Regression runner (CI/CD)

Fail CI if quality drops:

```ts
import { RegressionRunner } from 'confused-ai/eval';

const runner = new RegressionRunner({
  store,
  threshold: 0.80,          // minimum acceptable score
  regressionTolerance: 0.03, // allow 3% drop before failing
});

await runner.run({
  agent: myAgent,
  dataset,
  scorers: [exactMatchScorer(), llmJudgeScorer({ llm: myProvider })],
});
// Throws RegressionError if score < threshold or drops by > tolerance
```

## Text metrics (no LLM needed)

```ts
import { wordOverlapF1, rougeL, bleu } from 'confused-ai/eval';

const f1 = wordOverlapF1('Paris is the capital of France', 'Paris');
// → { precision: 1.0, recall: 0.2, f1: 0.33 }

const rouge = rougeL('The quick brown fox', 'The brown fox');
// → { score: 0.75 }
```

## Latency and cost metrics

```ts
import { EvalMetricsCollector } from 'confused-ai/eval';

const metrics = new EvalMetricsCollector();

const start = Date.now();
const result = await agent.run({ prompt });
metrics.record({
  latencyMs: Date.now() - start,
  tokens: result.usage?.totalTokens,
  cost: result.usage?.cost,
  steps: result.steps,
});

console.log(metrics.summary());
// { p50: 1200ms, p95: 3400ms, avgTokens: 1500, avgCost: '$0.002' }
```

## Fine-tuning dataset generation

Generate JSONL training data from agent runs:

```ts
import { generateFineTuningDataset } from 'confused-ai/eval';

const dataset = await generateFineTuningDataset({
  agent: myAgent,
  examples: [
    { input: 'Hello', expectedOutput: 'Hello! How can I help?' },
    // ... more examples
  ],
  format: 'openai',  // 'openai' | 'anthropic'
  outputFile: './finetune-data.jsonl',
});
```
