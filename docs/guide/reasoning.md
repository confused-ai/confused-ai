---
title: Chain-of-Thought Reasoning
description: ReasoningManager drives structured CoT loops — the LLM produces one step at a time, checks its work, and emits a final answer only when confident.
outline: [2, 3]
---

# Chain-of-Thought Reasoning

`ReasoningManager` drives structured Chain-of-Thought (CoT) reasoning. Instead of asking for a direct answer, it runs a *reasoning loop*: the LLM produces one `ReasoningStep` at a time — with an action, result, confidence score, and a `nextAction` directive — until it emits `final_answer`.

This makes complex tasks (math, planning, multi-step debugging) dramatically more reliable than single-shot prompts.

---

## How it works

```
ReasoningManager.reason(prompt)
  │
  ├─ Step 1: thought + action → tool call or sub-query
  │    └─ nextAction: CONTINUE
  ├─ Step 2: thought + action → verify result
  │    └─ nextAction: CONTINUE
  ├─ Step N: confidence ≥ threshold
  │    └─ nextAction: FINAL_ANSWER
  │
  └─ returns ReasoningResult { steps, finalAnswer, totalTokens }
```

---

## Quick start

```ts
import { ReasoningManager } from 'confused-ai';
import { agent }            from 'confused-ai';

const ai = agent({
  model:        'gpt-4o',
  instructions: 'You are a careful analyst.',
});

const reasoner = new ReasoningManager(ai, {
  maxSteps:            12,    // hard cap on loop iterations
  confidenceThreshold: 0.85,  // emit final answer when confidence ≥ this
  temperature:         0.2,   // low temp for reasoning loops
});

const result = await reasoner.reason(
  'If a train travels 120 km in 1.5 hours, and then 180 km in 2 hours, what is its average speed for the whole journey?'
);

console.log(result.finalAnswer);
// "The average speed is 100 km/h. Total distance = 300 km, total time = 3.5 h, ..."

for (const step of result.steps) {
  console.log(`[${step.stepNumber}] ${step.action} — confidence: ${step.confidence}`);
}
```

---

## `NextAction` enum

| Value | Meaning |
|-------|---------|
| `CONTINUE` | More reasoning needed — proceed to next step |
| `TOOL_CALL` | Use a tool, incorporate result into next step |
| `BACKTRACK` | Previous step was wrong — reconsider |
| `FINAL_ANSWER` | Confident — emit this as the final response |

---

## Reasoning events (streaming)

Subscribe to step-by-step progress:

```ts
import { ReasoningEventType } from 'confused-ai';

reasoner.on(ReasoningEventType.STEP_COMPLETE, (step) => {
  console.log(`Step ${step.stepNumber}: ${step.thought}`);
});

reasoner.on(ReasoningEventType.TOOL_CALLED, (name, input) => {
  console.log(`Calling tool: ${name}`, input);
});

reasoner.on(ReasoningEventType.FINAL_ANSWER, (answer) => {
  console.log('Final:', answer);
});
```

| Event | Payload |
|-------|---------|
| `STEP_COMPLETE` | `ReasoningStep` |
| `TOOL_CALLED` | `name: string, input: unknown` |
| `TOOL_RESULT` | `name: string, result: unknown` |
| `BACKTRACK` | `step: number, reason: string` |
| `FINAL_ANSWER` | `answer: string` |

---

## Tools in the reasoning loop

Equip the underlying agent with tools — the reasoner will call them mid-loop:

```ts
import { TavilySearchTool, CalculatorToolkit } from 'confused-ai';

const ai = agent({
  model:  'gpt-4o',
  tools:  [new TavilySearchTool({ apiKey: process.env.TAVILY_KEY }), ...CalculatorToolkit.create()],
});

const reasoner = new ReasoningManager(ai, { maxSteps: 15 });

const result = await reasoner.reason(
  'What is the market cap of Nvidia today divided by Apple\'s revenue last year?'
);
```

---

## `ReasoningManager` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxSteps` | `number` | `10` | Maximum loop iterations |
| `confidenceThreshold` | `number` | `0.8` | Emit final answer when confidence ≥ threshold |
| `temperature` | `number` | `0.2` | Temperature for reasoning steps |
| `systemPrompt` | `string` | built-in | Override the CoT system prompt |

This gives complex tasks (math, planning, multi-step debugging) dramatically more reliable outputs than a single-shot prompt, because the model checks its own work at each step before committing.

---

## Quick start

```ts
import { ReasoningManager, ReasoningEventType } from 'confused-ai';

const manager = new ReasoningManager({
  // Provider-agnostic: pass any async function that calls your LLM
  generate: async (messages) => {
    const r = await llm.generateText(messages, {});
    return r.text;
  },
  maxSteps: 8,
});

const messages = [{ role: 'user', content: 'Is 3599 prime? Show your work.' }];

for await (const event of manager.reason(messages)) {
  if (event.eventType === ReasoningEventType.STEP) {
    console.log(`[${event.step?.nextAction}] ${event.step?.title}`);
    console.log(`  → ${event.step?.result}`);
  }

  if (event.eventType === ReasoningEventType.COMPLETED) {
    console.log('Final steps:', event.steps?.length);
    const conclusion = event.steps?.at(-1)?.result;
    console.log('Answer:', conclusion);
  }

  if (event.eventType === ReasoningEventType.ERROR) {
    console.error('Reasoning failed:', event.error);
  }
}
```

---

## How the loop works

```
messages → [STARTED]
             │
             ▼
          LLM call → parse ReasoningStep
             │
             ├── nextAction = "continue"   → append step, loop
             ├── nextAction = "validate"   → append step, loop (cross-check pass)
             ├── nextAction = "reset"      → clear steps, restart from scratch
             └── nextAction = "final_answer" ─→ [COMPLETED] (emit all steps)
                                                  │
                                               maxSteps hit → [COMPLETED]
```

The manager appends each step as an `assistant` message before the next LLM call, so the model always reasons over its own prior work.

---

## `NextAction` enum

| Value | When to use |
|-------|-------------|
| `continue` | More reasoning needed — keep going |
| `validate` | Reached a candidate answer; cross-check before committing |
| `final_answer` | Confident and validated — stop reasoning |
| `reset` | Critical error detected — wipe all steps and restart |

---

## `ReasoningEvent` types

| `eventType` | Payload | When emitted |
|-------------|---------|--------------|
| `STARTED` | — | Once, at the start of `reason()` |
| `STEP` | `step: ReasoningStep` | After every successful LLM step |
| `DELTA` | `contentDelta: string` | Streaming content fragments (optional) |
| `COMPLETED` | `steps: ReasoningStep[]` | Final answer reached or `maxSteps` hit |
| `ERROR` | `error: string` | LLM call failure or unparseable response |

---

## `ReasoningStep` shape

```ts
interface ReasoningStep {
  title?:      string;     // Short label: "Check divisibility by 7"
  action?:     string;     // "I will divide 3599 by 7"
  result?:     string;     // "3599 / 7 = 514.1… — not divisible"
  reasoning?:  string;     // Why this step is necessary
  nextAction?: NextAction; // Where to go next
  confidence?: number;     // 0.0–1.0
}
```

---

## Collect the final answer

If you only need the conclusion and don't want to stream intermediate steps:

```ts
import { ReasoningManager, ReasoningEventType } from 'confused-ai';

async function reason(prompt: string): Promise<string> {
  const manager = new ReasoningManager({ generate, maxSteps: 10 });

  let conclusion = '';
  for await (const ev of manager.reason([{ role: 'user', content: prompt }])) {
    if (ev.eventType === ReasoningEventType.COMPLETED) {
      conclusion = ev.steps?.at(-1)?.result ?? '';
    }
  }
  return conclusion;
}
```

---

## Configuration reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `generate` | `(messages) => Promise<string>` | **required** | LLM callable — any provider |
| `minSteps` | `number` | `1` | Minimum steps before accepting `final_answer` |
| `maxSteps` | `number` | `10` | Hard cap on steps to prevent runaway loops |
| `systemPrompt` | `string` | Built-in CoT prompt | Override the reasoning system prompt |
| `debug` | `boolean` | `false` | Log each raw LLM response to console |

---

## Custom system prompt

The default prompt instructs the LLM to output a JSON object per step. For specialized domains (code debugging, math proofs, medical reasoning) you can override it entirely:

```ts
const manager = new ReasoningManager({
  generate,
  systemPrompt: `You are a step-by-step code debugger.
For each step respond with JSON:
{
  "title": "what I am checking",
  "action": "what I do",
  "result": "what I find",
  "nextAction": "continue" | "final_answer",
  "confidence": 0.0–1.0
}`,
});
```

`REASONING_SYSTEM_PROMPT` exports the default prompt string for reference or extension:

```ts
import { REASONING_SYSTEM_PROMPT } from 'confused-ai';
```

---

## Wire reasoning into an agent hook

Use `beforeRun` to replace the agent's single-shot answer with a CoT-derived one:

```ts
import { createAgent } from 'confused-ai';
import { ReasoningManager, ReasoningEventType } from 'confused-ai';

const reasoner = new ReasoningManager({ generate, maxSteps: 6 });

const ai = createAgent({
  name: 'Math Agent',
  llmProvider: llm,
  instructions: 'Solve maths problems step by step.',
  hooks: {
    beforeRun: async (input) => {
      // Replace the raw prompt with a CoT-augmented version
      const steps: string[] = [];
      for await (const ev of reasoner.reason([{ role: 'user', content: input }])) {
        if (ev.eventType === ReasoningEventType.STEP && ev.step?.result) {
          steps.push(`[${ev.step.title}] ${ev.step.result}`);
        }
      }
      return `Here is my step-by-step reasoning:\n${steps.join('\n')}\n\nFinal answer:`;
    },
  },
});
```

---

## Related

- [Compression](./compression.md) — compress verbose tool results that accumulate during reasoning loops
- [Agents](./agents.md) — lifecycle hooks
- [Graph Engine](./graph.md) — run reasoning as a graph node
