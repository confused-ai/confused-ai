# Custom Tools

Tools are functions the LLM can call during its run. confused-ai provides **three APIs** — pick whichever fits your style:

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
} from 'confused-ai/tools';
```

See [Database Tools](/guide/database) for DB tool details.
