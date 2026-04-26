/**
 * LLM provider abstraction — types, providers, utilities.
 */

// Core types
export * from './types.js';

// ── Providers ──────────────────────────────────────────────────────────────

export { OpenAIProvider } from './openai-provider.js';
export type { OpenAIProviderConfig } from './openai-provider.js';

export { AnthropicProvider } from './anthropic-provider.js';
export type { AnthropicProviderConfig } from './anthropic-provider.js';

export { GoogleProvider } from './google-provider.js';
export type { GoogleProviderConfig } from './google-provider.js';

export { BedrockConverseProvider } from './bedrock-provider.js';
export type { BedrockConverseProviderConfig } from './bedrock-provider.js';

export { OpenAIEmbeddingProvider } from './openai-embedding-provider.js';
export type { OpenAIEmbeddingProviderConfig } from './openai-embedding-provider.js';

// OpenRouter (multi-model gateway)
export { createOpenRouterProvider } from './openrouter-provider.js';
export type { OpenRouterProviderConfig } from './openrouter-provider.js';

// OpenAI-compatible provider factories
export {
    createGroqProvider,
    createXAIProvider,
    createTogetherProvider,
    createFireworksProvider,
    createDeepSeekProvider,
    createMistralProvider,
    createCohereProvider,
    createPerplexityProvider,
    createAzureOpenAIProvider,
    // Base URLs
    GROQ_BASE_URL,
    XAI_BASE_URL,
    TOGETHER_BASE_URL,
    FIREWORKS_BASE_URL,
    DEEPSEEK_BASE_URL,
    MISTRAL_BASE_URL,
    COHERE_BASE_URL,
    PERPLEXITY_BASE_URL,
} from './compat-providers.js';

export type {
    GroqProviderConfig,
    XAIProviderConfig,
    TogetherProviderConfig,
    FireworksProviderConfig,
    DeepSeekProviderConfig,
    MistralProviderConfig,
    CohereProviderConfig,
    PerplexityProviderConfig,
    AzureOpenAIProviderConfig,
} from './compat-providers.js';

// ── Model resolution ───────────────────────────────────────────────────────

export {
    resolveModelString,
    isModelString,
    getProviderFromModelString,
    PROVIDER as MODEL_PROVIDER,
    OPENROUTER_BASE_URL,
    OLLAMA_BASE_URL,
    LLAMABARN_BASE_URL,
} from './model-resolver.js';
export type { ResolvedModelConfig, ProviderName } from './model-resolver.js';

// ── Schema conversion ──────────────────────────────────────────────────────

export { zodToJsonSchema, toolToLLMDef } from './zod-to-schema.js';

// ── Structured output ──────────────────────────────────────────────────────

export {
    extractJson,
    validateStructuredOutput,
    buildStructuredOutputPrompt,
    CommonSchemas,
    collectStreamText,
    collectStreamThenValidate,
} from './structured-output.js';
export type { StructuredOutputConfig, StructuredOutputResult } from './structured-output.js';

// ── Context window management ──────────────────────────────────────────────

export {
    ContextWindowManager,
    estimateTokenCount,
    MODEL_CONTEXT_LIMITS,
    TOKEN_ESTIMATES,
    resolveModelKeyForContextLimit,
    getContextLimitForModel,
} from './context-window-manager.js';
export type { ContextWindowManagerConfig } from './context-window-manager.js';

// ── Cost tracking ──────────────────────────────────────────────────────────

export { CostTracker, estimateCost, MODEL_PRICING } from './cost-tracker.js';
export type { TokenUsage, CostCalculation } from './cost-tracker.js';

// ── Fallback chains ────────────────────────────────────────────────────────

export {
    FallbackChainProvider,
    FallbackStrategy,
    createCostOptimizedChain,
    createReliabilityChain,
} from './fallback-chain.js';
export type { FallbackChainConfig } from './fallback-chain.js';

// ── LLM caching ───────────────────────────────────────────────────────────

export { LLMCache, withCache } from './cache.js';
export type { LLMCacheConfig, CacheKeyInput, CacheStats } from './cache.js';

// ── Intelligent LLM router ─────────────────────────────────────────────────

export {
    LLMRouter,
    createCostOptimizedRouter,
    createQualityFirstRouter,
    createSpeedOptimizedRouter,
    createBalancedRouter,
    createSmartRouter,
    scoreTaskTypesForRouting,
} from './router.js';
export type {
    RouterEntry,
    RouterRule,
    RouteContext,
    RouteDecision,
    RoutingStrategy,
    LLMRouterConfig,
    AdaptiveWeights,
    TaskType,
    Complexity,
    CostTier,
    SpeedTier,
} from './router.js';

// ── Vision / Multi-modal helpers ───────────────────────────────────────────

export {
    imageUrl,
    imageFile,
    imageBuffer,
    imageSourceToContentPart,
    multiModal,
    multiModalToMessage,
    isMultiModalInput,
} from './vision.js';
export type {
    ImageUrl,
    ImageFile,
    ImageBuffer,
    ImageSource,
    AudioSource,
    FileSource,
    MultiModalInput,
} from './vision.js';
