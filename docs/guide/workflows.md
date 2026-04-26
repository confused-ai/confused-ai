# Execution Workflows

Build complex multi-step workflows with typed steps, branching, and error handling.

## Step workflow

```ts
import { createWorkflow, step } from 'fluxion/execution';
import { z } from 'zod';

const analysisWorkflow = createWorkflow('data-analysis')
  .step(step({
    name: 'fetch',
    description: 'Fetch raw data',
    inputSchema: z.object({ source: z.string().url() }),
    outputSchema: z.object({ data: z.array(z.unknown()) }),
    execute: async ({ source }) => {
      const data = await fetch(source).then(r => r.json());
      return { data };
    },
  }))
  .step(step({
    name: 'clean',
    description: 'Clean and normalize data',
    execute: async ({ data }) => {
      return { data: data.filter(Boolean) };
    },
  }))
  .step(step({
    name: 'analyze',
    description: 'Run analysis',
    execute: async ({ data }, ctx) => {
      const result = await ctx.agents.analyst.run(`Analyze: ${JSON.stringify(data)}`);
      return { analysis: result.text };
    },
  }))
  .build();

const result = await analysisWorkflow.run({ source: 'https://api.example.com/data' });
console.log(result.analysis);
```

## Parallel steps

```ts
const workflow = createWorkflow('parallel-research')
  .parallel([
    step({ name: 'fetch-news', execute: async () => fetchNews() }),
    step({ name: 'fetch-papers', execute: async () => fetchPapers() }),
    step({ name: 'fetch-patents', execute: async () => fetchPatents() }),
  ])
  .step(step({
    name: 'synthesize',
    execute: async ({ 'fetch-news': news, 'fetch-papers': papers, 'fetch-patents': patents }) => {
      return agent.run(`Synthesize: ${JSON.stringify({ news, papers, patents })}`);
    },
  }))
  .build();
```

## Conditional branching

```ts
const workflow = createWorkflow('smart-routing')
  .step(step({ name: 'classify', execute: async ({ input }) => classify(input) }))
  .branch({
    condition: (ctx) => ctx.steps.classify.type === 'code',
    true: step({ name: 'handle-code', execute: async (input) => codeAgent.run(input) }),
    false: step({ name: 'handle-text', execute: async (input) => textAgent.run(input) }),
  })
  .build();
```

## Error handling and retries

```ts
const workflow = createWorkflow('resilient')
  .step(step({
    name: 'fetch',
    execute: async () => fetchData(),
    retry: { times: 3, delay: 1000, backoff: 'exponential' },
    onError: async (error, ctx) => {
      console.error('Fetch failed:', error.message);
      return { data: [] }; // fallback
    },
  }))
  .build();
```
