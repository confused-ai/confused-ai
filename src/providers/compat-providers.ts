/**
 * OpenAI-compatible provider factories for Groq, xAI, Together AI,
 * Fireworks AI, DeepSeek, Mistral, Cohere, and Perplexity.
 *
 * All these services expose an OpenAI-compatible REST API, so they
 * are thin wrappers around OpenAIProvider with a different base URL.
 */

import type { LLMProvider } from './types.js';
import { OpenAIProvider } from './openai-provider.js';

// ── Base URLs ──────────────────────────────────────────────────────────────

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const XAI_BASE_URL = 'https://api.x.ai/v1';
export const TOGETHER_BASE_URL = 'https://api.together.xyz/v1';
export const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
export const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
export const COHERE_BASE_URL = 'https://api.cohere.com/compatibility/v1';
export const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';
export const AZURE_BASE_URL_TEMPLATE = 'https://{resource}.openai.azure.com/openai/deployments/{deployment}';

// ── Groq ──────────────────────────────────────────────────────────────────

export interface GroqProviderConfig {
    /** Groq API key (or GROQ_API_KEY env var) */
    apiKey?: string;
    /**
     * Model id. Default: llama-3.3-70b-versatile
     * Fast options: llama-3.1-8b-instant, gemma2-9b-it, mixtral-8x7b-32768
     */
    model?: string;
    debug?: boolean;
}

/** Ultra-fast inference via Groq's Language Processing Units (LPUs). */
export function createGroqProvider(config: GroqProviderConfig = {}): LLMProvider {
    const apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env.GROQ_API_KEY : undefined);
    if (!apiKey) throw new Error('GroqProvider requires apiKey or GROQ_API_KEY env var');
    return new OpenAIProvider({
        apiKey,
        baseURL: GROQ_BASE_URL,
        model: config.model ?? 'llama-3.3-70b-versatile',
        debug: config.debug,
    });
}

// ── xAI (Grok) ────────────────────────────────────────────────────────────

export interface XAIProviderConfig {
    /** xAI API key (or XAI_API_KEY env var) */
    apiKey?: string;
    /**
     * Model id. Default: grok-3
     * Options: grok-3-mini, grok-2, grok-2-mini, grok-beta
     */
    model?: string;
    debug?: boolean;
}

/** xAI's Grok models — reasoning-capable, large-context. */
export function createXAIProvider(config: XAIProviderConfig = {}): LLMProvider {
    const apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env.XAI_API_KEY : undefined);
    if (!apiKey) throw new Error('XAIProvider requires apiKey or XAI_API_KEY env var');
    return new OpenAIProvider({
        apiKey,
        baseURL: XAI_BASE_URL,
        model: config.model ?? 'grok-3',
        debug: config.debug,
    });
}

// ── Together AI ───────────────────────────────────────────────────────────

export interface TogetherProviderConfig {
    /** Together AI API key (or TOGETHER_API_KEY env var) */
    apiKey?: string;
    /**
     * Model id. Default: meta-llama/Llama-3.3-70B-Instruct-Turbo
     * Options: mistralai/Mixtral-8x22B-Instruct-v0.1, Qwen/Qwen2.5-72B-Instruct-Turbo, etc.
     */
    model?: string;
    debug?: boolean;
}

/** Together AI — open-source models at scale. */
export function createTogetherProvider(config: TogetherProviderConfig = {}): LLMProvider {
    const apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env.TOGETHER_API_KEY : undefined);
    if (!apiKey) throw new Error('TogetherProvider requires apiKey or TOGETHER_API_KEY env var');
    return new OpenAIProvider({
        apiKey,
        baseURL: TOGETHER_BASE_URL,
        model: config.model ?? 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        debug: config.debug,
    });
}

// ── Fireworks AI ──────────────────────────────────────────────────────────

export interface FireworksProviderConfig {
    /** Fireworks API key (or FIREWORKS_API_KEY env var) */
    apiKey?: string;
    /**
     * Model id. Default: accounts/fireworks/models/llama-v3p3-70b-instruct
     * Fast: accounts/fireworks/models/llama-v3p1-8b-instruct
     */
    model?: string;
    debug?: boolean;
}

/** Fireworks AI — fast open-source model inference. */
export function createFireworksProvider(config: FireworksProviderConfig = {}): LLMProvider {
    const apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env.FIREWORKS_API_KEY : undefined);
    if (!apiKey) throw new Error('FireworksProvider requires apiKey or FIREWORKS_API_KEY env var');
    return new OpenAIProvider({
        apiKey,
        baseURL: FIREWORKS_BASE_URL,
        model: config.model ?? 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        debug: config.debug,
    });
}

// ── DeepSeek ──────────────────────────────────────────────────────────────

export interface DeepSeekProviderConfig {
    /** DeepSeek API key (or DEEPSEEK_API_KEY env var) */
    apiKey?: string;
    /**
     * Model id. Default: deepseek-chat (DeepSeek-V3)
     * Reasoning: deepseek-reasoner (DeepSeek-R1)
     */
    model?: string;
    debug?: boolean;
}

/** DeepSeek — high-performance models including DeepSeek-V3 and R1. */
export function createDeepSeekProvider(config: DeepSeekProviderConfig = {}): LLMProvider {
    const apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env.DEEPSEEK_API_KEY : undefined);
    if (!apiKey) throw new Error('DeepSeekProvider requires apiKey or DEEPSEEK_API_KEY env var');
    return new OpenAIProvider({
        apiKey,
        baseURL: DEEPSEEK_BASE_URL,
        model: config.model ?? 'deepseek-chat',
        debug: config.debug,
    });
}

// ── Mistral ───────────────────────────────────────────────────────────────

export interface MistralProviderConfig {
    /** Mistral API key (or MISTRAL_API_KEY env var) */
    apiKey?: string;
    /**
     * Model id. Default: mistral-large-latest
     * Options: mistral-small-latest, mistral-medium-latest, codestral-latest, open-mistral-nemo
     */
    model?: string;
    debug?: boolean;
}

/** Mistral AI — European frontier models. */
export function createMistralProvider(config: MistralProviderConfig = {}): LLMProvider {
    const apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env.MISTRAL_API_KEY : undefined);
    if (!apiKey) throw new Error('MistralProvider requires apiKey or MISTRAL_API_KEY env var');
    return new OpenAIProvider({
        apiKey,
        baseURL: MISTRAL_BASE_URL,
        model: config.model ?? 'mistral-large-latest',
        debug: config.debug,
    });
}

// ── Cohere ────────────────────────────────────────────────────────────────

export interface CohereProviderConfig {
    /** Cohere API key (or COHERE_API_KEY env var) */
    apiKey?: string;
    /**
     * Model id. Default: command-r-plus-08-2024
     * Options: command-r-08-2024, command-r7b-12-2024
     */
    model?: string;
    debug?: boolean;
}

/** Cohere — Command R models optimized for RAG and tool use. */
export function createCohereProvider(config: CohereProviderConfig = {}): LLMProvider {
    const apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env.COHERE_API_KEY : undefined);
    if (!apiKey) throw new Error('CohereProvider requires apiKey or COHERE_API_KEY env var');
    return new OpenAIProvider({
        apiKey,
        baseURL: COHERE_BASE_URL,
        model: config.model ?? 'command-r-plus-08-2024',
        debug: config.debug,
    });
}

// ── Perplexity ────────────────────────────────────────────────────────────

export interface PerplexityProviderConfig {
    /** Perplexity API key (or PERPLEXITY_API_KEY env var) */
    apiKey?: string;
    /**
     * Model id. Default: sonar-pro
     * Options: sonar, sonar-reasoning-pro, sonar-reasoning, sonar-deep-research
     */
    model?: string;
    debug?: boolean;
}

/** Perplexity — web-grounded models with real-time search. */
export function createPerplexityProvider(config: PerplexityProviderConfig = {}): LLMProvider {
    const apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env.PERPLEXITY_API_KEY : undefined);
    if (!apiKey) throw new Error('PerplexityProvider requires apiKey or PERPLEXITY_API_KEY env var');
    return new OpenAIProvider({
        apiKey,
        baseURL: PERPLEXITY_BASE_URL,
        model: config.model ?? 'sonar-pro',
        debug: config.debug,
    });
}

// ── Azure OpenAI ──────────────────────────────────────────────────────────

export interface AzureOpenAIProviderConfig {
    /** Azure OpenAI API key (or AZURE_OPENAI_API_KEY env var) */
    apiKey?: string;
    /** Azure resource name (or AZURE_OPENAI_RESOURCE env var) */
    resource?: string;
    /** Azure deployment name (or AZURE_OPENAI_DEPLOYMENT env var) */
    deployment?: string;
    /** API version (default: 2025-01-01-preview) */
    apiVersion?: string;
    debug?: boolean;
}

/** Azure OpenAI — enterprise-grade OpenAI hosting. */
export function createAzureOpenAIProvider(config: AzureOpenAIProviderConfig = {}): LLMProvider {
    const apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env.AZURE_OPENAI_API_KEY : undefined);
    const resource = config.resource ?? (typeof process !== 'undefined' ? process.env.AZURE_OPENAI_RESOURCE : undefined);
    const deployment = config.deployment ?? (typeof process !== 'undefined' ? process.env.AZURE_OPENAI_DEPLOYMENT : undefined);
    if (!apiKey) throw new Error('AzureOpenAIProvider requires apiKey or AZURE_OPENAI_API_KEY env var');
    if (!resource) throw new Error('AzureOpenAIProvider requires resource or AZURE_OPENAI_RESOURCE env var');
    if (!deployment) throw new Error('AzureOpenAIProvider requires deployment or AZURE_OPENAI_DEPLOYMENT env var');
    const apiVersion = config.apiVersion ?? '2025-01-01-preview';
    const baseURL = `https://${resource}.openai.azure.com/openai/deployments/${deployment}?api-version=${apiVersion}`;
    return new OpenAIProvider({ apiKey, baseURL, model: deployment, debug: config.debug });
}
