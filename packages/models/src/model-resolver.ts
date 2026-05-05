/**
 * Model string resolver: "provider:model_id" → provider config.
 *
 * Supported providers:
 *   openai, anthropic, google, groq, xai, together, fireworks,
 *   deepseek, mistral, cohere, perplexity, openrouter, ollama,
 *   azure, llamabarn, cerebras, sambanova, nvidia, ai21,
 *   hyperbolic, lambda, moonshot, dashscope, zhipu, yi,
 *   upstage, novita, writer
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
    // ── New providers ──────────────────────────────────────────────────
    CEREBRAS: 'cerebras',
    SAMBANOVA: 'sambanova',
    NVIDIA: 'nvidia',
    AI21: 'ai21',
    HYPERBOLIC: 'hyperbolic',
    LAMBDA: 'lambda',
    MOONSHOT: 'moonshot',
    DASHSCOPE: 'dashscope',
    ZHIPU: 'zhipu',
    YI: 'yi',
    UPSTAGE: 'upstage',
    NOVITA: 'novita',
    WRITER: 'writer',
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
export const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1';
export const SAMBANOVA_BASE_URL = 'https://api.sambanova.ai/v1';
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const AI21_BASE_URL = 'https://api.ai21.com/studio/v1';
export const HYPERBOLIC_BASE_URL = 'https://api.hyperbolic.xyz/v1';
export const LAMBDA_BASE_URL = 'https://api.lambdalabs.com/v1';
export const MOONSHOT_BASE_URL = 'https://api.moonshot.cn/v1';
export const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
export const YI_BASE_URL = 'https://api.lingyiwanwu.com/v1';
export const UPSTAGE_BASE_URL = 'https://api.upstage.ai/v1';
export const NOVITA_BASE_URL = 'https://api.novita.ai/v3/openai';
export const WRITER_BASE_URL = 'https://api.writer.com/v1';

// ── Env var names ──────────────────────────────────────────────────────────

const ENV = {
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
    CEREBRAS: 'CEREBRAS_API_KEY',
    SAMBANOVA: 'SAMBANOVA_API_KEY',
    NVIDIA: 'NVIDIA_API_KEY',
    AI21: 'AI21_API_KEY',
    HYPERBOLIC: 'HYPERBOLIC_API_KEY',
    LAMBDA: 'LAMBDA_API_KEY',
    MOONSHOT: 'MOONSHOT_API_KEY',
    DASHSCOPE: 'DASHSCOPE_API_KEY',
    ZHIPU: 'ZHIPU_API_KEY',
    YI: 'YI_API_KEY',
    UPSTAGE: 'UPSTAGE_API_KEY',
    NOVITA: 'NOVITA_API_KEY',
    WRITER: 'WRITER_API_KEY',
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

function makeConfig(
    base: { baseURL?: string; nativeProvider?: 'anthropic' | 'google' },
    apiKey: string | undefined,
    model: string,
): ResolvedModelConfig {
    const result: ResolvedModelConfig = { model };
    if (base.baseURL !== undefined) result.baseURL = base.baseURL;
    if (apiKey !== undefined) result.apiKey = apiKey;
    if (base.nativeProvider !== undefined) result.nativeProvider = base.nativeProvider;
    return result;
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
            return makeConfig({}, env(ge, ENV.OPENAI), modelId);

        case PROVIDER.ANTHROPIC:
            return makeConfig({ nativeProvider: 'anthropic' }, env(ge, ENV.ANTHROPIC), modelId);

        case PROVIDER.GOOGLE:
            return makeConfig({ nativeProvider: 'google' }, env(ge, ENV.GOOGLE) ?? env(ge, 'GEMINI_API_KEY'), modelId);

        case PROVIDER.GROQ:
            return makeConfig({ baseURL: GROQ_BASE_URL }, env(ge, ENV.GROQ), modelId);

        case PROVIDER.XAI:
            return makeConfig({ baseURL: XAI_BASE_URL }, env(ge, ENV.XAI), modelId);

        case PROVIDER.TOGETHER:
            return makeConfig({ baseURL: TOGETHER_BASE_URL }, env(ge, ENV.TOGETHER), modelId);

        case PROVIDER.FIREWORKS:
            return makeConfig({ baseURL: FIREWORKS_BASE_URL }, env(ge, ENV.FIREWORKS), modelId);

        case PROVIDER.DEEPSEEK:
            return makeConfig({ baseURL: DEEPSEEK_BASE_URL }, env(ge, ENV.DEEPSEEK), modelId);

        case PROVIDER.MISTRAL:
            return makeConfig({ baseURL: MISTRAL_BASE_URL }, env(ge, ENV.MISTRAL), modelId);

        case PROVIDER.COHERE:
            return makeConfig({ baseURL: COHERE_BASE_URL }, env(ge, ENV.COHERE), modelId);

        case PROVIDER.PERPLEXITY:
            return makeConfig({ baseURL: PERPLEXITY_BASE_URL }, env(ge, ENV.PERPLEXITY), modelId);

        case PROVIDER.OPENROUTER:
            return makeConfig({ baseURL: OPENROUTER_BASE_URL }, env(ge, ENV.OPENROUTER), modelId);

        case PROVIDER.OLLAMA:
            return makeConfig({ baseURL: OLLAMA_BASE_URL }, 'not-needed', modelId);

        case PROVIDER.LLAMABARN:
            return makeConfig({ baseURL: LLAMABARN_BASE_URL }, env(ge, ENV.LLAMABARN) ?? 'not-needed', modelId);

        case PROVIDER.CEREBRAS:
            return makeConfig({ baseURL: CEREBRAS_BASE_URL }, env(ge, ENV.CEREBRAS), modelId);

        case PROVIDER.SAMBANOVA:
            return makeConfig({ baseURL: SAMBANOVA_BASE_URL }, env(ge, ENV.SAMBANOVA), modelId);

        case PROVIDER.NVIDIA:
            return makeConfig({ baseURL: NVIDIA_BASE_URL }, env(ge, ENV.NVIDIA), modelId);

        case PROVIDER.AI21:
            return makeConfig({ baseURL: AI21_BASE_URL }, env(ge, ENV.AI21), modelId);

        case PROVIDER.HYPERBOLIC:
            return makeConfig({ baseURL: HYPERBOLIC_BASE_URL }, env(ge, ENV.HYPERBOLIC), modelId);

        case PROVIDER.LAMBDA:
            return makeConfig({ baseURL: LAMBDA_BASE_URL }, env(ge, ENV.LAMBDA), modelId);

        case PROVIDER.MOONSHOT:
            return makeConfig({ baseURL: MOONSHOT_BASE_URL }, env(ge, ENV.MOONSHOT), modelId);

        case PROVIDER.DASHSCOPE:
            return makeConfig({ baseURL: DASHSCOPE_BASE_URL }, env(ge, ENV.DASHSCOPE), modelId);

        case PROVIDER.ZHIPU:
            return makeConfig({ baseURL: ZHIPU_BASE_URL }, env(ge, ENV.ZHIPU), modelId);

        case PROVIDER.YI:
            return makeConfig({ baseURL: YI_BASE_URL }, env(ge, ENV.YI), modelId);

        case PROVIDER.UPSTAGE:
            return makeConfig({ baseURL: UPSTAGE_BASE_URL }, env(ge, ENV.UPSTAGE), modelId);

        case PROVIDER.NOVITA:
            return makeConfig({ baseURL: NOVITA_BASE_URL }, env(ge, ENV.NOVITA), modelId);

        case PROVIDER.WRITER:
            return makeConfig({ baseURL: WRITER_BASE_URL }, env(ge, ENV.WRITER), modelId);

        case PROVIDER.AZURE: {
            // format: azure:resource/deployment
            const slash = modelId.indexOf('/');
            if (slash <= 0) return undefined;
            const resource = modelId.slice(0, slash);
            const deployment = modelId.slice(slash + 1);
            const apiVersion = env(ge, 'AZURE_OPENAI_API_VERSION') ?? '2025-01-01-preview';
            return makeConfig(
                { baseURL: `https://${resource}.openai.azure.com/openai/deployments/${deployment}?api-version=${apiVersion}` },
                env(ge, 'AZURE_OPENAI_API_KEY'),
                deployment,
            );
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
