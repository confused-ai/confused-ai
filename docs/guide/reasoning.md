---
title: Reasoning (CoT / ToT)
description: Chain-of-Thought and Tree-of-Thought reasoning modes for complex problem-solving agents.
outline: [2, 3]
---

# Reasoning

`@confused-ai/reasoning` adds structured thinking before the agent gives a final answer.

## Chain-of-Thought (CoT)

Enable step-by-step reasoning:

```ts
import { agent } from 'confused-ai';

const ai = agent({
  model: 'gpt-4o',
  reasoning: {
    enabled: true,
    strategy: 'cot',   // chain-of-thought
    maxSteps: 8,       // max reasoning steps
  },
});

const result = await ai.run({
  prompt: 'A train travels 120km at 60 km/h then 80km at 40 km/h. What is the average speed for the whole trip?',
});

// result.steps — each reasoning step
// result.output — final answer after reasoning
```

## ReAct + reasoning

Combine tool use with reasoning:

```ts
const ai = agent({
  model: 'gpt-4o',
  tools: [calculatorTool, webSearchTool],
  reasoning: { enabled: true, strategy: 'react' },
});
```

## Tree-of-Thought (ToT)

Explores multiple solution paths in parallel and picks the best:

```ts
import { TreeOfThoughtEngine } from 'confused-ai/reasoning';

const tot = new TreeOfThoughtEngine({
  llm: myProvider,
  beamWidth: 3,        // explore 3 candidate paths
  maxDepth: 4,         // max depth per path
  scoreThreshold: 0.7, // minimum score to continue a branch
});

const result = await tot.solve({
  problem: 'Design a database schema for a multi-tenant SaaS application',
  context: 'Must support row-level security, audit logging, and soft deletes',
});

console.log(result.bestPath);   // winning reasoning chain
console.log(result.score);      // confidence score
console.log(result.answer);     // final answer
```

## Using ReasoningManager directly

```ts
import { ReasoningManager } from 'confused-ai/reasoning';

const rm = new ReasoningManager({ llm: myProvider, maxSteps: 6 });

const steps: string[] = [];
for await (const event of rm.stream({ prompt: 'Plan a microservices migration' })) {
  if (event.type === 'STEP') steps.push(event.content);
  if (event.type === 'FINAL_ANSWER') console.log('Answer:', event.content);
}
```

## Structured reasoning output

```ts
import { createReasoningArtifact } from 'confused-ai/artifacts';

// After a reasoning run, package thoughts into an artifact
const artifact = createReasoningArtifact(
  'migration-plan',
  steps,
  result.output,
  0.92  // confidence
);
```

## Agent integration

```ts
const ai = agent({
  model: 'gpt-4o',
  reasoning: {
    enabled: true,
    strategy: 'cot',
    maxSteps: 5,
  },
  compression: {
    enabled: true,
    messageSizeThreshold: 8_000,  // compress messages over 8kb
  },
});
```

The reasoning pre-pass runs before the ReAct loop, injecting structured thought as context.
