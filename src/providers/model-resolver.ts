/**
 * Model string resolver: "provider:model_id" → provider config.
 *
 * Supported providers:
 *   openai, anthropic, google, groq, xai, together, fireworks,
 *   deepseek, mistral, cohere, perplexity, openrouter, ollama,
 *   azure, llamabarn
 */

export const PROVIDER = {
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
    GOOGLE: 'google',
    GROQ: 'groq',
    XAI: 'xai',
    TOGETHER: 'together',
    FIREWORKS: 'fireworks',
    DEEPSEEK: 'deepseek',
    MISTRAL: 'mistral',
    COHERE: 'cohere',
    PERPLEXITY: 'perplexity',
    OPENROUTER: 'openrouter',
    OLLAMA: 'ollama',
    AZURE: 'azure',
    LLAMABARN: 'llamabarn',
} as const;

export type ProviderName = (typeof PROVIDER)[keyof typeof PROVIDER];

// ── Base URLs ──────────────────────────────────────────────────────────────

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OLLAMA_BASE_URL = 'http://localhost:11434/v1';
export const LLAMABARN_BASE_URL = 'http://localhost:2276/v1';
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const XAI_BASE_URL = 'https://api.x.ai/v1';
export const TOGETHER_BASE_URL = 'https://api.together.xyz/v1';
export const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
export const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
export const COHERE_BASE_URL = 'https://api.cohere.com/compatibility/v1';
export const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';

// ── Env var names ──────────────────────────────────────────────────────────

const ENV: Record<string, string> = {
    OPENAI: 'OPENAI_API_KEY',
    ANTHROPIC: 'ANTHROPIC_API_KEY',
    GOOGLE: 'GOOGLE_API_KEY',         // also accepts GEMINI_API_KEY
    GROQ: 'GROQ_API_KEY',
    XAI: 'XAI_API_KEY',
    TOGETHER: 'TOGETHER_API_KEY',
    FIREWORKS: 'FIREWORKS_API_KEY',
    DEEPSEEK: 'DEEPSEEK_API_KEY',
    MISTRAL: 'MISTRAL_API_KEY',
    COHERE: 'COHERE_API_KEY',
    PERPLEXITY: 'PERPLEXITY_API_KEY',
    OPENROUTER: 'OPENROUTER_API_KEY',
    LLAMABARN: 'LLAMABARN_API_KEY',
};

export interface ResolvedModelConfig {
    /** Base URL for OpenAI-compatible providers. Undefined → native SDK (anthropic, google). */
    baseURL?: string;
    apiKey?: string;
    model: string;
    /** Which SDK to use when baseURL is absent */
    nativeProvider?: 'anthropic' | 'google';
}

type EnvFn = (key: string) => string | undefined;

function env(getEnv: EnvFn | undefined, key: string): string | undefined {
    return getEnv ? getEnv(key) : undefined;
}

/**
 * Resolve "provider:model_id" → config.
 * Returns undefined when the string doesn't contain a recognised provider prefix.
 */
export function resolveModelString(
    modelStr: string,
    getEnv?: EnvFn,
): ResolvedModelConfig | undefined {
    const ge = getEnv ?? (typeof process !== 'undefined' ? (k: string) => process.env?.[k] : undefined);
    const colon = modelStr.indexOf(':');
    if (colon <= 0) return undefined;

    const provider = modelStr.slice(0, colon).trim().toLowerCase() as ProviderName;
    const modelId = modelStr.slice(colon + 1).trim();
    if (!modelId) return undefined;

    switch (provider) {
        case PROVIDER.OPENAI:
            return { apiKey: env(ge, ENV.OPENAI), model: modelId };

        case PROVIDER.ANTHROPIC:
            return {
                apiKey: env(ge, ENV.ANTHROPIC),
                model: modelId,
                nativeProvider: 'anthropic',
            };

        case PROVIDER.GOOGLE:
            return {
                apiKey: env(ge, ENV.GOOGLE) ?? env(ge, 'GEMINI_API_KEY'),
                model: modelId,
                nativeProvider: 'google',
            };

        case PROVIDER.GROQ:
            return { baseURL: GROQ_BASE_URL, apiKey: env(ge, ENV.GROQ), model: modelId };

        case PROVIDER.XAI:
            return { baseURL: XAI_BASE_URL, apiKey: env(ge, ENV.XAI), model: modelId };

        case PROVIDER.TOGETHER:
            return { baseURL: TOGETHER_BASE_URL, apiKey: env(ge, ENV.TOGETHER), model: modelId };

        case PROVIDER.FIREWORKS:
            return { baseURL: FIREWORKS_BASE_URL, apiKey: env(ge, ENV.FIREWORKS), model: modelId };

        case PROVIDER.DEEPSEEK:
            return { baseURL: DEEPSEEK_BASE_URL, apiKey: env(ge, ENV.DEEPSEEK), model: modelId };

        case PROVIDER.MISTRAL:
            return { baseURL: MISTRAL_BASE_URL, apiKey: env(ge, ENV.MISTRAL), model: modelId };

        case PROVIDER.COHERE:
            return { baseURL: COHERE_BASE_URL, apiKey: env(ge, ENV.COHERE), model: modelId };

        case PROVIDER.PERPLEXITY:
            return { baseURL: PERPLEXITY_BASE_URL, apiKey: env(ge, ENV.PERPLEXITY), model: modelId };

        case PROVIDER.OPENROUTER:
            return { baseURL: OPENROUTER_BASE_URL, apiKey: env(ge, ENV.OPENROUTER), model: modelId };

        case PROVIDER.OLLAMA:
            return { baseURL: OLLAMA_BASE_URL, apiKey: 'not-needed', model: modelId };

        case PROVIDER.LLAMABARN:
            return {
                baseURL: LLAMABARN_BASE_URL,
                apiKey: env(ge, ENV.LLAMABARN) ?? 'not-needed',
                model: modelId,
            };

        case PROVIDER.AZURE: {
            // format: azure:resource/deployment
            const slash = modelId.indexOf('/');
            if (slash <= 0) return undefined;
            const resource = modelId.slice(0, slash);
            const deployment = modelId.slice(slash + 1);
            const apiVersion = env(ge, 'AZURE_OPENAI_API_VERSION') ?? '2025-01-01-preview';
            return {
                baseURL: `https://${resource}.openai.azure.com/openai/deployments/${deployment}?api-version=${apiVersion}`,
                apiKey: env(ge, 'AZURE_OPENAI_API_KEY'),
                model: deployment,
            };
        }

        default:
            return undefined;
    }
}

/** Check if a string looks like "provider:model_id". */
export function isModelString(s: string): boolean {
    const colon = s.indexOf(':');
    return colon > 0 && s.slice(colon + 1).trim().length > 0;
}

/** Return the provider portion of a model string, or undefined. */
export function getProviderFromModelString(s: string): ProviderName | undefined {
    const colon = s.indexOf(':');
    if (colon <= 0) return undefined;
    const p = s.slice(0, colon).trim().toLowerCase();
    return Object.values(PROVIDER).includes(p as ProviderName) ? (p as ProviderName) : undefined;
}
