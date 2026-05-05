---
title: Custom Tools
description: Three APIs for defining custom tools — defineTool(), tool(), and createTool(). Zod-validated, streaming-ready, approval-gated.
outline: [2, 3]
---

# Custom Tools

Tools are typed functions the LLM can invoke during its run loop. confused-ai provides **three APIs** — pick whichever fits your style. All return the same `LightweightTool` object.

| API | Style | Best for |
|-----|-------|---------|
| `defineTool()` | Fluent builder | Readable, discoverable definitions |
| `tool()` | Config object | Compact inline definitions |
| `createTool()` | Alias of `tool()` | Mastra / Vercel AI SDK migration |

---

## `defineTool()` — fluent builder

The recommended API for new projects.

```ts
import { defineTool } from 'confused-ai';
import { z } from 'zod';

const searchDocs = defineTool()
  .name('searchDocs')
  .description('Search the product documentation for a query')
  .parameters(
    z.object({
      query: z.string().describe('The search query'),
      limit: z.number().optional().default(5).describe('Max results to return'),
    })
  )
  .execute(async ({ query, limit }) => {
    const results = await mySearchService.search(query, limit);
    return { results, count: results.length };
  })
  .timeout(10_000)  // abort after 10 s
  .tag('search')
  .build();

// Use in any agent
const ai = agent({
  instructions: 'Help users find documentation.',
  tools: [searchDocs],
});
```

### Full builder reference

```ts
defineTool()
  .name('toolId')                             // required — LLM function name
  .description('What it does')               // required — shown to the LLM
  .parameters(z.object({ ... }))             // required — Zod input schema
  .execute(async (params, ctx) => result)    // required — your business logic
  .output(z.object({ ... }))                // optional — validate output shape
  .timeout(5_000)                            // optional — ms; default 30 000
  .approval(true)                            // optional — always require human approval
  .approval((params) => params.risky)       // optional — dynamic approval condition
  .category('data')                          // optional — categorisation label
  .tag('search')                             // add one tag
  .tags(['search', 'web'])                   // set all tags at once
  .loose()                                   // allow extra properties in Zod schema
  .transform((output) => ({ ... }))         // transform result before LLM sees it
  .onStart((name) => { })                    // streaming: call started
  .onDelta((name, delta) => { })            // streaming: input token delta
  .onReady((name, input) => { })            // streaming: full input ready
  .build()                                   // → LightweightTool
```

---

## `tool()` — config object

Compact alternative — good for inline or generated tools.

```ts
import { tool } from 'confused-ai';
import { z } from 'zod';

const getStockPrice = tool({
  name:        'getStockPrice',
  description: 'Get the current price for a stock ticker symbol',
  parameters:  z.object({ ticker: z.string().describe('e.g. AAPL, MSFT') }),
  execute: async ({ ticker }) => {
    const price = await stockApi.quote(ticker);
    return { ticker, price, currency: 'USD' };
  },
  timeoutMs: 5_000,
});
```

---

## `createTool()` — Mastra / AI SDK compatible

Drop-in alias of `tool()` — shape matches Mastra and Vercel AI SDK.

```ts
import { createTool } from 'confused-ai';
import { z } from 'zod';

const summarizeTool = createTool({
  name:        'summarize',
  description: 'Fetch and summarise a URL',
  parameters:  z.object({ url: z.string().url() }),
  execute:     async ({ url }) => fetchAndSummarize(url),
});
```

---

## `createTools()` — batch definition

Define multiple tools in a single call:

```ts
import { createTools } from 'confused-ai';
import { z } from 'zod';

const tools = createTools({
  getWeather: {
    description: 'Get current weather for a city',
    parameters:  z.object({ city: z.string() }),
    execute:     async ({ city }) => fetchWeather(city),
  },
  getTime: {
    description: 'Get current time for a timezone',
    parameters:  z.object({ tz: z.string().describe('IANA timezone, e.g. America/New_York') }),
    execute:     async ({ tz }) => getTimeInZone(tz),
  },
});

// tools.getWeather and tools.getTime are both LightweightTool instances
const ai = agent({ tools: Object.values(tools) });
```

---

## Human approval gate

Pause the agent loop until a human approves a risky action:

```ts
const deleteRecords = defineTool()
  .name('deleteRecords')
  .description('Permanently delete customer records by ID')
  .parameters(z.object({
    ids:    z.array(z.string()).describe('Record IDs to delete'),
    reason: z.string().describe('Why these records need deletion'),
  }))
  .execute(async ({ ids, reason }) => {
    await db.customers.deleteMany({ id: { in: ids } });
    return { deleted: ids.length };
  })
  .approval(true)   // ← blocks until human approves via ApprovalStore
  .build();
```

For full HITL wiring with an approval UI, see [Human-in-the-Loop](/guide/hitl).

---

## Access tool context

The second argument to `execute` is a `SimpleToolContext`:

```ts
const contextAwareTool = tool({
  name:        'whoAmI',
  description: 'Return info about the current execution context',
  parameters:  z.object({}),
  execute: async (_params, ctx) => {
    return {
      toolName:  ctx.toolName,   // 'whoAmI'
      runId:     ctx.runId,      // unique ID for this agent run
      sessionId: ctx.sessionId,  // session ID if set
      agentName: ctx.agentName,  // agent name if set
      metadata:  ctx.metadata,   // extra metadata passed to run()
    };
  },
});
```

---

## Error handling

Throw a `ToolError` to return a structured error message to the LLM (the agent will try to recover):

```ts
import { ToolError } from 'confused-ai';

const safeFetch = tool({
  name:        'fetchData',
  description: 'Fetch data from an internal API',
  parameters:  z.object({ endpoint: z.string() }),
  execute: async ({ endpoint }) => {
    const res = await fetch(`https://api.internal/${endpoint}`);
    if (!res.ok) {
      // Structured error — LLM receives the message and may retry or report
      throw new ToolError(`API returned ${res.status}: ${res.statusText}`);
    }
    return res.json();
  },
});
```

---

## Composable tools

Combine tools with higher-order helpers from `confused-ai/tools`:

```ts
import { composeTool, retryTool, timeoutTool, parallelTools } from 'confused-ai/tools';

// Retry up to 3 times on failure
const reliableFetch = retryTool(fetchDataTool, { maxRetries: 3, backoffMs: 500 });

// Abort if it takes longer than 8 s
const fastFetch = timeoutTool(fetchDataTool, 8_000);

// Run two tools and return both results
const combined = parallelTools([weatherTool, newsTool]);
```

---

## The `LightweightTool` interface

All three APIs return a `LightweightTool`:

```ts
const t = defineTool()
  .name('echo')
  .description('Echo input back')
  .parameters(z.object({ msg: z.string() }))
  .execute(async ({ msg }) => ({ echo: msg }))
  .build();

// Execute directly (bypasses agent loop)
const result = await t.execute({ msg: 'hello' }, context);

// Introspect
const schema = t.toJSONSchema();   // JSON Schema for LLM API calls
const name   = t.name;             // 'echo'
```

| API | Style | Best for |
|-----|-------|----------|
| `defineTool()` | Fluent builder | Readable, discoverable definitions |
| `tool()` | Config object | Compact, inline definitions |
| `createTool()` | Alias of `tool()` | Mastra / Vercel AI SDK migration |

---

## `defineTool()` — fluent builder

The recommended API for new projects. Chain methods until you call `.build()`.

```ts
import { defineTool } from 'confused-ai';
import { z } from 'zod';

const searchDocs = defineTool()
  .name('searchDocs')
  .description('Search the documentation for a query')
  .parameters(
    z.object({
      query: z.string().describe('Search query'),
      limit: z.number().optional().default(5).describe('Max results'),
    })
  )
  .execute(async ({ query, limit }) => {
    const results = await mySearch(query, limit);
    return results;
  })
  .timeout(10_000)    // ms, default 30_000
  .tag('search')
  .build();

// Use with any agent
const myAgent = agent({
  instructions: 'Help users find documentation.',
  tools: [searchDocs],
});
```

### Full builder API

```ts
defineTool()
  .name('toolId')                   // required — LLM function ID
  .description('What it does')      // required — shown to the LLM
  .parameters(z.object({...}))      // required — Zod schema
  .execute(async (params, ctx) => {}) // required — your logic
  .output(z.object({...}))          // optional — validate output
  .timeout(5000)                    // optional — ms timeout
  .approval(true)                   // optional — require human approval
  .approval((params) => params.dangerous === true)  // dynamic approval
  .category('data')                 // optional — for organization
  .tag('search')                    // add a single tag
  .tags(['search', 'web'])          // set all tags at once
  .loose()                          // allow extra properties in schema
  .transform((output) => ({...}))   // transform output for the model
  .onStart((name) => {})            // streaming: tool call started
  .onDelta((name, delta) => {})     // streaming: input token delta
  .onReady((name, input) => {})     // streaming: full input available
  .build()                          // → LightweightTool
```

### Human approval gate

```ts
const deleteFile = defineTool()
  .name('deleteFile')
  .description('Delete a file from disk')
  .parameters(z.object({ path: z.string() }))
  .execute(async ({ path }) => fs.unlink(path))
  .approval(true)   // always ask a human first
  .build();
```

---

## `tool()` — config object

```ts
import { tool } from 'confused-ai';
import { z } from 'zod';

const getPrice = tool({
  name: 'getPrice',
  description: 'Get price for a stock ticker',
  parameters: z.object({
    ticker: z.string().describe('e.g. AAPL'),
  }),
  execute: async ({ ticker }) => {
    return { ticker, price: await fetchPrice(ticker) };
  },
  timeoutMs: 5000,
});
```

---

## `createTool()` — Mastra-compatible alias

Drop-in compatible with Mastra and Vercel AI SDK tool definitions:

```ts
import { createTool } from 'confused-ai';
import { z } from 'zod';

const myTool = createTool({
  name: 'summarize',
  description: 'Summarize a URL',
  parameters: z.object({ url: z.string().url() }),
  execute: async ({ url }) => fetchAndSummarize(url),
});
```

---

## `createTools()` — batch factory

Define multiple tools in one call:

```ts
import { createTools } from 'confused-ai';
import { z } from 'zod';

const tools = createTools({
  getWeather: {
    description: 'Get weather for a city',
    parameters: z.object({ city: z.string() }),
    execute: async ({ city }) => fetchWeather(city),
  },
  getTime: {
    description: 'Get current time for a timezone',
    parameters: z.object({ tz: z.string() }),
    execute: async ({ tz }) => getTimeInZone(tz),
  },
});

// tools.getWeather — LightweightTool
// tools.getTime    — LightweightTool
```

---

## The `LightweightTool` object

All three APIs return a `LightweightTool`:

```ts
const t = defineTool().name('x').description('...').parameters(z.object({query: z.string()})).execute(async ({query}) => query).build();

// Execute directly
const result = await t.execute({ query: 'hello' }, context);

// Get JSON Schema (for sending to LLM APIs directly)
const schema = t.toJSONSchema();

// Convert to framework ToolCall format manually (not needed for createAgent — it auto-converts)
const frameworkTool = t.toFrameworkTool();
```

---

## Using tool context

The second argument to `execute` is a `SimpleToolContext`:

```ts
const contextTool = tool({
  name: 'userInfo',
  description: 'Get info about the current user',
  parameters: z.object({}),
  execute: async (_params, ctx) => {
    console.log(ctx.toolName);     // 'userInfo'
    console.log(ctx.runId);        // unique run ID
    console.log(ctx.sessionId);    // session ID if set
    console.log(ctx.agentName);    // agent name if set
    console.log(ctx.metadata);     // any extra metadata
    return { userId: ctx.metadata?.userId };
  },
});
```

---

## Built-in tools

confused-ai ships 40+ production-ready tools. Import them as-is or extend with your own:

```ts
import {
  // Web
  webSearchTool, fetchUrlTool, screenshotTool,

  // Database
  postgresQueryTool, mysqlQueryTool, sqliteQueryTool, redisGetTool, redisSetTool,

  // Communication
  emailTool, slackMessageTool, twilioSmsTool,

  // Productivity
  githubCreateIssueTool, githubSearchTool,

  // Finance
  stripeCreateCustomerTool, stripeCreatePaymentTool,

  // AI
  imageGenerationTool, textToSpeechTool,

  // Code
  executeCodeTool, shellCommandTool,

  // Data
  csvReadTool, jsonQueryTool,
} from 'confused-ai/tool';
```

See [Database Tools](/guide/database) for DB tool details.
