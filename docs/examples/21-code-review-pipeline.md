# 21 · Code Review Pipeline: bare() + compose() + pipe() 🔴

**Real-world problem:** Your team wants an automated first-pass code review on every PR. A single agent doing "review this diff" produces mediocre results. Three specialized agents — diff analyst, security reviewer, report writer — chained together produce precise, actionable feedback.

The **Freedom Layer** lets you compose specialist agents with zero boilerplate.

---

## What you'll learn

- `bare()` — zero-defaults agent: you control LLM, tools, hooks, everything
- `compose(a, b, c)` — pipe N agents sequentially; output of each → input of next
- `pipe(a).then(b).then(c).run(prompt)` — identical semantics with a stepwise builder
- `compose(a, b, { when, transform })` — conditional hand-off: skip expensive steps for low-risk diffs
- Lifecycle hooks: `afterRun`, `buildSystemPrompt`

---

## The architecture

```
PR Diff
  │
  ▼
DiffAnalyser          ← bare() — what changed? risk level? blast radius?
  │  output: structured diff summary
  ▼
SecurityReviewer       ← bare() — SQL injection? secrets? auth flaws?
  │  output: findings with severity + line refs
  ▼
ReportWriter           ← bare() — GitHub review comment (Markdown)
  │  output: APPROVE / REQUEST CHANGES + table
  ▼
POST /repos/:owner/:repo/pulls/:number/reviews
```

---

## 1 · bare() — absolute zero defaults

`bare()` gives you an agent with nothing injected — no tools, no session, no guardrails. You own every decision:

```ts
import { bare } from 'confused-ai';
import { OpenAIProvider } from 'confused-ai';

const llm = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o' });

const diffAnalyser = bare({
  name:         'DiffAnalyser',
  instructions: `
    You are a senior engineer reviewing a git diff.
    Identify: changed files, lines added/removed, affected systems, risk level (LOW/MEDIUM/HIGH/CRITICAL).
    Output a structured Markdown summary — do NOT suggest fixes yet.
  `,
  llm,
  maxSteps:   1,       // single-shot — no ReAct loop needed
  timeoutMs:  30_000,
  hooks: {
    afterRun: (result) => {
      metrics.histogram('review.diff_analysis_ms', Date.now() - start);
      return result;
    },
  },
});
```

| `bare()` vs `createAgent()` | bare | createAgent |
|---|---|---|
| Tools injected by default | ❌ | ✅ (HttpClient + Browser) |
| Session store created | ❌ | ✅ (InMemorySessionStore) |
| LLM auto-resolved from env | ❌ | ✅ |
| Guardrails | ❌ | ❌ (opt-in) |

Use `bare()` when you want **total control**. Use `createAgent()` when you want **sensible defaults**.

---

## 2 · compose() — sequential pipeline

```ts
import { bare, compose } from 'confused-ai';

const diffAnalyser    = bare({ name: 'DiffAnalyser',    instructions: '...', llm });
const securityReviewer = bare({ name: 'SecurityReviewer', instructions: '...', llm });
const reportWriter    = bare({ name: 'ReportWriter',    instructions: '...', llm });

// Output of each agent becomes the prompt of the next
const reviewPipeline = compose(diffAnalyser, securityReviewer, reportWriter);

const result = await reviewPipeline.run(prDiff);
// result = ReportWriter's output
console.log(result.text); // → GitHub review comment Markdown
```

**How data flows:**
1. `prDiff` → `DiffAnalyser.run(prDiff)` → `diff summary`
2. `diff summary` → `SecurityReviewer.run(diff summary)` → `security findings`
3. `security findings` → `ReportWriter.run(security findings)` → `review comment`

---

## 3 · compose with transform — reshape between agents

```ts
const pipeline = compose(diffAnalyser, securityReviewer, {
  // Add framing context before handing off to SecurityReviewer
  transform: (diffResult, stepIndex) =>
    `DIFF ANALYSIS (step ${stepIndex}):\n\n${diffResult.text}\n\n` +
    `Now perform a full security review of the changes above.`,
});
```

---

## 4 · compose with when — skip expensive steps

For low-risk diffs (docs, config, tests) you don't need a security review:

```ts
const conditionalPipeline = compose(diffAnalyser, securityReviewer, reportWriter, {
  // Only escalate to SecurityReviewer when the diff touches HIGH-risk files
  when: (result, stepIndex) => {
    if (stepIndex === 0) {
      // After DiffAnalyser: only continue if risk is HIGH or CRITICAL
      return result.text.includes('HIGH') || result.text.includes('CRITICAL');
    }
    return true; // always continue from SecurityReviewer → ReportWriter
  },
});

// Low-risk diff (docs change): stops after DiffAnalyser
const docsResult = await conditionalPipeline.run(docsDiff);
// High-risk diff (auth change): runs all three agents
const authResult = await conditionalPipeline.run(authDiff);
```

---

## 5 · pipe() — stepwise builder

`pipe()` is identical to `compose()` but reads more naturally when you build the chain incrementally:

```ts
import { pipe } from 'confused-ai';

const result = await pipe(diffAnalyser)
  .then(securityReviewer)
  .then(reportWriter)
  .run(prDiff);
```

Useful when agents come from different modules and you want explicit type-checking at each `.then()`.

---

## 6 · Full production example

```ts
// code-review.ts
import { bare, compose } from 'confused-ai';
import { OpenAIProvider, AnthropicProvider } from 'confused-ai';
import { CircuitBreaker } from 'confused-ai';

const gpt4o  = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY!,    model: 'gpt-4o' });
const claude = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-opus-4-5' });

// Use Claude for security review — better at finding subtle vulnerabilities
const diffAnalyser = bare({
  name: 'DiffAnalyser',
  instructions: 'Analyse the git diff. Output: changed files, risk level, one-paragraph summary.',
  llm: gpt4o,
  maxSteps: 1,
});

const securityReviewer = bare({
  name: 'SecurityReviewer',
  instructions: `
    Security expert reviewing a code diff.
    Check for: SQL injection, XSS, CSRF, hardcoded secrets, auth bypasses, path traversal.
    For each finding: severity (CRITICAL/HIGH/MEDIUM/LOW), file, line, issue, fix.
  `,
  llm: claude,   // frontier model for security
  maxSteps: 1,
  hooks: {
    buildSystemPrompt: (instructions) =>
      `${instructions}\n\nOWASP Top 10 reference: https://owasp.org/Top10/`,
  },
});

const reportWriter = bare({
  name: 'ReportWriter',
  instructions: `
    Write a GitHub PR review comment in Markdown.
    Verdict: APPROVE if no issues, REQUEST CHANGES if critical/high issues found.
    Include: findings table (file, line, severity, issue), passing checks list.
  `,
  llm: gpt4o,
  maxSteps: 1,
});

// Wrap the full pipeline in a circuit breaker
const breaker = new CircuitBreaker({ name: 'code-review', failureThreshold: 3, resetTimeoutMs: 60_000 });

export async function reviewPR(diff: string): Promise<string> {
  const pipeline = compose(diffAnalyser, securityReviewer, reportWriter, {
    when: (result, step) => step === 0 ? !result.text.includes('LOW') : true,
  });

  const result = await breaker.execute(() => pipeline.run(diff));
  return result.value!.text;
}
```

---

## 7 · GitHub Actions integration

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate diff
        run: git diff origin/main...HEAD > /tmp/pr.diff

      - name: AI Review
        run: bun run scripts/code-review.ts /tmp/pr.diff
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
```

---

## Runnable example

```bash
bun examples/code-review-pipeline.ts
```

Uses `MockLLMProvider` — deterministic output, no API key needed. Demonstrates all three composition styles: `compose()`, `pipe()`, and conditional `when` hand-off.

---

## Related

- [Production Resilience](./13-production) — circuit breaker around the pipeline
- [Observability & Hooks](./12-observability) — lifecycle hooks on each agent
- [Supervisor Workflow](./09-supervisor) — when you need dynamic delegation instead of fixed pipeline
- **Guide:** [DX — Agents](../guide/agents) — full `bare()`, `compose()`, `pipe()` API reference
