import type { LLMProvider } from '../providers/types.js';
import {
    OpenAIProvider,
    AnthropicProvider,
    GoogleProvider,
    resolveModelString,
    isModelString,
    getProviderFromModelString,
} from '../providers/index.js';
import { PROVIDER } from '../providers/model-resolver.js';
import type { CreateAgentOptions } from './types.js';

export const ENV_API_KEY = 'OPENAI_API_KEY';
export const ENV_MODEL = 'OPENAI_MODEL';
export const ENV_BASE_URL = 'OPENAI_BASE_URL';
export const ENV_OPENROUTER_API_KEY = 'OPENROUTER_API_KEY';
export const ENV_OPENROUTER_MODEL = 'OPENROUTER_MODEL';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const getEnv = typeof process !== 'undefined'
    ? (k: string) => process.env?.[k]
    : () => undefined;

/**
 * Resolves the LLMProvider for createAgent from options + environment.
 *
 * Resolution order:
 *  1. options.llm (pre-built provider passed directly)
 *  2. options.model as "provider:model_id" string → native or OpenAI-compat provider
 *  3. OPENROUTER_API_KEY env / options.openRouter
 *  4. options.apiKey or options.baseURL → OpenAIProvider
 *  5. ANTHROPIC_API_KEY env → AnthropicProvider (claude-3-5-sonnet-20241022)
 *  6. GOOGLE_API_KEY / GEMINI_API_KEY env → GoogleProvider (gemini-2.0-flash)
 *  7. OPENAI_API_KEY env → OpenAIProvider (gpt-4o)
 */
export function resolveLlmForCreateAgent(
    options: CreateAgentOptions,
    defaults: { model: string; apiKey: string | undefined; baseURL: string | undefined },
): LLMProvider {
    const { llm: providedLlm, openRouter, model, apiKey, baseURL } = options;

    // 1. Pre-built provider
    if (providedLlm) return providedLlm;

    // 2. "provider:model_id" string
    if (model && isModelString(model)) {
        const resolved = resolveModelString(model, getEnv);
        if (!resolved) {
            throw new Error(
                `createAgent: Unknown provider in model string "${model}". ` +
                `Supported: openai, anthropic, google, groq, xai, together, fireworks, ` +
                `deepseek, mistral, cohere, perplexity, openrouter, ollama, azure.`,
            );
        }

        const provider = getProviderFromModelString(model);

        if (provider === PROVIDER.ANTHROPIC) {
            if (!resolved.apiKey) throw new Error(`createAgent: ${model} requires ANTHROPIC_API_KEY.`);
            return new AnthropicProvider({ apiKey: resolved.apiKey, model: resolved.model });
        }

        if (provider === PROVIDER.GOOGLE) {
            if (!resolved.apiKey) throw new Error(`createAgent: ${model} requires GOOGLE_API_KEY or GEMINI_API_KEY.`);
            return new GoogleProvider({ apiKey: resolved.apiKey, model: resolved.model });
        }

        // All other providers use OpenAI-compatible endpoint
        if (!resolved.apiKey && provider !== PROVIDER.OLLAMA) {
            throw new Error(
                `createAgent: ${model} requires an API key. ` +
                `Set the appropriate env var (e.g. GROQ_API_KEY, XAI_API_KEY, ...).`,
            );
        }
        return new OpenAIProvider({ apiKey: resolved.apiKey, baseURL: resolved.baseURL, model: resolved.model });
    }

    // 3. OpenRouter
    const openRouterKey = openRouter?.apiKey ?? getEnv(ENV_OPENROUTER_API_KEY);
    if (openRouterKey) {
        const openRouterModel = openRouter?.model ?? getEnv(ENV_OPENROUTER_MODEL) ?? 'openai/gpt-4o';
        return new OpenAIProvider({ apiKey: openRouterKey, baseURL: OPENROUTER_BASE_URL, model: String(openRouterModel) });
    }

    // 4. Explicit apiKey / baseURL → OpenAI-compat
    if (apiKey || baseURL) {
        return new OpenAIProvider({ apiKey, baseURL, model: (model as string | undefined) ?? defaults.model });
    }

    // 5. Anthropic env fallback
    const anthropicKey = getEnv('ANTHROPIC_API_KEY');
    if (anthropicKey) {
        return new AnthropicProvider({ apiKey: anthropicKey, model: 'claude-3-5-sonnet-20241022' });
    }

    // 6. Google env fallback
    const googleKey = getEnv('GOOGLE_API_KEY') ?? getEnv('GEMINI_API_KEY');
    if (googleKey) {
        return new GoogleProvider({ apiKey: googleKey, model: 'gemini-2.0-flash' });
    }

    // 7. OpenAI env fallback
    const openaiKey = getEnv(ENV_API_KEY);
    if (openaiKey) {
        return new OpenAIProvider({ apiKey: openaiKey, model: (model as string | undefined) ?? defaults.model });
    }

    throw new Error(
        `createAgent: No LLM configured. Options:\n` +
        `  • Pass { llm } with a pre-built provider\n` +
        `  • Set model: "provider:model_id" (e.g. "groq:llama-3.3-70b-versatile")\n` +
        `  • Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, or OPENROUTER_API_KEY env var\n` +
        `  • Pass { apiKey } or { baseURL } for custom endpoints`,
    );
}
