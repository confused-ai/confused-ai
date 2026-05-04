/**
 * @confused-ai/tools — 100+ production tools for AI agents.
 *
 * Categories:
 *   core        — BaseTool, ToolRegistry, tool() helper, zod-to-schema
 *   search      — Tavily, Brave, Exa, Perplexity, ArXiv, PubMed, Reddit, YouTube, etc.
 *   scraping    — Playwright, BrightData, Browserbase, Crawl4AI, Apify, Wikipedia, etc.
 *   communication — Slack, Gmail, Email, Discord, Telegram, Twilio, Zoom, Resend
 *   productivity  — Jira, Notion, Confluence, Linear, ClickUp, Google Drive/Sheets/Calendar
 *   devtools    — GitHub, GitLab, Docker, E2B, AWS Lambda, Bitbucket, CodeExec
 *   data        — BigQuery, CSV, Database, Neo4j, Redis
 *   finance     — Stripe, YFinance, OpenBB
 *   media       — ElevenLabs, Fal, Replicate, Giphy, Unsplash
 *   memory      — Mem0, Zep
 *   social      — Twitter, Spotify
 *   crm         — Salesforce, Shopify, Zendesk
 *   mcp         — MCP client, server, SSE transport, stdio server
 *   ai          — OpenAI image gen, SerpAPI
 *   utils       — HTTP, file, shell, browser, calculator
 */

// ── Core: tool infrastructure ─────────────────────────────────────────────
export * from './core/types.js';
export * from './core/base-tool.js';
export * from './core/registry.js';
export { ToolNameTrie, NGramIndex } from './core/trie.js';
export * from './core/tool-helper.js';
export * from './core/tool-wrappers.js';
export * from './core/tool-cache.js';
export * from './core/tool-compressor.js';
export * from './core/tool-gateway-http.js';
export { zodToJsonSchema } from './core/zod-to-schema.js';

// ── Legacy top-level tool exports (backward compat) ───────────────────────
export { defineTool } from './types.js';
export type { Tool as LegacyTool, ToolInput } from './types.js';
export { httpClient } from './http-client.js';
export { fileSystem } from './file-system.js';
export { shell } from './shell.js';
export { browserTool } from './browser.js';

// ── Search tools ─────────────────────────────────────────────────────────
export * from './search/tavily.js';
export * from './search/bravesearch.js';
export * from './search/exa.js';
export * from './search/perplexity.js';
export * from './search/arxiv.js';
export * from './search/jina.js';
export * from './search/linkup.js';
export * from './search/newspaper.js';
export * from './search/pubmed.js';
export * from './search/reddit.js';
export * from './search/searxng.js';
export * from './search/serper.js';
export * from './search/weather.js';
export * from './search/youtube.js';
export * from './search/google-maps.js';
export * from './search/firecrawl.js';

// ── Scraping tools ────────────────────────────────────────────────────────
export * from './scraping/playwright.js';
export * from './scraping/brightdata.js';
export * from './scraping/browserbase.js';
export * from './scraping/crawl4ai.js';
export * from './scraping/apify.js';
export * from './scraping/spider.js';
export * from './scraping/scrapegraph.js';
export * from './scraping/websearch.js';
export * from './scraping/wikipedia.js';
export * from './scraping/hackernews.js';

// ── Communication tools ───────────────────────────────────────────────────
export * from './communication/slack.js';
export * from './communication/gmail.js';
export * from './communication/email.js';
export * from './communication/discord.js';
export * from './communication/telegram.js';
export * from './communication/twilio.js';
export * from './communication/whatsapp.js';
export * from './communication/webex.js';
export * from './communication/zoom.js';
export * from './communication/resend.js';

// ── Productivity tools ────────────────────────────────────────────────────
export * from './productivity/jira.js';
export * from './productivity/notion.js';
export * from './productivity/confluence.js';
export * from './productivity/linear.js';
export * from './productivity/clickup.js';
export * from './productivity/trello.js';
export * from './productivity/google-drive.js';
export * from './productivity/google-sheets.js';
export * from './productivity/google-calendar.js';
export * from './productivity/todoist.js';

// ── Developer tools ───────────────────────────────────────────────────────
export * from './devtools/github.js';
export * from './devtools/gitlab.js';
export * from './devtools/docker.js';
export * from './devtools/e2b.js';
export * from './devtools/code-exec.js';
export * from './devtools/aws-lambda.js';
export * from './devtools/bitbucket.js';
export * from './devtools/sleep.js';

// ── Data tools ────────────────────────────────────────────────────────────
export * from './data/bigquery.js';
export * from './data/csv.js';
export * from './data/database.js';
export * from './data/neo4j.js';
export * from './data/redis.js';

// ── Finance tools ─────────────────────────────────────────────────────────
export * from './finance/stripe.js';
export * from './finance/yfinance.js';
export * from './finance/openbb.js';

// ── Media tools ───────────────────────────────────────────────────────────
export * from './media/elevenlabs.js';
export * from './media/fal.js';
export * from './media/replicate.js';
export * from './media/giphy.js';
export * from './media/unsplash.js';

// ── Memory tools ─────────────────────────────────────────────────────────
export * from './memory/mem0.js';
export * from './memory/zep.js';

// ── Social tools ─────────────────────────────────────────────────────────
export * from './social/twitter.js';
export * from './social/spotify.js';

// ── CRM tools ────────────────────────────────────────────────────────────
export * from './crm/salesforce.js';
export * from './crm/shopify.js';
export * from './crm/zendesk.js';

// ── MCP protocol ─────────────────────────────────────────────────────────
export * from './mcp/client.js';
export * from './mcp/server.js';
export * from './mcp/transport-sse.js';
export * from './mcp/stdio-server.js';
export * from './mcp/resources.js';
export type { MCPClient, MCPToolDescriptor, MCPServerAdapter } from './mcp/_mcp-types.js';

// ── AI tools ─────────────────────────────────────────────────────────────
export * from './ai/openai.js';
export * from './ai/serpapi.js';

// ── Utility tools ────────────────────────────────────────────────────────
export * from './utils/http.js';
export * from './utils/file.js';
export * from './utils/shell.js';
export * from './utils/browser.js';
export * from './utils/calculator.js';
