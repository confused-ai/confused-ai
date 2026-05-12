/**
 * confused-ai — root entry point.
 *
 * Quick start:
 *   import { agent } from 'confused-ai';
 *   const bot = agent('You are helpful.');
 *   const { text } = await bot.run('Hello!');
 *
 * For fine-grained control, import directly from workspace packages:
 *   import { createAgent }          from './core/index.js';
 *   import { InMemorySessionStore } from './session/index.js';
 *   import { httpClient }           from './tools/index.js';
 *   import { createSwarm }          from './workflow/index.js';
 */

// ── Headline API ───────────────────────────────────────────────────────────────
// `agent()` is the one-call entry point. Use it for all new code.
export { agent, bare, compose, pipe, definePersona, buildPersonaInstructions, createDevLogger, createDevToolMiddleware } from './dx/index.js';
export type { AgentMinimalOptions, BareAgentOptions, ComposeOptions, ComposedAgent, AgentPersona } from './dx/index.js';

// ── Class-based Agent (classic DX) ─────────────────────────────────────────────
export { Agent } from './agent.js';

// ── createAgent (legacy) — use agent() instead ─────────────────────────────────
export { createAgent } from './create-agent.js';
export type { CreateAgentOptions, AgentRunOptions, AgentRunResult, CreateAgentResult } from './create-agent.js';

// ── Core framework ─────────────────────────────────────────────────────────────
export * from './core/index.js';

// ── Memory ─────────────────────────────────────────────────────────────────────
export { InMemoryStore, VectorMemoryStore, InMemoryVectorStore, OpenAIEmbeddingProvider, MemoryType } from './memory/index.js';
export type { VectorMemoryStoreConfig, EmbeddingProvider, MemoryStore, MemoryEntry, MemoryQuery } from './memory/index.js';

// ── Tools ─────────────────────────────────────────────────────────────────────
// Note: Tool, ToolRegistry already exported from ./core/index.js
export { ToolNameTrie, NGramIndex, BaseTool, ToolRegistryImpl, tool, wrapTool,
    ToolCache, ToolCompressor, handleToolGatewayRequest,
    zodToJsonSchema,
    defineTool, httpClient, fileSystem, createShellTool, browserTool,
    composeTool, parallelTools, fallbackTool, retryTool, timeoutTool, mapTool, filterTool,
} from './tools/index.js';
export type { LegacyTool, ToolInput, ComposeToolOptions, ParallelToolsOptions, FallbackToolOptions, RetryToolOptions } from './tools/index.js';
export * from './tools/search/tavily.js';
export * from './tools/search/bravesearch.js';
export * from './tools/search/exa.js';
export * from './tools/search/perplexity.js';
export * from './tools/search/arxiv.js';
export * from './tools/search/jina.js';
export * from './tools/search/linkup.js';
export * from './tools/search/newspaper.js';
export * from './tools/search/pubmed.js';
export * from './tools/search/reddit.js';
export * from './tools/search/searxng.js';
export * from './tools/search/serper.js';
export * from './tools/search/weather.js';
export * from './tools/search/youtube.js';
export * from './tools/search/google-maps.js';
export * from './tools/search/firecrawl.js';
export * from './tools/scraping/playwright.js';
export * from './tools/scraping/brightdata.js';
export * from './tools/scraping/browserbase.js';
export * from './tools/scraping/crawl4ai.js';
export * from './tools/scraping/apify.js';
export * from './tools/scraping/spider.js';
export * from './tools/scraping/scrapegraph.js';
export * from './tools/scraping/websearch.js';
export * from './tools/scraping/wikipedia.js';
export * from './tools/scraping/hackernews.js';
export * from './tools/communication/slack.js';
export * from './tools/communication/gmail.js';
export * from './tools/communication/email.js';
export * from './tools/communication/discord.js';
export * from './tools/communication/telegram.js';
export * from './tools/communication/twilio.js';
export * from './tools/communication/whatsapp.js';
export * from './tools/communication/webex.js';
export * from './tools/communication/zoom.js';
export * from './tools/communication/resend.js';
export * from './tools/productivity/jira.js';
export * from './tools/productivity/notion.js';
export * from './tools/productivity/confluence.js';
export * from './tools/productivity/linear.js';
export * from './tools/productivity/clickup.js';
export * from './tools/productivity/trello.js';
export * from './tools/productivity/google-drive.js';
export * from './tools/productivity/google-sheets.js';
export * from './tools/productivity/google-calendar.js';
export * from './tools/productivity/todoist.js';
export * from './tools/devtools/github.js';
export * from './tools/devtools/gitlab.js';
export * from './tools/devtools/docker.js';
export * from './tools/devtools/e2b.js';
export * from './tools/devtools/code-exec.js';
export * from './tools/devtools/aws-lambda.js';
export * from './tools/devtools/bitbucket.js';
export * from './tools/devtools/sleep.js';
export * from './tools/data/bigquery.js';
export * from './tools/data/csv.js';
export * from './tools/data/database.js';
export * from './tools/data/neo4j.js';
export * from './tools/data/redis.js';
export * from './tools/finance/stripe.js';
export * from './tools/finance/yfinance.js';
export * from './tools/finance/openbb.js';
export * from './tools/media/elevenlabs.js';
export * from './tools/media/fal.js';
export * from './tools/media/replicate.js';
export * from './tools/media/giphy.js';
export * from './tools/media/unsplash.js';
export * from './tools/memory/mem0.js';
export * from './tools/memory/zep.js';
export * from './tools/social/twitter.js';
export * from './tools/social/spotify.js';
export * from './tools/crm/salesforce.js';
export * from './tools/crm/shopify.js';
export * from './tools/crm/zendesk.js';
export * from './tools/mcp/client.js';
export * from './tools/mcp/server.js';
export * from './tools/mcp/transport-sse.js';
export * from './tools/mcp/stdio-server.js';
export * from './tools/mcp/resources.js';
export type { MCPClient, MCPServerAdapter } from './tools/mcp/_mcp-types.js';
export * from './tools/ai/openai.js';
export * from './tools/ai/serpapi.js';
export * from './tools/utils/http.js';
export * from './tools/utils/file.js';
export * from './tools/utils/shell.js';
export * from './tools/utils/browser.js';
export * from './tools/utils/calculator.js';

// ── Planner ───────────────────────────────────────────────────────────────────
// Note: RetryPolicy already exported from ./core/index.js
export { LLMPlanner, ClassicalPlanner, PlanValidator } from './planner/index.js';
export type { Plan, PlannerConfig, Planner } from './planner/index.js';

// ── Execution ─────────────────────────────────────────────────────────────────
export * from './execution/index.js';

// ── Orchestration ─────────────────────────────────────────────────────────────
export type {
    OrchestrableAgent, AgentRole, AgentRegistration, AgentMessage, MessageHandler,
    MCPToolDescriptor, MCPAgentMessage, MCPAgentClient,
    A2ATask, A2ATaskState, A2AAgentCard, A2AMessage, IA2AClient, A2AStreamEvent,
    TraceContext, LoadBalancer,
} from './orchestration/index.js';
export {
    CoordinationType,
    MessageBusImpl, OrchestratorImpl,
    Team, SwarmOrchestrator,
    createSupervisor, createConsensus, createPipeline,
    createHandoff, createAgentRouter,
    createRunnableAgent,
    RoundRobinLoadBalancer, LeastConnectionsLoadBalancer, WeightedResponseTimeLoadBalancer,
    createHttpA2AClient, A2AServer,
    createToolkit, toolkitsToRegistry,
    extractTraceContext, generateTraceparent, injectTraceHeaders,
} from './orchestration/index.js';

// ── Observability ─────────────────────────────────────────────────────────────
export * from './observability/index.js';

// ── LLM Providers ─────────────────────────────────────────────────────────────
// Explicit exports to avoid conflicts with ./core/index.js (GenerateResult, LLMProvider,
// MultiModalInput, StreamChunk, StreamOptions are already exported from core)
export { OpenAIProvider, AnthropicProvider, GoogleProvider, BedrockConverseProvider,
    createOpenRouterProvider, createGroqProvider, createXAIProvider, createTogetherProvider,
    createFireworksProvider, createDeepSeekProvider, createMistralProvider, createCohereProvider,
    createPerplexityProvider, createAzureOpenAIProvider, createOpenAICompatibleProvider,
    createCerebrasProvider, createSambaNovaProvider, createNvidiaProvider, createAI21Provider,
    createHyperbolicProvider, createLambdaProvider, createMoonshotProvider, createDashScopeProvider,
    createZhipuProvider, createYiProvider, createUpstageProvider, createNovitaProvider,
    createCloudflareProvider, createWriterProvider, createDeepInfraProvider, createHuggingFaceProvider,
    createLeptonProvider, createFeatherlessProvider, createSnowflakeProvider, createVllmProvider,
    createLmStudioProvider, createHunyuanProvider, createVolcengineProvider, createMinimaxProvider,
    createBaichuanProvider, createStepfunProvider, createInternLMProvider, createReplicateProvider,
    createRunPodProvider, createWatsonxProvider, createLocalAIProvider, createKoboldProvider,
    createTextGenWebUIProvider, createJanProvider,
    GROQ_BASE_URL, XAI_BASE_URL, TOGETHER_BASE_URL, FIREWORKS_BASE_URL, DEEPSEEK_BASE_URL,
    MISTRAL_BASE_URL, COHERE_BASE_URL, PERPLEXITY_BASE_URL, CEREBRAS_BASE_URL, SAMBANOVA_BASE_URL,
    NVIDIA_BASE_URL, AI21_BASE_URL, HYPERBOLIC_BASE_URL, LAMBDA_BASE_URL, MOONSHOT_BASE_URL,
    DASHSCOPE_BASE_URL, ZHIPU_BASE_URL, YI_BASE_URL, UPSTAGE_BASE_URL, NOVITA_BASE_URL,
    WRITER_BASE_URL, DEEPINFRA_BASE_URL, HUGGINGFACE_INFERENCE_BASE_URL, LEPTON_BASE_URL,
    FEATHERLESS_BASE_URL, SNOWFLAKE_BASE_URL, HUNYUAN_BASE_URL, VOLCENGINE_BASE_URL,
    MINIMAX_BASE_URL, BAICHUAN_BASE_URL, STEPFUN_BASE_URL, INTERNLM_BASE_URL, REPLICATE_BASE_URL,
    WATSONX_REGION_URLS,
    resolveModelString, isModelString, getProviderFromModelString, MODEL_PROVIDER, OPENROUTER_BASE_URL, OLLAMA_BASE_URL, LLAMABARN_BASE_URL,
    toolToLLMDef,
    extractJson, validateStructuredOutput, buildStructuredOutputPrompt, CommonSchemas, collectStreamText, collectStreamThenValidate,
    ContextWindowManager, estimateTokenCount, MODEL_CONTEXT_LIMITS, TOKEN_ESTIMATES, resolveModelKeyForContextLimit, getContextLimitForModel,
    CostTracker, estimateCost, MODEL_PRICING,
    FallbackChainProvider, FallbackStrategy, createCostOptimizedChain, createReliabilityChain,
    LLMCache, withLLMCache,
    LLMRouter, createCostOptimizedRouter, createQualityFirstRouter, createSpeedOptimizedRouter, createBalancedRouter, createSmartRouter, scoreTaskTypesForRouting,
    imageUrl, imageFile, imageBuffer, imageSourceToContentPart, multiModal, multiModalToMessage, isMultiModalInput,
} from './providers/index.js';
export type {
    OpenAIProviderConfig, AnthropicProviderConfig, GoogleProviderConfig, BedrockConverseProviderConfig, OpenAIEmbeddingProviderConfig,
    OpenRouterProviderConfig, GroqProviderConfig, XAIProviderConfig, TogetherProviderConfig, FireworksProviderConfig, DeepSeekProviderConfig,
    MistralProviderConfig, CohereProviderConfig, PerplexityProviderConfig, AzureOpenAIProviderConfig, OpenAICompatibleProviderConfig,
    CerebrasProviderConfig, SambaNovaProviderConfig, NvidiaProviderConfig, AI21ProviderConfig, HyperbolicProviderConfig, LambdaProviderConfig,
    MoonshotProviderConfig, DashScopeProviderConfig, ZhipuProviderConfig, YiProviderConfig, UpstageProviderConfig, NovitaProviderConfig,
    CloudflareProviderConfig, WriterProviderConfig, DeepInfraProviderConfig, HuggingFaceProviderConfig, LeptonProviderConfig,
    FeatherlessProviderConfig, SnowflakeProviderConfig, VllmProviderConfig, LmStudioProviderConfig, HunyuanProviderConfig,
    VolcengineProviderConfig, MinimaxProviderConfig, BaichuanProviderConfig, StepfunProviderConfig, InternLMProviderConfig,
    ReplicateProviderConfig, RunPodProviderConfig, WatsonxProviderConfig, LocalAIProviderConfig, KoboldProviderConfig,
    TextGenWebUIProviderConfig, JanProviderConfig,
    ResolvedModelConfig, ProviderName,
    StructuredOutputConfig, StructuredOutputResult,
    ContextWindowManagerConfig,
    TokenUsage, CostCalculation,
    FallbackChainConfig,
    LLMCacheConfig, CacheKeyInput, CacheStats,
    RouterEntry, RouterRule, RouteContext, RouteDecision, RoutingStrategy, LLMRouterConfig, AdaptiveWeights, TaskType, Complexity, CostTier, SpeedTier,
    ImageUrl, ImageFile, ImageBuffer, ImageSource, AudioSource, FileSource,
} from './providers/index.js';

// ── Agentic runner ────────────────────────────────────────────────────────────
export { AgenticRunner, createAgenticAgent } from './agentic/index.js';
export type { AgenticRunnerConfig, AgenticLifecycleHooks, AgenticRunResult, AgenticStreamHooks } from './agentic/index.js';

// ── SDK ───────────────────────────────────────────────────────────────────────
export { defineAgent, DefinedAgent, createWorkflow, WorkflowBuilder, Workflow } from './sdk/index.js';
export type { AgentDefinitionConfig, AgentRunConfig, WorkflowResult, WorkflowStep } from './sdk/index.js';

// ── Session ───────────────────────────────────────────────────────────────────
// Note: SessionStore type already exported from ./core/index.js
export { InMemorySessionStore, createInMemoryStore, createSqliteStore, createRedisStore, FallbackSessionStore, createFallbackSessionStore, DbSessionStore, createDbSessionStore, SessionState } from './session/index.js';
export type { InMemorySessionStoreOptions, SqliteSessionStoreOptions, RedisClient, RedisSessionStoreOptions, FallbackSessionStoreOptions, SessionData, SessionMessage, SessionId, Session, SessionRun, SessionQuery, SessionMetadata } from './session/index.js';

// ── Guardrails ────────────────────────────────────────────────────────────────
export * from './guardrails/index.js';

// ── Learning ──────────────────────────────────────────────────────────────────
export * from './learning/index.js';

// ── Knowledge ─────────────────────────────────────────────────────────────────
export * from './knowledge/index.js';

// ── Shared utilities ──────────────────────────────────────────────────────────
export { VERSION, isTelemetryEnabled, recordFrameworkStartup } from './shared/index.js';