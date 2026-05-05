---
title: Workflows
description: Build typed multi-step workflows with parallel execution, conditional branching, and suspend/resume — using createWorkflow and createStep.
outline: [2, 3]
---

# Workflows

Workflows compose reusable, typed steps with Zod-validated inputs and outputs. They support parallel fan-out, conditional branching, and suspend/resume for long-running processes.

---

## Quick start

```ts
import { createWorkflow, createStep } from 'confused-ai/execution';
import { z } from 'zod';

// 1. Define steps
const fetchUser = createStep({
  name:  'fetchUser',
  input:  z.object({ userId: z.string() }),
  output: z.object({ name: z.string(), email: z.string() }),
  run: async ({ userId }) => {
    const user = await db.users.findById(userId);
    return { name: user.name, email: user.email };
  },
});

const sendWelcomeEmail = createStep({
  name:  'sendWelcomeEmail',
  input:  z.object({ name: z.string(), email: z.string() }),
  output: z.object({ sent: z.boolean() }),
  run: async ({ name, email }) => {
    await mailer.send({ to: email, subject: `Welcome, ${name}!` });
    return { sent: true };
  },
});

// 2. Compose into a workflow
const onboardUser = createWorkflow({
  name:  'onboardUser',
  input:  z.object({ userId: z.string() }),
  steps: [fetchUser, sendWelcomeEmail],
});

// 3. Run it
const result = await onboardUser.run({ userId: 'user-001' });
console.log(result.sent); // true
```

---

## `createStep` reference

```ts
createStep({
  name:     'stepName',   // required — unique identifier
  input:    z.object({}), // required — Zod input schema
  output:   z.object({}), // required — Zod output schema
  run:      async (input, ctx) => output,  // required — step logic
  timeout:  30_000,       // optional — abort after N ms
  retries:  2,            // optional — retry on failure
  tags:     ['data'],     // optional — categorisation
})
```

### Step context (`ctx`)

```ts
run: async (input, ctx) => {
  ctx.runId;      // unique workflow run ID
  ctx.stepName;   // 'stepName'
  ctx.logger;     // structured logger
  ctx.store;      // key-value store scoped to this run
  await ctx.store.set('key', 'value');
  const val = await ctx.store.get('key');
}
```

---

## `createWorkflow` reference

```ts
createWorkflow({
  name:         'workflowName',
  input:        z.object({}),
  steps:        [step1, step2],        // serial execution
  timeout:      300_000,               // overall timeout (ms)
  retryPolicy:  { maxRetries: 1 },
  onError:      async (err, ctx) => { }, // error handler
})
```

---

## Parallel steps

Fan out to multiple steps simultaneously:

```ts
import { createWorkflow, createStep, parallel } from 'confused-ai/execution';

const fetchProfile = createStep({ name: 'fetchProfile', /* ... */ });
const fetchOrders  = createStep({ name: 'fetchOrders',  /* ... */ });
const fetchBilling = createStep({ name: 'fetchBilling', /* ... */ });

const getDashboard = createWorkflow({
  name:  'getDashboard',
  input:  z.object({ userId: z.string() }),
  steps: [
    parallel([fetchProfile, fetchOrders, fetchBilling]),  // all three run simultaneously
    mergeDashboard,                                        // receives all three outputs
  ],
});
```

---

## Conditional branching

```ts
import { branch } from 'confused-ai/execution';

const processOrder = createWorkflow({
  name:  'processOrder',
  input:  z.object({ orderId: z.string() }),
  steps: [
    validateOrder,
    branch({
      when:  (ctx) => ctx.lastOutput.total > 1000,
      then:  [requireManagerApproval, processPayment],   // high-value path
      else:  [processPayment],                            // standard path
    }),
    sendConfirmation,
  ],
});
```

---

## Suspend and resume

Pause a workflow indefinitely — resume when external data arrives (webhooks, approvals, user input):

```ts
import { createStep, suspend } from 'confused-ai/execution';

const waitForPayment = createStep({
  name:  'waitForPayment',
  input:  z.object({ invoiceId: z.string() }),
  output: z.object({ paid: z.boolean() }),
  run: async ({ invoiceId }, ctx) => {
    // Pause the workflow — it will be resumed when the webhook arrives
    const paymentData = await suspend(ctx, {
      reason:  'Waiting for payment webhook',
      timeout: 7 * 24 * 60 * 60 * 1000,  // 7 days
    });

    return { paid: paymentData.status === 'paid' };
  },
});

// Resume from a webhook handler
app.post('/webhooks/payment', async (req, res) => {
  await workflow.resume(req.body.workflowRunId, req.body);
  res.sendStatus(200);
});
```

## Basic workflow

```ts
import { createWorkflow, createStep } from 'confused-ai/execution';
import { z } from 'zod';

const fetchStep = createStep({
  id: 'fetch',
  description: 'Fetch raw data from a URL',
  inputSchema:  z.object({ url: z.string().url() }),
  outputSchema: z.object({ data: z.array(z.unknown()) }),
  execute: async ({ input }) => {
    const data = await fetch(input.url).then(r => r.json());
    return { data };
  },
});

const analyzeStep = createStep({
  id: 'analyze',
  description: 'Analyze the data with an LLM',
  inputSchema:  z.object({ data: z.array(z.unknown()) }),
  outputSchema: z.object({ analysis: z.string() }),
  execute: async ({ input, getStepResult }) => {
    // access earlier step results if needed
    const raw = getStepResult<{ data: unknown[] }>('fetch');
    const result = await analystAgent.run(`Analyze: ${JSON.stringify(input.data)}`);
    return { analysis: result.text };
  },
});

const analysisWorkflow = createWorkflow({
  id: 'data-analysis',
  description: 'Fetch and analyze data from a URL',
  inputSchema: z.object({ url: z.string().url() }),
  timeoutMs: 120_000, // optional; default 300 000
})
  .then(fetchStep)
  .then(analyzeStep)
  .commit(); // ← commit() seals the workflow, returns a Workflow instance

const result = await analysisWorkflow.execute({ url: 'https://api.example.com/data' });
console.log(result.result?.analysis);
// result.status → 'success' | 'failed' | 'suspended'
```

## `createStep()` reference

```ts
createStep({
  id: string;                  // unique ID — used by getStepResult()
  description?: string;
  inputSchema:  ZodType;       // validated before execute()
  outputSchema: ZodType;       // validated after execute()
  execute: async (ctx: StepExecutionContext) => output;
  when?: (ctx) => boolean | Promise<boolean>; // skip step if false
  retry?: { maxRetries?: number; backoffMs?: number };
})
```

`StepExecutionContext` has:

| Field | Type | Description |
|-------|------|-------------|
| `input` | `z.infer<TInput>` | Validated input for this step |
| `getStepResult(id)` | `<T>(id: string) => T \| undefined` | Read output from a previous step by ID |
| `state` | `Record<string, unknown>` | Shared mutable state across all steps |
| `suspend(reason?)` | `() => never` | Pause execution — use with `.resume()` |
| `abortSignal` | `AbortSignal \| undefined` | Fires if `timeoutMs` is exceeded |

## `createWorkflow()` reference

```ts
createWorkflow({
  id: string;
  description?: string;
  inputSchema: ZodType;
  timeoutMs?: number;          // Default: 300_000 (5 min)
  onStepComplete?: (stepId, result) => void;
  onError?: (error, stepId) => void;
})
  .then(step)                  // append a step
  .parallel(steps, opts?)      // run steps concurrently (see below)
  .branch({ condition, ifTrue, ifFalse? }) // conditional routing
  .commit()                    // → Workflow instance
```

## Parallel steps

```ts
import { createWorkflow, createStep } from 'confused-ai/execution';
import { z } from 'zod';

const newsStep    = createStep({ id: 'news',    inputSchema: z.object({}), outputSchema: z.object({ news: z.string() }),    execute: async () => ({ news: await fetchNews() }) });
const papersStep  = createStep({ id: 'papers',  inputSchema: z.object({}), outputSchema: z.object({ papers: z.string() }),  execute: async () => ({ papers: await fetchPapers() }) });
const patentsStep = createStep({ id: 'patents', inputSchema: z.object({}), outputSchema: z.object({ patents: z.string() }), execute: async () => ({ patents: await fetchPatents() }) });

const synthesizeStep = createStep({
  id: 'synthesize',
  inputSchema: z.object({}),
  outputSchema: z.object({ report: z.string() }),
  execute: async ({ getStepResult }) => {
    const news    = getStepResult('news');
    const papers  = getStepResult('papers');
    const patents = getStepResult('patents');
    const r = await synthesisAgent.run(`Synthesize: ${JSON.stringify({ news, papers, patents })}`);
    return { report: r.text };
  },
});

const workflow = createWorkflow({ id: 'research', inputSchema: z.object({}) })
  .parallel([newsStep, papersStep, patentsStep], { failFast: true }) // abort all on first failure
  .then(synthesizeStep)
  .commit();
```

## Conditional branching

```ts
const classifyStep = createStep({
  id: 'classify',
  inputSchema:  z.object({ input: z.string() }),
  outputSchema: z.object({ type: z.enum(['code', 'text']) }),
  execute: async ({ input }) => ({ type: await classify(input.input) }),
});

const codeStep = createStep({ id: 'handle-code', inputSchema: z.object({ input: z.string() }), outputSchema: z.object({ answer: z.string() }), execute: async ({ input }) => ({ answer: (await codeAgent.run(input.input)).text }) });
const textStep = createStep({ id: 'handle-text', inputSchema: z.object({ input: z.string() }), outputSchema: z.object({ answer: z.string() }), execute: async ({ input }) => ({ answer: (await textAgent.run(input.input)).text }) });

const workflow = createWorkflow({ id: 'smart-routing', inputSchema: z.object({ input: z.string() }) })
  .then(classifyStep)
  .branch({
    condition: ({ getStepResult }) => getStepResult<{ type: string }>('classify')?.type === 'code',
    ifTrue:  codeStep,
    ifFalse: textStep,
  })
  .commit();
```

## Suspend and resume

A step can call `ctx.suspend(reason?)` to pause the workflow — e.g., while waiting for a human decision or an async event.

```ts
const reviewStep = createStep({
  id: 'review',
  inputSchema:  z.object({ draft: z.string() }),
  outputSchema: z.object({ approved: z.boolean() }),
  execute: async ({ input, suspend }) => {
    await notifyReviewer(input.draft);
    suspend('waiting for human review'); // execution pauses here
    return { approved: true };           // resumed with overrides
  },
});

const workflow = createWorkflow({ id: 'approval-flow', inputSchema: z.object({ draft: z.string() }) })
  .then(reviewStep)
  .commit();

// First run — suspends
const r1 = await workflow.execute({ draft: 'My draft...' });
// r1.status === 'suspended'
// r1.suspendedAt === 'review'
// r1.resumeToken   (opaque, use to identify run)

// Later, after human approves — resume with injected step output
const r2 = await workflow.resume({ review: { approved: true } });
// r2.status === 'success'
```

## `WorkflowExecutionResult` reference

```ts
interface WorkflowExecutionResult<T = unknown> {
  status:          'success' | 'failed' | 'suspended';
  result?:         T;               // output of the last step
  error?:          Error;           // set when status === 'failed'
  steps:           Record<string, StepResult>; // per-step detail
  executionTimeMs: number;
  suspendedAt?:    string;          // step ID that called suspend()
  resumeToken?:    string;          // opaque token for workflow.resume()
}
```

## Retries per step

```ts
const flakyStep = createStep({
  id: 'flaky-api',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ input }) => {
    const data = await unreliableApi(input.query);
    return { result: data };
  },
  retry: {
    maxRetries: 3,   // retry up to 3 times
    backoffMs:  500, // 500ms → 1000ms → 2000ms (exponential)
  },
});
```
