---
title: Evaluation & Benchmarking
description: LLM-as-judge, ROUGE, text metrics, regression CI, dataset management, and benchmark pipelines.
outline: [2, 3]
---

# Evaluation & Benchmarking

`@confused-ai/eval` provides everything you need to measure, monitor, and improve agent quality.

## Quick start — LLM-as-judge

Single-call rubric scoring:

```ts
import { runLlmAsJudge } from 'confused-ai/eval';

const result = await runLlmAsJudge({
  llm: myProvider,
  rubric: 'Score this response for accuracy, completeness, and clarity (0–10)',
  candidate: 'The capital of France is Paris.',
  reference: 'Paris',
});

console.log(result.score);     // e.g. 9
console.log(result.rationale); // LLM explanation
```

## Multi-criteria judge

Score across multiple named dimensions:

```ts
import { createMultiCriteriaJudge } from 'confused-ai/eval';

const judge = createMultiCriteriaJudge({
  llm: myProvider,
  criteria: [
    { name: 'accuracy',     description: 'Is the answer factually correct?' },
    { name: 'completeness', description: 'Does it cover all aspects?' },
    { name: 'clarity',      description: 'Is it clearly written?' },
  ],
});

const result = await judge({
  candidate: 'The capital of France is Paris.',
  reference:  'Paris',
});

console.log(result.overallScore);         // e.g. 0.93 (normalised 0–1)
console.log(result.criteria[0]?.score);   // per-criterion score
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

// Load JSON array or JSON lines
const dataset = await loadDataset({ source: './evals/customer-support.json' });

// Load JSON Lines (.jsonl)
const jsonl = await loadDataset({ source: './evals/qa-pairs.jsonl' });

// Load CSV (specify column names)
const csv = await loadDataset({
  source:          './evals/test-cases.csv',
  inputColumn:    'question',
  expectedColumn: 'answer',
});

// Pass raw text instead of a file path
const inline = await loadDataset({
  source: '[{"input":"Hello","expected":"Hi"}]',
  raw: true,
});
```

## Eval store — persist and query results

```ts
import { createSqliteEvalStore, runEvalSuite } from 'confused-ai/eval';

const store = createSqliteEvalStore('./evals.db');
// or in-memory for tests:
// const store = new InMemoryEvalStore();

const report = await runEvalSuite({
  suiteName: 'CustomerSupport-v2',
  dataset:   dataset,          // EvalDatasetItem[]
  agent:     myAgent,
  store,
  passingScore:        0.8,    // samples below 0.8 count as failed
  regressionThreshold: 0.05,   // fail suite if score drops >5% from baseline
  concurrency:         4,
});

console.log(report.passed);     // true / false
console.log(report.score);      // overall score
console.log(report.regression); // score delta vs baseline
```

## Regression runner (CI/CD)

Fail CI if quality drops:

```ts
import { runRegression, printRegressionReport } from 'confused-ai/eval';
import { loadDataset } from 'confused-ai/eval';

const samples = await loadDataset({ source: './evals/qa.jsonl' });

const report = await runRegression({
  samples,
  run: async (input) => {
    const result = await myAgent.run({ prompt: input });
    return result.text;
  },
  score: (candidate, expected) =>
    candidate.trim() === expected?.trim() ? 1 : 0,
  threshold: 0.80,    // fail if < 80% pass
  concurrency: 4,
});

printRegressionReport(report);  // human-readable summary
if (!report.passed) process.exit(1);
```

## Text metrics (no LLM needed)

```ts
import { wordOverlapF1, rougeLWords } from 'confused-ai/eval';

// F1 word-overlap score (0–1)
const f1 = wordOverlapF1('Paris is the capital of France', 'Paris');
// → 0.33

// ROUGE-L word score (0–1)
const rouge = rougeLWords('The quick brown fox', 'The brown fox');
// → 0.75
```

## Latency and cost metrics

Record per-run metrics using the `Metrics` object from `confused-ai/observe`:

```ts
import { Metrics } from 'confused-ai/observe';

const start = Date.now();
const result = await myAgent.run({ prompt });
const durationMs = Date.now() - start;

Metrics.agentRunDurationMs.record(durationMs, { agent_name: 'eval-agent' });
Metrics.llmTokensTotal.add(result.usage?.totalTokens ?? 0, { model: 'gpt-4o', token_type: 'total' });
```

## Fine-tuning dataset generation

Generate JSONL training data from labelled examples:

```ts
import { generateDataset } from 'confused-ai/eval';
import type { TrainingExample } from 'confused-ai/eval';

const examples: TrainingExample[] = [
  { input: 'Hello',   output: 'Hello! How can I help?', score: 1.0 },
  // ... more examples
];

const jsonl = generateDataset(examples, {
  format:       'openai',    // 'openai' | 'alpaca' | 'sharegpt'
  systemPrompt: 'You are a helpful assistant.',
});

await Bun.write('./finetune-data.jsonl', jsonl);
```
