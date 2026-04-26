# 19 · Chain-of-Thought Reasoning: Incident Triage Bot 🔴

**Real-world problem:** It's 3am. PagerDuty fires — "API error rate > 5%". You need a structured diagnosis, not a single-shot guess that might miss the root cause.

`ReasoningManager` drives chain-of-thought (CoT) analysis. Each step produces a structured `action → result → next_action` triple. Events stream in real time so your on-call engineer can watch the reasoning unfold.

---

## What you'll learn

- `ReasoningManager` — wire any LLM to multi-step CoT reasoning
- Streaming `ReasoningEvent`s (`STARTED` → `STEP` → `COMPLETED`)
- `NextAction` loop: `continue` → `validate` → `final_answer`
- How to surface the final diagnosis with confidence scores

---

## The problem

Your HTTP API starts returning 504s at 03:17 UTC. You have:
- Error rate: 8.3% (threshold: 5%)
- Affected endpoint: `POST /v1/orders`
- DB latency spike: p99 = 4.2s (baseline: 80ms)
- Deployment: `orders-service v2.4.1` went out at 03:10 UTC

You need the **root cause** and a **remediation plan** in minutes.

---

## Setup

```ts
import { ReasoningManager } from 'confused-ai/reasoning';
import { NextAction, ReasoningEventType } from 'confused-ai/reasoning';
```

---

## 1 · Wire a generate function

`ReasoningManager` is LLM-agnostic. Pass any `generate` function:

```ts
import { OpenAIProvider } from 'confused-ai';

const llm = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o',
});

// ReasoningManager only needs a simple message-in → string-out function
const generate = async (messages: Array<{ role: string; content: string }>) => {
  const result = await llm.generate(
    messages.map(m => ({ role: m.role as 'user' | 'system' | 'assistant', content: m.content })),
  );
  return result.content;
};
```

---

## 2 · Create the manager

```ts
import { ReasoningManager } from 'confused-ai/reasoning';

const manager = new ReasoningManager({
  generate,
  minSteps: 2,   // always think through at least 2 steps
  maxSteps: 8,   // hard cap — never loop forever
  debug: false,  // set true to log raw LLM output
});
```

| Config | Default | Description |
|--------|---------|-------------|
| `generate` | required | LLM callable |
| `minSteps` | `1` | Minimum reasoning steps before `FINAL_ANSWER` |
| `maxSteps` | `10` | Hard cap on steps |
| `systemPrompt` | built-in | Override the CoT system prompt |
| `debug` | `false` | Log raw LLM JSON output |

---

## 3 · Stream reasoning events

```ts
const INCIDENT = `
INCIDENT — SEV-1
Alert: API error rate > 5% (current: 8.3%)
Affected: POST /v1/orders → HTTP 504
DB latency: p99 = 4.2s (baseline 80ms)
Deployment: orders-service v2.4.1 at 03:10 UTC
Diagnose root cause and suggest remediation.
`;

const messages = [{ role: 'user', content: INCIDENT }];

for await (const event of manager.reason(messages)) {
  switch (event.eventType) {
    case ReasoningEventType.STARTED:
      console.log('Reasoning started…');
      break;

    case ReasoningEventType.STEP: {
      const { title, action, result, reasoning, nextAction, confidence } = event.step!;
      console.log(`\nStep: ${title}`);
      console.log(`  Action   : ${action}`);
      console.log(`  Result   : ${result}`);
      console.log(`  Rationale: ${reasoning}`);
      console.log(`  Next     : ${nextAction}  (confidence: ${(confidence! * 100).toFixed(0)}%)`);
      break;
    }

    case ReasoningEventType.COMPLETED:
      console.log('\nReasoning complete.');
      console.log(`Steps taken: ${event.steps!.length}`);
      break;

    case ReasoningEventType.ERROR:
      console.error('Reasoning failed:', event.error);
  }
}
```

---

## 4 · The NextAction loop explained

```
STARTED
  │
  ▼
STEP (nextAction: "continue")   ← gather evidence, explore hypotheses
  │
  ▼
STEP (nextAction: "continue")   ← narrow the blast radius
  │
  ▼
STEP (nextAction: "validate")   ← cross-check before committing
  │
  ▼
STEP (nextAction: "final_answer") ← confident, validated conclusion
  │
  ▼
COMPLETED  {steps: ReasoningStep[]}
```

| `nextAction` | Meaning |
|---|---|
| `continue` | More evidence needed — keep reasoning |
| `validate` | Strong hypothesis — cross-check before committing |
| `final_answer` | Confident, validated — stop |
| `reset` | Critical error detected — restart analysis |

---

## 5 · Full incident response output

```
Step 1: Gather telemetry signals
  Action   : Check error rate trend, affected endpoints, upstream dependencies
  Result   : Spike at 03:17 UTC — confined to POST /v1/orders. DB p99 = 4.2s.
  Next     : continue  (confidence: 75%)

Step 2: Check recent deployments
  Action   : Review deployment history for past 2 hours
  Result   : orders-service v2.4.1 at 03:10 UTC — 7 min before incident.
  Next     : continue  (confidence: 85%)

Step 3: Analyse the new DB query
  Action   : Inspect query introduced in v2.4.1
  Result   : SELECT * FROM inventory WHERE product_id = $1 — no index on product_id.
             Full-table scan at 3,200 orders/min = 4s+ latency.
  Next     : validate  (confidence: 92%)

Step 4: Validate root cause
  Action   : Cross-check: is product_id indexed in staging? Rollback simulation?
  Result   : Confirmed — missing migration in prod. Rollback projection: DB returns to baseline.
  Next     : final_answer  (confidence: 97%)
```

**Remediation plan generated:**

```
1. IMMEDIATE  — Roll back orders-service to v2.4.0
2. SHORT-TERM — Run missing migration: CREATE INDEX CONCURRENTLY ...
3. MEDIUM-TERM — Add migration-run CI gate; query EXPLAIN ANALYZE test
4. POST-MORTEM — Lower DB alerting threshold; schedule retrospective
```

---

## 6 · Production patterns

### Using with a real LLM

```ts
// OpenAI
const llm = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o' });

// Anthropic
const llm = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-opus-4-5' });

const generate = async (msgs: Array<{ role: string; content: string }>) => {
  const r = await llm.generate(msgs as Message[]);
  return r.content;
};
```

### Custom system prompt for your domain

```ts
const manager = new ReasoningManager({
  generate,
  systemPrompt: `You are an expert database administrator.
Analyse database incidents step-by-step.
Format each step as JSON with keys: title, action, result, reasoning, nextAction, confidence.`,
});
```

### Collect steps for storage / audit

```ts
const completedSteps: ReasoningStep[] = [];

for await (const event of manager.reason(messages)) {
  if (event.eventType === ReasoningEventType.STEP) {
    completedSteps.push(event.step!);
  }
  if (event.eventType === ReasoningEventType.COMPLETED) {
    await auditStore.save({ incidentId, steps: completedSteps });
  }
}
```

---

## Runnable example

```bash
bun examples/reasoning-agent.ts
```

The example uses a deterministic mock LLM — no API key needed. The 4-step incident triage runs end-to-end and prints the full remediation plan.

---

## Related

- [Observability & Hooks](./12-observability) — log every reasoning step via `onStep`
- [Production Resilience](./13-production) — circuit breaker for the LLM `generate` call
- [Full framework showcase](./17-full-framework-showcase) — see reasoning in the complete system
- **Guide:** [Reasoning](../guide/reasoning) — full API reference
