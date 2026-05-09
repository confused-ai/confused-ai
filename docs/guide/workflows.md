---
title: Workflows
description: Sequential and parallel agent workflows using createWorkflow() from the SDK.
outline: [2, 3]
---

# Workflows

`@confused-ai/sdk` provides `createWorkflow()` for composing agents into reusable, type-safe workflows.

## Sequential workflow

```ts
import { createWorkflow } from '@confused-ai/sdk';

const researchWorkflow = createWorkflow('research-pipeline')
  .step('gather', researchAgent)
  .step('summarise', summariseAgent)
  .step('format', formatAgent)
  .build();

const result = await researchWorkflow.run('Latest TypeScript features in 2026');
console.log(result.output);       // final formatted output
console.log(result.stepResults);  // per-step outputs
```

## Parallel workflow

```ts
const parallelWorkflow = createWorkflow('parallel-research')
  .parallel([
    { name: 'news',   agent: newsAgent },
    { name: 'papers', agent: papersAgent },
    { name: 'social', agent: socialAgent },
  ])
  .step('synthesise', synthesiseAgent)  // runs after all parallel steps
  .build();

const result = await parallelWorkflow.run('AI in healthcare 2026');
```

## Conditional branching

```ts
import { createWorkflow } from '@confused-ai/sdk';

const workflow = createWorkflow('smart-router')
  .step('classify', classifyAgent)
  .branch({
    condition: (result) => result.output.includes('billing'),
    ifTrue:  billingAgent,
    ifFalse: supportAgent,
  })
  .build();
```

## `dependsOn` — explicit dependencies

```ts
const workflow = createWorkflow('analysis')
  .step('a', agentA)
  .step('b', agentB)
  .step('c', agentC, { dependsOn: ['a', 'b'] })  // waits for both a and b
  .build();
```

## Workflow branching helpers

```ts
import {
  branch,
  loopUntil,
  forEach,
  race,
  retry,
} from 'confused-ai/workflow-branching';

// branch: conditional routing
const router = branch({
  condition: (ctx) => ctx.sentiment === 'negative',
  ifTrue:  escalationAgent,
  ifFalse: standardAgent,
});

// loopUntil: repeat until condition met
const refiner = loopUntil({
  agent: draftAgent,
  condition: (result) => result.score > 0.9,
  maxIterations: 5,
});

// forEach: map over an array of inputs
const batchProcessor = forEach({
  agent: processAgent,
  concurrency: 4,
});

// race: first agent to respond wins
const fastest = race([agentA, agentB, agentC]);

// retry: retry on failure
const resilient = retry(unreliableAgent, { maxRetries: 3, backoffMs: 500 });
```
