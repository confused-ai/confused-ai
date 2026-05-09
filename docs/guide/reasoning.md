---
title: Reasoning (CoT / ToT)
description: Chain-of-Thought and Tree-of-Thought reasoning with ReasoningManager and TreeOfThoughtEngine from @confused-ai/reasoning.
outline: [2, 3]
---

# Reasoning

`@confused-ai/reasoning` provides two standalone reasoning engines that work with any LLM backend:

| Engine | Algorithm | Export |
|---|---|---|
| `ReasoningManager` | Chain-of-Thought — iterative step-by-step analysis | `confused-ai/reasoning` |
| `TreeOfThoughtEngine` | Beam-search ToT — parallel branch exploration | `confused-ai/reasoning` |

Both accept a plain `generate` function so they work with any provider.

---

## Chain-of-Thought — `ReasoningManager`

`ReasoningManager` drives a structured CoT loop. At each step it calls your LLM, parses a `ReasoningStep` JSON object, and emits typed `ReasoningEvent`s via an async generator.

### Event sequence

```
STARTED → STEP → STEP → ... → COMPLETED
                                 └── or ERROR
```

### Basic usage

```ts
import { ReasoningManager, ReasoningEventType } from 'confused-ai/reasoning';
import OpenAI from 'openai';

const openai = new OpenAI();

const manager = new ReasoningManager({
  // provider-agnostic: any (messages) => Promise<string>
  generate: async (messages) => {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages as any,
    });
    return r.choices[0].message.content ?? '';
  },
  minSteps: 2,     // require at least 2 steps before accepting FINAL_ANSWER
  maxSteps: 10,    // hard cap — prevents runaway loops
  debug: false,    // set true to log each step
});

const messages = [
  { role: 'user', content: 'A train travels 120km at 60 km/h then 80km at 40 km/h. What is the average speed for the whole trip?' },
];

for await (const event of manager.reason(messages)) {
  switch (event.eventType) {
    case ReasoningEventType.STARTED:
      console.log('Reasoning started…');
      break;

    case ReasoningEventType.STEP:
      // event.step is a ReasoningStep
      console.log(`[${event.step?.title}]`, event.step?.action);
      console.log('  confidence:', event.step?.confidence);
      break;

    case ReasoningEventType.COMPLETED:
      // event.steps — all steps in order
      console.log('Done. Steps:', event.steps?.length);
      break;

    case ReasoningEventType.ERROR:
      console.error('Reasoning error:', event.error);
      break;
  }
}
```

### `ReasoningConfig` options

```ts
interface ReasoningConfig {
  /** LLM callable — provider-agnostic */
  generate: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  /** Minimum steps before accepting FINAL_ANSWER. Default: 1 */
  minSteps?: number;
  /** Hard cap on steps. Default: 10 */
  maxSteps?: number;
  /** Override the default CoT system prompt */
  systemPrompt?: string;
  /** Log each step to console. Default: false */
  debug?: boolean;
}
```

### Override the system prompt

```ts
import { REASONING_SYSTEM_PROMPT } from 'confused-ai/reasoning';

// REASONING_SYSTEM_PROMPT is the default prompt — read it, extend it, or replace it
const manager = new ReasoningManager({
  generate: myLlm,
  systemPrompt: REASONING_SYSTEM_PROMPT + '\n\nAlways cite your sources.',
});
```

### `ReasoningStep` shape

Each `STEP` event carries a `ReasoningStep`:

```ts
interface ReasoningStep {
  title?: string;       // short label: "Identify variables"
  action?: string;      // what the agent will do (first person)
  result?: string;      // what happened after the action
  reasoning?: string;   // rationale / assumptions
  nextAction?: NextAction; // 'continue' | 'validate' | 'final_answer' | 'reset'
  confidence?: number;  // 0.0 – 1.0
}
```

### `NextAction` enum

```ts
enum NextAction {
  CONTINUE      = 'continue',      // more steps needed
  VALIDATE      = 'validate',      // cross-check before finalising
  FINAL_ANSWER  = 'final_answer',  // confident — stop
  RESET         = 'reset',         // critical error — restart
}
```

### Collect steps into a result

```ts
import { type ReasoningResult } from 'confused-ai/reasoning';

async function runReasoning(question: string): Promise<ReasoningResult> {
  const steps = [];
  for await (const event of manager.reason([{ role: 'user', content: question }])) {
    if (event.eventType === ReasoningEventType.STEP && event.step) {
      steps.push(event.step);
    }
    if (event.eventType === ReasoningEventType.COMPLETED) {
      return { steps: event.steps ?? steps, success: true };
    }
    if (event.eventType === ReasoningEventType.ERROR) {
      return { steps, success: false, error: event.error };
    }
  }
  return { steps, success: true };
}
```

---

## Tree-of-Thought — `TreeOfThoughtEngine`

`TreeOfThoughtEngine` runs BFS beam search: at each depth level it generates `beamWidth` candidate thoughts, scores each one, keeps the top-`beamWidth` branches, and returns the leaf with the highest cumulative score.

### Basic usage

```ts
import { TreeOfThoughtEngine } from 'confused-ai/reasoning';

const tot = new TreeOfThoughtEngine({
  // generate: produce a candidate next thought
  generate: async (messages) => myLlm(messages),
  // evaluate (optional): score a candidate thought 0–1
  // defaults to generate when absent
  evaluate: async (messages) => myLlm(messages),
  beamWidth: 3,   // expand 3 branches per level. Default: 3
  maxDepth: 4,    // max BFS depth. Default: 4
});

const result = await tot.solve(
  'Design a database schema for a multi-tenant SaaS application',  // goal
  'Must support row-level security, audit logging, and soft deletes', // context (optional)
);

console.log(result.bestThought); // winning final thought
console.log(result.score);       // cumulative score (0–1)
console.log(result.depth);       // BFS levels traversed
console.log(result.nodes);       // full beam tree (for debugging)
```

### `TotConfig` options

```ts
interface TotConfig {
  /** Generate candidate thoughts */
  generate: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  /**
   * Score a candidate thought. Should return JSON { score: float, rationale: string }
   * or a plain float string. Defaults to `generate` when absent.
   */
  evaluate?: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  /** Branches to expand and keep per BFS level. Default: 3 */
  beamWidth?: number;
  /** Maximum tree depth. Default: 4 */
  maxDepth?: number;
  /** Override the thought-generation system prompt */
  generationPrompt?: string;
  /** Override the thought-evaluation system prompt */
  evaluationPrompt?: string;
}
```

### `TotResult` shape

```ts
interface TotResult {
  bestThought: string;  // highest-scoring final thought
  score: number;        // cumulative score product (0–1)
  nodes: TotNode[];     // full beam tree
  depth: number;        // BFS levels traversed
}

interface TotNode {
  thought: string;      // thought text at this node
  depth: number;        // depth level (root = 0)
  score: number;        // cumulative score from root
  parentIndex: number;  // parent's index in nodes array (-1 for roots)
}
```

### Separate evaluator LLM

Use a cheaper model to evaluate and a stronger one to generate:

```ts
import OpenAI from 'openai';

const strong = new OpenAI(); // gpt-4o — generates thoughts
const fast   = new OpenAI(); // gpt-4o-mini — evaluates them

const tot = new TreeOfThoughtEngine({
  generate: (msgs) => callOpenAI(strong, 'gpt-4o', msgs),
  evaluate: (msgs) => callOpenAI(fast,   'gpt-4o-mini', msgs),
  beamWidth: 5,
  maxDepth: 6,
});
```

### Custom prompts

```ts
const tot = new TreeOfThoughtEngine({
  generate: myLlm,
  generationPrompt: `You are a system architect. Given a design goal and partial
reasoning chain, produce ONE concise next design decision. Plain text only.`,
  evaluationPrompt: `You are a senior reviewer. Score the following design decision
for correctness and relevance. Return: { "score": <0.0-1.0>, "rationale": "..." }`,
});
```

---

## Using both together

Run CoT first to break down the problem, then ToT to explore solution branches:

```ts
import { ReasoningManager, ReasoningEventType, TreeOfThoughtEngine } from 'confused-ai/reasoning';

// Step 1: CoT — decompose the problem
const manager = new ReasoningManager({ generate: myLlm, maxSteps: 5 });

const steps: string[] = [];
for await (const event of manager.reason([{ role: 'user', content: problem }])) {
  if (event.eventType === ReasoningEventType.STEP && event.step?.result) {
    steps.push(event.step.result);
  }
}

// Step 2: ToT — explore solutions using CoT context
const tot = new TreeOfThoughtEngine({ generate: myLlm, beamWidth: 3, maxDepth: 3 });
const result = await tot.solve(problem, steps.join('\n'));

console.log(result.bestThought);
```

---

## Install

```bash
npm install @confused-ai/reasoning
# or: the main package re-exports everything
npm install confused-ai
```

```ts
import { ReasoningManager, TreeOfThoughtEngine, ReasoningEventType, NextAction } from 'confused-ai/reasoning';
```
