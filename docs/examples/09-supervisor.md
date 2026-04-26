# 09 · Supervisor Workflow 🔴

The supervisor pattern has one **manager agent** that breaks down complex tasks
and delegates sub-tasks to **worker agents**. Each worker runs independently and
reports back. Great for research, report generation, and data pipelines.

## What you'll learn

- How to create a supervisor + workers architecture
- How workers report results back to the supervisor
- How to run workers in parallel
- How to aggregate results

## Architecture

```
User: "Write a market analysis report on EVs"
           ↓
     Supervisor Agent
     (plans + delegates)
     ├── ResearchWorker  → "gather EV market data"
     ├── CompetitorWorker → "analyze top 5 competitors"
     └── TrendWorker      → "identify growth trends"
           ↓
     Supervisor (aggregates all results)
           ↓
     Final report delivered to user
```

## Code

```ts
// supervisor-workflow.ts
import { z } from 'zod';
import { createAgent, tool } from 'confused-ai';
import { createSupervisor, createRole } from 'confused-ai/orchestration';

// ── Worker: market research ────────────────────────────────────────────────
const webSearch = tool({
  name: 'webSearch',
  description: 'Search the web for information',
  parameters: z.object({ query: z.string(), maxResults: z.number().default(5) }),
  execute: async ({ query }) => ({
    results: [
      { title: 'EV Market 2026', snippet: 'Global EV sales reached 18M units...', url: '...' },
      { title: 'Tesla Q1 2026', snippet: 'Tesla delivered 450k vehicles...', url: '...' },
    ],
  }),
});

const researchWorker = createAgent({
  name: 'research-worker',
  model: 'gpt-4o-mini',
  instructions: `
    You are a market research analyst.
    When given a research task, search for data and return a structured summary.
    Include specific numbers, statistics, and sources.
    Output format: { summary, keyStats, sources }
  `,
  tools: [webSearch],
});

// ── Worker: competitor analysis ────────────────────────────────────────────
const competitorWorker = createAgent({
  name: 'competitor-worker',
  model: 'gpt-4o-mini',
  instructions: `
    You are a competitive intelligence analyst.
    Research competitors and return a structured comparison.
    Output format: { competitors: [{ name, marketShare, strengths, weaknesses }] }
  `,
  tools: [webSearch],
});

// ── Worker: trends analysis ────────────────────────────────────────────────
const trendWorker = createAgent({
  name: 'trend-worker',
  model: 'gpt-4o-mini',
  instructions: `
    You are a trends analyst.
    Identify and explain key trends in a market.
    Output format: { trends: [{ name, direction, impact, evidence }] }
  `,
  tools: [webSearch],
});

// ── Supervisor ─────────────────────────────────────────────────────────────
// createSupervisor() wires a coordinator that runs sub-agents and merges results.
const supervisor = createSupervisor({
  name: 'report-supervisor',
  subAgents: [
    { agent: researchWorker,   role: createRole('researcher',  'Gathers market data and statistics') },
    { agent: competitorWorker, role: createRole('competitor',  'Analyses top competitors') },
    { agent: trendWorker,      role: createRole('trends',      'Identifies key growth trends') },
  ],
  coordinationType: 'parallel', // run all three sub-agents simultaneously
});

// ── Run ────────────────────────────────────────────────────────────────────
console.log('Starting market analysis...');
const context = buildMinimalContext(); // your AgentContext
const output = await supervisor.run(
  { prompt: 'Write a comprehensive market analysis report on the global electric vehicle industry.' },
  context
);
// output.result.combined contains each sub-agent’s output keyed by agent ID
console.log(JSON.stringify(output.result.combined, null, 2));
// → { 'research-worker': {...}, 'competitor-worker': {...}, 'trend-worker': {...} }
```

## Step-by-step trace

```
Supervisor: "I'll break this into 3 parallel tasks..."
  ├─ → research-worker: "Find EV market size, growth rate, key players"
  ├─ → competitor-worker: "Analyze Tesla, BYD, Rivian, VW, Hyundai"
  └─ → trend-worker: "Identify top 5 trends: charging infra, battery cost, regulation..."

[All 3 workers run in parallel — ~10s instead of ~30s]

Supervisor receives all results:
  ├─ Research: { keyStats: ['18M units sold', '24% YoY growth'] }
  ├─ Competitors: { competitors: [{ name: 'Tesla', marketShare: '18%' }] }
  └─ Trends: { trends: [{ name: 'Battery cost decline', direction: 'down' }] }

Supervisor synthesizes → Final 2000-word report
```

## Dynamic task planning

For dynamic delegation, create a high-level agent with `createAgent()` that uses
handoff tools to delegate to specialists:

```ts
import { agent, defineTool } from 'confused-ai';
import { createHandoff } from 'confused-ai/orchestration';

const handoff = createHandoff({
  from: triageAgent,
  to: { research: researchWorker, competitor: competitorWorker, trends: trendWorker },
  router: async (ctx) => {
    if (/market|size|revenue/i.test(ctx.prompt)) return 'research';
    if (/compet|rival/i.test(ctx.prompt))         return 'competitor';
    return 'trends';
  },
});

const result = await handoff.execute('Analyze BYD vs Tesla market share in 2026');
```

## Progress hooks

Use `agent()` lifecycle hooks to trace each worker's progress:

```ts
const workerWithHooks = agent({
  instructions: researchWorker.instructions,
  hooks: {
    beforeRun:  async (prompt) => { console.log(`[research] start`); return prompt; },
    afterRun:   async (result) => { console.log(`[research] done, steps: ${result.steps}`); return result; },
  },
});
```

## What's next?

- [10 · Database Analyst](./10-database) — supervisor that queries real SQL data
- [15 · Full-Stack App](./15-full-stack) — supervisor inside an HTTP API
