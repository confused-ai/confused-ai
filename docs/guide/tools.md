---
title: Built-in Tools
description: 100+ ready-to-use tools — search, browser, communication, productivity, devtools, data, and more.
outline: [2, 3]
---

# Built-in Tools

`@confused-ai/tools` ships 100+ production-ready tools organised by category. Every tool is Zod-validated and tree-shakeable.

## Quick start

```ts
import { agent } from 'confused-ai';
import { tavilySearch, httpClient, slackTool } from 'confused-ai/tools';

const ai = agent({
  model: 'gpt-4o',
  tools: [tavilySearch, httpClient, slackTool],
});
```

Or use the `'web'` preset for HTTP + browser tools:

```ts
const ai = agent({ model: 'gpt-4o', tools: 'web' });
```

## Tool categories

### Search & Research

| Tool | Import | Description |
|------|--------|-------------|
| `tavilySearch` | `confused-ai/tools` | AI-optimised web search (Tavily API) |
| `braveSearch` | `confused-ai/tools` | Privacy-first search (Brave API) |
| `exaSearch` | `confused-ai/tools` | Neural search (Exa API) |
| `perplexitySearch` | `confused-ai/tools` | Perplexity AI search |
| `arxivSearch` | `confused-ai/tools` | Academic papers (ArXiv) |
| `pubmedSearch` | `confused-ai/tools` | Medical literature (PubMed) |
| `redditSearch` | `confused-ai/tools` | Reddit posts and comments |
| `youtubeSearch` | `confused-ai/tools` | YouTube videos and transcripts |
| `googleMaps` | `confused-ai/tools` | Places, directions, geocoding |
| `weatherTool` | `confused-ai/tools` | Current weather by location |
| `serperSearch` | `confused-ai/tools` | Google search via Serper |
| `searxngSearch` | `confused-ai/tools` | Self-hosted SearXNG |
| `jinaSearch` | `confused-ai/tools` | Jina AI web reader |
| `firecrawlTool` | `confused-ai/tools` | Firecrawl web scraping |

### Browser & Scraping

| Tool | Description |
|------|-------------|
| `browserTool` | Playwright-powered browser automation |
| `playwrightTool` | Full Playwright control |
| `wikipediaTool` | Wikipedia article fetcher |
| `crawl4aiTool` | AI-friendly web crawler |
| `apifyTool` | Apify actor runs |
| `brightDataTool` | BrightData proxy scraping |

### HTTP & Files

| Tool | Description |
|------|-------------|
| `httpClient` | HTTP GET/POST/PUT/DELETE with JSON/form support |
| `fileSystem` | Read, write, list, delete local files |
| `createShellTool()` | Run shell commands (allowlisted by default) |

### Communication

| Tool | Description |
|------|-------------|
| `slackTool` | Post messages, read channels, list users |
| `gmailTool` | Send, read, search Gmail |
| `emailTool` | SMTP email sending |
| `discordTool` | Send Discord messages |
| `telegramTool` | Telegram Bot API |
| `twilioTool` | SMS and voice via Twilio |
| `resendTool` | Email via Resend API |
| `zoomTool` | Create/manage Zoom meetings |

### Productivity

| Tool | Description |
|------|-------------|
| `jiraTool` | Create, update, search Jira issues |
| `notionTool` | Read/write Notion pages and databases |
| `linearTool` | Linear issue management |
| `clickUpTool` | ClickUp tasks and projects |
| `confluenceTool` | Confluence pages |
| `googleDriveTool` | Google Drive files |
| `googleSheetsTool` | Read/write Google Sheets |
| `googleCalendarTool` | Google Calendar events |

### Developer Tools

| Tool | Description |
|------|-------------|
| `githubTool` | Repos, issues, PRs, files via GitHub API |
| `gitlabTool` | GitLab repos and MRs |
| `dockerTool` | Docker container management |
| `e2bTool` | E2B cloud code execution |
| `awsLambdaTool` | Invoke AWS Lambda functions |
| `codeExecTool` | Safe sandboxed code execution |

### Data & Databases

| Tool | Description |
|------|-------------|
| `databaseTool` | SQL query execution (Postgres, MySQL, SQLite) |
| `redisTool` | Redis get/set/delete |
| `neo4jTool` | Neo4j graph queries (Cypher) |
| `bigQueryTool` | BigQuery SQL queries |
| `csvTool` | Parse and query CSV files |

### Finance

| Tool | Description |
|------|-------------|
| `stripeTool` | Stripe payments and customers |
| `yFinanceTool` | Yahoo Finance stock data |
| `openBBTool` | OpenBB financial data |

### AI & Media

| Tool | Description |
|------|-------------|
| `openAIImageTool` | DALL-E image generation |
| `elevenLabsTool` | ElevenLabs TTS |
| `falTool` | Fal.ai image/video generation |
| `replicateTool` | Replicate model runs |
| `giphyTool` | Giphy GIF search |
| `unsplashTool` | Unsplash image search |

### Memory

| Tool | Description |
|------|-------------|
| `mem0Tool` | Mem0 memory store |
| `zepTool` | Zep memory and graph |

### CRM & Commerce

| Tool | Description |
|------|-------------|
| `salesforceTool` | Salesforce CRM |
| `shopifyTool` | Shopify products and orders |
| `zendeskTool` | Zendesk tickets |

### MCP

| Tool | Description |
|------|-------------|
| `createMCPClient()` | Connect to any MCP server as a tool provider |
| `createMCPServer()` | Expose agent tools as an MCP server |
| `createSSETransport()` | SSE-based MCP transport |

## Custom tools

```ts
import { tool } from 'confused-ai';
import { z } from 'zod';

const myTool = tool({
  id: 'get_price',
  description: 'Get the current price of a product by SKU',
  parameters: z.object({
    sku: z.string().describe('Product SKU'),
  }),
  execute: async ({ sku }) => {
    const price = await db.products.getPrice(sku);
    return { sku, price, currency: 'USD' };
  },
});
```

See [Custom Tools](/guide/custom-tools) for full documentation.

## Tool composition

Combine tools without modifying originals:

```ts
import { composeTool, withCache, withTimeout, parallelTools } from 'confused-ai/tools';

// Cache results for 5 minutes
const cachedSearch = withCache(tavilySearch, { ttlMs: 300_000 });

// Timeout at 10 seconds
const safeBrowser = withTimeout(browserTool, 10_000);

// Run two tools in parallel and merge results
const searchAndScrape = parallelTools([cachedSearch, safeBrowser]);
```

See [Tool Composition](/guide/tool-composition) for all combinators.

## Tool caching

```ts
import { ToolCache, withCache } from '@confused-ai/tools';

const cache = new ToolCache({ maxEntries: 500, ttlMs: 60_000 });
const cachedTool = withCache(expensiveTool, cache);
```

## Tool compression

Truncate or summarise large tool outputs before they reach the LLM:

```ts
import { ToolCompressor, withCompression } from '@confused-ai/tools';

const compressor = new ToolCompressor({ maxBytes: 8_000, strategy: 'truncate' });
const compressedTool = withCompression(htmlScraperTool, compressor);
```

## Shell tool (allowlist)

The shell tool denies all commands by default. Explicitly allowlist what you need:

```ts
import { createShellTool } from 'confused-ai/tools';

const shell = createShellTool({
  allowedCommands: ['ls', 'cat', 'grep', 'find'],
});

// Or allow everything (not recommended for production)
const unrestricted = createShellTool({ allowedCommands: null });
```
