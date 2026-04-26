# Execution Workflows

Build complex multi-step workflows with typed steps, branching, parallel execution, and suspend/resume.

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
