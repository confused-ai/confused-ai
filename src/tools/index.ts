/**
 * Tools — all built-in integrations, organised by category.
 *
 * Category layout:
 *   core/          BaseTool, types, registry, tool-helper (infrastructure)
 *   mcp/           MCP client, server, stdio server, Streamable HTTP transport, resources
 *   utils/         HTTP client, browser, calculator, file system (shell via tools/shell entry)
 *   communication/ Slack, Discord, Telegram, Email, Gmail, Resend, WhatsApp, Zoom, Webex, Twilio
 *   productivity/  Notion, Jira, Linear, ClickUp, Confluence, Trello, Google Drive/Calendar/Sheets, Todoist
 *   devtools/      GitHub, GitLab, Bitbucket, Docker, E2B, AWS Lambda, code exec, sleep
 *   crm/           Salesforce, Shopify, Zendesk
 *   search/        Tavily, Exa, Firecrawl, Perplexity, Serper, Brave, SearXNG, Jina, Linkup,
 *                  Arxiv, PubMed, Newspaper, YouTube, Reddit, Weather, Google Maps
 *   scraping/      Crawl4AI, ScapeGraph, Spider, Apify, BrightData, Browserbase, Playwright,
 *                  HackerNews, web search, Wikipedia
 *   media/         Giphy, Unsplash, ElevenLabs, Fal, Replicate
 *   memory/        Mem0, Zep
 *   ai/            OpenAI images/audio, SerpAPI
 *   data/          PostgreSQL, MySQL, SQLite, Redis, CSV, BigQuery, Neo4j
 *   finance/       Stripe, Yahoo Finance, OpenBB
 *   social/        Twitter/X, Spotify
 */

export * from './core/index.js';
export * from './mcp/index.js';
export * from './utils/index.js';
export * from './communication/index.js';
export * from './productivity/index.js';
export * from './devtools/index.js';
export * from './crm/index.js';
export * from './search/index.js';
export * from './scraping/index.js';
export * from './media/index.js';
export * from './memory/index.js';
export * from './ai/index.js';
export * from './data/index.js';
export * from './finance/index.js';
export * from './social/index.js';
