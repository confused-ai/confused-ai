# 22 · Eval Regression Guard: CI-Safe Prompt Versioning 🟡

**Real-world problem:** Your team ships a new system prompt. Before it goes to production you need to know: "Does this change make the agent better, worse, or neutral?" Manual testing misses edge cases. Running a golden dataset + comparing to a saved baseline catches regressions before users do.

`runEvalSuite` + `EvalStore` give you a persistent, CI-friendly evaluation loop.

---

## What you'll learn

- `runEvalSuite` — run a labeled dataset, score every sample, detect baseline regression
- `InMemoryEvalStore` / `SqliteEvalStore` — persist runs + baselines across CI jobs
- `setBaseline: true` — save the first clean run as the comparison target
- `regressionThreshold` — acceptable score drop before the suite fails
- Custom scorer — word-overlap F1 for free-form answers (better than exact match)
- `EvalReport` — structured report: per-sample scores, delta, pass/fail verdict

---

## The workflow

```
                    ┌─────────────────────────────┐
New prompt v2       │  CI: eval-regression.ts     │
candidate ──────>   │                             │
                    │  1. Load golden dataset      │
                    │  2. runEvalSuite(v2)         │
                    │  3. Compare to saved baseline│
                    │                             │
                    │  Score Δ > 5%?              │
                    │    yes → exit 1, block PR   │
                    │    no  → exit 0, allow merge│
                    └─────────────────────────────┘
```

---

## Setup

```ts
import {
  InMemoryEvalStore,
  SqliteEvalStore,
  runEvalSuite,
  type EvalDatasetItem,
  type EvalReport,
  type EvalScorer,
} from 'confused-ai/observability';
```

---

## 1 · Build a golden dataset

```ts
// data/eval-dataset.json (or inline for small suites)
const DATASET: EvalDatasetItem[] = [
  {
    input: 'What is the return policy?',
    expectedOutput: 'You can return any item within 30 days for a full refund.',
  },
  {
    input: 'How do I track my order?',
    expectedOutput: 'Visit the Orders page or check your confirmation email for a tracking link.',
  },
  {
    input: 'Do you offer free shipping?',
    expectedOutput: 'Free shipping on all orders over $50.',
  },
  {
    input: 'How do I cancel my subscription?',
    expectedOutput: 'Go to Account > Subscriptions > Cancel. Takes effect at end of billing period.',
  },
  {
    input: 'Is my payment information secure?',
    expectedOutput: 'Yes. We use PCI-DSS compliant payment processing. We never store card numbers.',
  },
];
```

Keep this dataset in version control alongside your prompts. Add new cases as you discover regressions.

---

## 2 · Run baseline (first time)

```ts
import { createAgent } from 'confused-ai';

const store = new SqliteEvalStore('./evals.db'); // persists between CI runs

const agentV1 = createAgent({
  name: 'SupportBot-v1',
  model: 'gpt-4o-mini',
  instructions: 'You are a helpful customer support agent. Answer questions accurately.',
  tools: false,
});

const baseline = await runEvalSuite({
  suiteName: 'support-qa',        // stable name — used to look up past baselines
  dataset:   DATASET,
  agent:     agentV1,
  store,
  scorer:    wordOverlapF1,       // see §4 below
  passingScore:         0.6,      // each sample must score ≥ 60%
  regressionThreshold:  0.05,     // fail if average drops > 5 percentage points
  setBaseline:          true,     // ← save this run as the reference point
});

console.log(`Baseline set: ${(baseline.averageScore * 100).toFixed(1)}%`);
// Baseline set: 94.2%
```

---

## 3 · Regression check (every subsequent CI run)

```ts
const agentV2 = createAgent({
  name: 'SupportBot-v2',
  model: 'gpt-4o-mini',
  instructions: 'You are a support assistant. Be brief.',  // ← prompt change
  tools: false,
});

const report = await runEvalSuite({
  suiteName:           'support-qa',   // same suite → finds the baseline above
  dataset:             DATASET,
  agent:               agentV2,
  store,
  scorer:              wordOverlapF1,
  passingScore:        0.6,
  regressionThreshold: 0.05,           // ← fail if score drops > 5% from baseline
  onSample: (i, total, s) => {
    process.stdout.write(`  [${i}/${total}] ${s.input.slice(0, 50)}\r`);
  },
});

// EvalReport shape:
// {
//   suiteRunId:       'run_abc123',
//   suiteName:        'support-qa',
//   averageScore:     0.81,          // 81%
//   passedCount:      3,
//   totalCount:       5,
//   passed:           false,         // ← regression: 94.2% → 81% = Δ -13.2%
//   regressionDelta:  -0.132,
//   baselineScore:    0.942,
//   samples:          [...],
// }

if (!report.passed) {
  console.error(`Regression detected! Score: ${(report.averageScore * 100).toFixed(1)}%`);
  console.error(`Baseline: ${(report.baselineScore! * 100).toFixed(1)}%`);
  console.error(`Delta: ${(report.regressionDelta! * 100).toFixed(1)}%`);
  process.exit(1); // ← blocks the PR in CI
}
```

---

## 4 · Custom scorer: word-overlap F1

Exact match (`===`) is too strict for free-form support answers. Word-overlap F1 rewards partial matches:

```ts
import type { EvalScorer } from 'confused-ai/observability';

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

const wordOverlapF1: EvalScorer = (_input, expected, actual) => {
  if (!expected) return 0.5; // no label → neutral score

  const expTokens = tokenize(expected);
  const actTokens = tokenize(actual);

  let overlap = 0;
  for (const t of actTokens) if (expTokens.has(t)) overlap++;

  const precision = actTokens.size ? overlap / actTokens.size : 0;
  const recall    = expTokens.size ? overlap / expTokens.size : 0;

  return (precision + recall) ? (2 * precision * recall) / (precision + recall) : 0;
};
```

Other scorer patterns:

```ts
// ROUGE-L word overlap
import { rougeLWords } from 'confused-ai';
const rougeScorer: EvalScorer = (_, expected, actual) =>
  expected ? rougeLWords(actual, expected) : 0.5;

// LLM-as-judge (semantic, handles paraphrases)
import { runLlmAsJudge } from 'confused-ai';
const judgeScorer: EvalScorer = async (input, expected, actual) => {
  const { score } = await runLlmAsJudge({
    llm: judgeModel,
    rubric: 'Is the response accurate and helpful?',
    candidate: actual,
    reference: expected,
    maxScore: 10,
  });
  return score / 10; // normalize to 0–1
};
```

---

## 5 · Print a readable report

```ts
function printReport(report: EvalReport) {
  const pct    = (n: number) => `${(n * 100).toFixed(1)}%`;
  const arrow  = report.regressionDelta !== null
    ? (report.regressionDelta >= 0 ? '↑' : '↓') + pct(Math.abs(report.regressionDelta))
    : 'no baseline';

  console.log(`Suite    : ${report.suiteName}`);
  console.log(`Score    : ${pct(report.averageScore)}  (${report.passedCount}/${report.totalCount} passed)`);
  console.log(`Baseline : ${report.baselineScore !== null ? pct(report.baselineScore) : 'none'}`);
  console.log(`Delta    : ${arrow}`);
  console.log(`Status   : ${report.passed ? '✅ PASSED' : '❌ REGRESSION'}`);

  for (const s of report.samples) {
    const icon = s.passed ? '✓' : '✗';
    console.log(`  [${icon}] ${pct(s.score).padEnd(6)} ${s.input.slice(0, 60)}`);
  }
}
```

---

## 6 · Persistent history (SQLite)

```ts
import { SqliteEvalStore } from 'confused-ai/observability';

const store = SqliteEvalStore.create('./evals.db');
// or
const store = createSqliteEvalStore('./evals.db');
```

Query past runs:

```ts
const runs = await store.queryRuns('support-qa', 20);
for (const run of runs) {
  const flag = run.isBaseline ? ' [BASELINE]' : '';
  console.log(`${run.id.slice(0, 8)}  ${(run.averageScore * 100).toFixed(1)}%  ${run.timestamp}${flag}`);
}
```

---

## 7 · GitHub Actions CI workflow

```yaml
# .github/workflows/eval.yml
name: Eval Regression Check

on:
  pull_request:
    paths:
      - 'src/prompts/**'
      - 'src/agents/**'

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Restore eval database
        uses: actions/cache@v4
        with:
          path: ./evals.db
          key: eval-db-${{ github.base_ref }}

      - name: Run eval suite
        run: bun examples/eval-regression.ts
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          EXIT_ON_REGRESSION: '1'

      - name: Save eval database
        uses: actions/cache@v4
        with:
          path: ./evals.db
          key: eval-db-${{ github.base_ref }}
```

The SQLite file is cached per branch — your baseline survives across CI runs until you explicitly rotate it with `setBaseline: true`.

---

## 8 · Updating the baseline

When you intentionally improve the prompt, update the baseline:

```ts
// promote-baseline.ts — run manually after a validated improvement
const report = await runEvalSuite({
  suiteName:   'support-qa',
  dataset:     DATASET,
  agent:       agentV3,
  store,
  scorer:      wordOverlapF1,
  setBaseline: true,   // ← explicit promotion
});
console.log(`New baseline: ${(report.averageScore * 100).toFixed(1)}%`);
```

---

## Runnable example

```bash
bun examples/eval-regression.ts
```

Runs three back-to-back suites (v1 baseline, v2 regression, v2 fixed) using `MockLLMProvider` — no API key needed. Prints per-sample scores and the final CI verdict.

---

## Related

- [Observability & Hooks](./12-observability) — LLM-as-judge, OTLP export, Langfuse batching
- [Production Resilience](./13-production) — circuit breaker, budget enforcement
- [Full framework showcase](./17-full-framework-showcase) — see eval in a complete system
- **Guide:** [Observability](../guide/observability) — full `runEvalSuite`, `EvalStore` API reference
