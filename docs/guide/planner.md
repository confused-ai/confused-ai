# Planner

The planner module decomposes a high-level goal into an ordered, dependency-aware list of `Task` objects. Two planners ship out of the box:

- **`ClassicalPlanner`** — rule-based, pattern-matching decomposition. Deterministic, no LLM call required. Fast and predictable.
- **`LLMPlanner`** — LLM-driven decomposition. Handles novel goals that don't match any registered pattern. Flexible, but requires a provider.

Both implement the `Planner` interface so they're interchangeable.

---

## Quick start — ClassicalPlanner

```ts
import { ClassicalPlanner, PlanningAlgorithm } from 'confused-ai/planner';

const planner = new ClassicalPlanner({
  algorithm:             PlanningAlgorithm.HIERARCHICAL, // default
  allowParallelExecution: true,
  maxIterations:         10,
  timeoutMs:             30_000,
});

const plan = await planner.plan(
  'Write a blog post about TypeScript 5.5',
  { metadata: { wordCount: 1000, audience: 'developers' } },
);

console.log(plan.id);            // 'plan-xyz'
console.log(plan.tasks.length);  // e.g. 4 tasks

for (const task of plan.tasks) {
  console.log(`[${task.priority}] ${task.name}: ${task.description}`);
  console.log('  deps:', task.dependencies);
}
```

---

## Quick start — LLMPlanner

```ts
import { LLMPlanner } from 'confused-ai/planner';

// The planner takes any object with a generateText method
const llmAdapter = {
  async generateText(prompt: string, opts?: { temperature?: number; maxTokens?: number }) {
    const r = await llm.generateText([{ role: 'user', content: prompt }], {});
    return r.text;
  },
};

const planner = new LLMPlanner(
  {
    temperature:            0.3,
    maxTokens:              2000,
    allowParallelExecution: true,
  },
  llmAdapter,
);

const plan = await planner.plan(
  'Set up a CI/CD pipeline for a monorepo with three services',
  {
    availableTools: ['git', 'docker', 'github-actions'],
    constraints:    { timeboxMs: 4 * 60 * 60 * 1000 },
  },
);
```

---

## `Plan` shape

```ts
interface Plan {
  readonly id:    string;
  goal:           string;
  tasks:          Task[];
  createdAt:      Date;
  metadata: {
    plannerType:               'classical' | 'llm';
    estimatedTotalDurationMs:  number;
    confidence:                number;   // 0.0–1.0
    context?:                  Record<string, unknown>;
  };
}
```

---

## `Task` shape

```ts
interface Task {
  readonly id:            string;        // e.g. 'task-1'
  readonly name:          string;        // short label
  readonly description:   string;        // what needs to be done
  readonly dependencies:  string[];      // IDs of tasks that must complete first
  readonly priority:      TaskPriority;  // CRITICAL | HIGH | MEDIUM | LOW
  readonly metadata: {
    toolIds?:        string[];   // tools this task needs
    outputKey?:      string;     // key to store result under
    maxRetries?:     number;
    timeoutMs?:      number;
    custom?:         Record<string, unknown>;
  };
  estimatedDurationMs?: number;
}
```

---

## `TaskPriority` enum

| Value | Numeric | Use when |
|-------|---------|----------|
| `CRITICAL` | `0` | Blocking — everything depends on this |
| `HIGH` | `1` | Important, should run early |
| `MEDIUM` | `2` | Standard task |
| `LOW` | `3` | Nice-to-have, can be deferred |

---

## `PlanningAlgorithm` enum

Used by `ClassicalPlanner`:

| Value | Description |
|-------|-------------|
| `HIERARCHICAL` | Top-down goal decomposition (default) |
| `BACKWARD_CHAINING` | Work backward from the goal |
| `FORWARD_CHAINING` | Work forward from initial state |
| `MEANS_ENDS` | Means-ends analysis |

---

## Validating a plan

`PlanValidator` checks that dependencies are acyclic, all referenced task IDs exist, and no tasks are orphaned:

```ts
import { PlanValidator } from 'confused-ai/planner';

const validator = new PlanValidator();
const result = await validator.validate(plan);

if (!result.valid) {
  console.error('Plan errors:', result.errors);
}
```

---

## Iterative refinement

Both planners support feedback-based replanning via `replan()`:

```ts
const refinedPlan = await planner.replan(plan, {
  feedback:    'The CI step needs to handle flaky tests — add a retry step.',
  performance: 'ci-step took 45 minutes',
  adaptations: ['add-retry-ci'],
});
```

---

## ClassicalPlanner config reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `algorithm` | `PlanningAlgorithm` | `HIERARCHICAL` | Decomposition algorithm |
| `allowParallelExecution` | `boolean` | `true` | Whether to allow parallel task execution |
| `maxIterations` | `number` | `10` | Iteration cap |
| `timeoutMs` | `number` | `30_000` | Planning timeout in ms |
| `heuristic` | `string` | `'default'` | Heuristic function name |

---

## LLMPlanner config reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `temperature` | `number` | `0.7` | LLM temperature for planning |
| `maxTokens` | `number` | `2_000` | Max tokens per LLM call |
| `allowParallelExecution` | `boolean` | `true` | Whether to generate parallel tasks |
| `maxIterations` | `number` | `10` | Max replanning iterations |
| `timeoutMs` | `number` | `60_000` | Planning timeout in ms |
| `systemPrompt` | `string` | Built-in | Override the planning system prompt |

---

## `PlanContext`

Pass optional context to help the planner make better decisions:

```ts
interface PlanContext {
  availableTools?:  string[];                // tool names available to execute tasks
  constraints?:     { timeboxMs?: number };  // time budget
  previousPlans?:   Plan[];                  // history of prior plans for this goal
  metadata?:        Record<string, unknown>; // arbitrary context
}
```

---

## Related

- [Execution Workflows](./workflows.md) — execute a plan's tasks as typed workflow steps
- [Graph Engine](./graph.md) — model task dependencies as a DAG with durable execution
- [Orchestration](./orchestration.md) — supervisor pattern for dynamic task delegation
