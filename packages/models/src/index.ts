/**
 * @confused-ai/models — LLM provider adapters.
 *
 * SOLID:
 *   SRP  — each adapter file owns exactly one provider.
 *   OCP  — add new providers by adding new files; never edit existing ones.
 *   LSP  — every adapter returns LLMProvider, fully substitutable.
 *   ISP  — adapters expose only what the runner needs (generateText + optional streamText).
 *   DIP  — adapters depend on LLMProvider interface from @confused-ai/core.
 *
 * All SDKs are lazy dynamic imports — zero bundle cost unless used.
 * Importing this barrel alone installs nothing.
 */

export { openai }    from './openai.js';
export { anthropic } from './anthropic.js';
export { google }    from './google.js';
export { ollama }    from './ollama.js';
export { bedrock }   from './bedrock.js';
export type { ModelAdapterConfig } from './types.js';

// Full provider implementations
export { OpenAIProvider }         from './openai-provider.js';
export { createOpenRouterProvider } from './openrouter-provider.js';
export type { OpenRouterProviderConfig } from './openrouter-provider.js';
export {
    resolveModelString,
    isModelString,
    PROVIDER,
    LLAMABARN_BASE_URL,
} from './model-resolver.js';
