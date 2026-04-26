/**
 * Tools — all built-in integrations, organised by category.
 *
 * Category layout:
 *   web/           Browser, HTTP, DuckDuckGo, Wikipedia, HackerNews
 *   communication/ Slack, Discord, Telegram, Email (SMTP + SendGrid)
 *   productivity/  GitHub, Jira, Linear, Notion
 *   data/          PostgreSQL, MySQL, SQLite, Redis, CSV
 *   finance/       Stripe, Yahoo Finance
 *   ai/            OpenAI images/audio, SerpAPI
 *   code/          JS/Python sandbox, shell allowlist
 *   search/        Tavily, Arxiv, OpenWeather, Reddit, YouTube, Twitter/X
 *                  Google Maps, Todoist, Trello, Twilio, Zendesk
 *
 * Core infrastructure (types, registry, BaseTool) stays at this level.
 */

// ── Core infrastructure ────────────────────────────────────────────────────
export * from './types.js';
export { ToolRegistryImpl, toToolRegistry, type ToolProvider } from './registry.js';
export { BaseTool, type BaseToolConfig } from './base-tool.js';

// ── Web ────────────────────────────────────────────────────────────────────
export { HttpClientTool, type HttpToolConfig } from './http-tool.js';
export { BrowserTool, type BrowserToolConfig } from './browser-tool.js';
export * from './file-tools.js';

export {
    DuckDuckGoSearchTool,
    DuckDuckGoNewsTool,
    WebSearchTool,
    WebSearchToolkit,
} from './web/websearch-tool.js';
export { WikipediaSearchTool, WikipediaToolkit } from './web/wikipedia-tool.js';
export {
    HackerNewsTopStoriesTool,
    HackerNewsUserTool,
    HackerNewsToolkit,
} from './web/hackernews-tool.js';

// ── Communication ──────────────────────────────────────────────────────────
export {
    SlackSendMessageTool,
    SlackListChannelsTool,
    SlackGetChannelHistoryTool,
    SlackToolkit,
} from './communication/slack-tool.js';
export {
    DiscordSendMessageTool,
    DiscordGetMessagesTool,
    DiscordCreateChannelTool,
    DiscordDeleteMessageTool,
    DiscordListMembersTool,
    DiscordToolkit,
    type DiscordToolConfig,
} from './communication/discord-tool.js';
export { TelegramTool, TelegramToolkit } from './communication/telegram-tool.js';
export {
    SmtpEmailTool,
    SendGridEmailTool,
    EmailToolkit,
    type SmtpEmailConfig,
    type SendGridEmailConfig,
} from './communication/email-tool.js';

// ── Productivity ───────────────────────────────────────────────────────────
export {
    GitHubSearchRepositoriesTool,
    GitHubGetRepositoryTool,
    GitHubListIssuesTool,
    GitHubCreateIssueTool,
    GitHubListPullRequestsTool,
    GitHubToolkit,
} from './productivity/github-tool.js';
export {
    JiraGetIssueTool,
    JiraCreateIssueTool,
    JiraSearchIssuesTool,
    JiraAddCommentTool,
    JiraToolkit,
} from './productivity/jira-tool.js';
export {
    LinearCreateIssueTool,
    LinearGetIssueTool,
    LinearSearchIssuesTool,
    LinearUpdateIssueTool,
    LinearAddCommentTool,
    LinearListTeamsTool,
    LinearToolkit,
    type LinearToolConfig,
} from './productivity/linear-tool.js';
export {
    NotionCreatePageTool,
    NotionSearchTool,
    NotionUpdatePageTool,
    NotionToolkit,
} from './productivity/notion-tool.js';

// ── Data ───────────────────────────────────────────────────────────────────
export {
    PostgreSQLQueryTool,
    PostgreSQLInsertTool,
    MySQLQueryTool,
    SQLiteQueryTool,
    DatabaseToolkit,
    type DatabaseToolConfig,
} from './data/database-tool.js';
export {
    RedisGetTool,
    RedisSetTool,
    RedisDeleteTool,
    RedisKeysTool,
    RedisHashGetTool,
    RedisIncrTool,
    RedisToolkit,
    type RedisToolConfig,
} from './data/redis-tool.js';
export {
    CsvParseTool,
    CsvFilterTool,
    CsvSelectColumnsTool,
    CsvSortTool,
    CsvAggregateTool,
    CsvToJsonTool,
    CsvToolkit,
} from './data/csv-tool.js';

// ── Finance ────────────────────────────────────────────────────────────────
export {
    StripeCreateCustomerTool,
    StripeGetCustomerTool,
    StripeCreatePaymentIntentTool,
    StripeCreateSubscriptionTool,
    StripeCancelSubscriptionTool,
    StripeRefundTool,
    StripeToolkit,
    type StripeToolConfig,
} from './finance/stripe-tool.js';

// ── AI ─────────────────────────────────────────────────────────────────────
export {
    OpenAIGenerateImageTool,
    OpenAITranscribeAudioTool,
    OpenAIToolkit,
} from './ai/openai-tool.js';
export {
    SerpApiGoogleSearchTool,
    SerpApiYouTubeSearchTool,
    SerpApiToolkit,
} from './ai/serpapi-tool.js';

// ── Code execution ─────────────────────────────────────────────────────────
export {
    JavaScriptExecTool,
    PythonExecTool,
    ShellCommandTool,
    CodeExecToolkit,
    type CodeExecToolConfig,
    type CodeExecResult,
} from './code/code-exec-tool.js';

// ── Shell (explicit import only — not in default barrel for security) ──────
export type { ShellToolConfig } from './shell-tool.js';

// ── Calculator ─────────────────────────────────────────────────────────────
export {
    CalculatorAddTool,
    CalculatorSubtractTool,
    CalculatorMultiplyTool,
    CalculatorDivideTool,
    CalculatorExponentiateTool,
    CalculatorFactorialTool,
    CalculatorIsPrimeTool,
    CalculatorSquareRootTool,
    CalculatorToolkit,
} from './calculator-tool.js';

// ── Search & discovery (new Agno-inspired) ─────────────────────────────────
export {
    TavilySearchTool,
    TavilyExtractTool,
    TavilyToolkit,
    type TavilyToolConfig,
} from './search/tavily-tool.js';
export {
    ArxivSearchTool,
    ArxivGetPaperTool,
    ArxivToolkit,
} from './search/arxiv-tool.js';
export {
    OpenWeatherCurrentTool,
    OpenWeatherForecastTool,
    OpenWeatherToolkit,
    type OpenWeatherToolConfig,
} from './search/weather-tool.js';
export {
    YouTubeSearchTool,
    YouTubeGetVideoTool,
    YouTubeToolkit,
    type YouTubeToolConfig,
} from './search/youtube-tool.js';
export {
    RedditSearchTool,
    RedditGetPostsTool,
    RedditToolkit,
    type RedditToolConfig,
} from './search/reddit-tool.js';
export {
    TwilioSendSmsTool,
    TwilioMakeCallTool,
    TwilioToolkit,
    type TwilioToolConfig,
} from './search/twilio-tool.js';
export {
    TodoistCreateTaskTool,
    TodoistGetTasksTool,
    TodoistCompleteTaskTool,
    TodoistToolkit,
    type TodoistToolConfig,
} from './search/todoist-tool.js';

// ── Communication (additional) ────────────────────────────────────────────
export * from './communication/gmail-tool.js';

// ── Data (additional) ─────────────────────────────────────────────────────
export * from './data/neo4j-tool.js';

// ── Search (additional) ───────────────────────────────────────────────────
export * from './search/exa-tool.js';
export * from './search/firecrawl-tool.js';
export * from './search/google-maps-tool.js';

// ── Productivity (additional) ─────────────────────────────────────────────
export * from './productivity/clickup-tool.js';
export * from './productivity/confluence-tool.js';
export * from './productivity/google-calendar-tool.js';
export * from './productivity/google-sheets-tool.js';
export * from './productivity/spotify-tool.js';
export * from './productivity/trello-tool.js';

// ── MCP ────────────────────────────────────────────────────────────────────
export { HttpMcpClient, loadMcpToolsFromUrl } from './mcp-client.js';
export type { HttpMcpClientOptions } from './mcp-client.js';

// MCP server — expose this framework's tools to external MCP clients
export { McpHttpServer, createMcpServer } from './mcp-server.js';
export type { McpServerOptions, McpAuthConfig } from './mcp-server.js';
export { handleToolGatewayRequest } from './tool-gateway-http.js';
export type { ToolGatewayResponse } from './tool-gateway-http.js';
export { runMcpStdioToolServer, handleMcpStdioLine } from './mcp-stdio-server.js';
export type { McpStdioServerInfo } from './mcp-stdio-server.js';

export { PlaywrightPageTitleTool } from './web/playwright-tool.js';

// ── Yahoo Finance ──────────────────────────────────────────────────────────
export * from './finance/yfinance-tool.js';

// ── AI SDK-style tool() helper + fluent builder + extension utilities ──────
export { tool, createTool, createTools, defineTool, ToolBuilder, extendTool, wrapTool, pipeTools, versionTool, isLightweightTool } from './tool-helper.js';
export type { ToolHelperConfig, LightweightTool, SimpleToolContext, ExtendToolOptions, ToolWrapMiddleware } from './tool-helper.js';
