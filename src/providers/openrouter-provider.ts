/**
 * OpenRouter LLM provider.
 * OpenRouter (https://openrouter.ai) routes to many models (OpenAI, Anthropic, Google, Meta, etc.) via one API.
 * Uses the OpenAI-compatible endpoint; this is a thin wrapper around OpenAIProvider.
 */

import type { LLMProvider } from './types.js';
import { OpenAIProvider } from './openai-provider.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterProviderConfig {
    /** OpenRouter API key (or set OPENROUTER_API_KEY). */
    apiKey: string;
    /** Model id, e.g. openai/gpt-4o, anthropic/claude-3-sonnet, google/gemini-pro. Default: openai/gpt-4o */
    model?: string;
}

/**
 * Create an LLM provider that uses OpenRouter.
 * Gives access to many best-in-class models (OpenAI, Anthropic, Google, etc.) through one API.
 */
export function createOpenRouterProvider(config: OpenRouterProviderConfig): LLMProvider {
    return new OpenAIProvider({
        apiKey: config.apiKey,
        baseURL: OPENROUTER_BASE_URL,
        model: config.model ?? ((typeof process !== 'undefined' && process.env?.OPENROUTER_MODEL) || 'qwen/qwen3.6-plus:free'),
    });
}
