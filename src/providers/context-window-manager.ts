/**
 * Context Window Manager
 *
 * Handles prompt length enforcement, automatic summarization, and sliding window
 * strategies to keep LLM contexts within model limits.
 */

import type { Message } from './types.js';

/**
 * Context window limits by model (token budgets — approximate; verify with provider docs).
 * Keys are lowercase; use {@link resolveModelKeyForContextLimit} for `provider:model` strings.
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
    // OpenAI models
    'gpt-4o': 128_000,
    'gpt-4o-mini': 128_000,
    'gpt-4.1': 128_000,
    'gpt-4.1-mini': 128_000,
    'gpt-4-turbo': 128_000,
    'gpt-4-turbo-preview': 128_000,
    'gpt-4-turbo-2024-04-09': 128_000,
    'gpt-4': 8_192,
    'gpt-4-32k': 32_768,
    'gpt-3.5-turbo': 4_096,
    'gpt-3.5-turbo-16k': 16_384,
    'o1': 200_000,
    'o1-preview': 128_000,
    'o1-mini': 128_000,
    'o3-mini': 200_000,

    // Anthropic Claude models
    'claude-3-5-sonnet-20241022': 200_000,
    'claude-3-5-haiku-20241022': 200_000,
    'claude-3-5-sonnet': 200_000,
    'claude-3-5-haiku': 200_000,
    'claude-3-opus-20240229': 200_000,
    'claude-3-opus': 200_000,
    'claude-3-sonnet-20240229': 200_000,
    'claude-3-sonnet': 200_000,
    'claude-3-haiku-20240307': 200_000,
    'claude-3-haiku': 200_000,
    'claude-2.1': 100_000,
    'claude-2': 100_000,
    'claude-instant-1.2': 100_000,

    // Google Gemini
    'gemini-2.0-flash': 1_000_000,
    'gemini-2.0-flash-001': 1_000_000,
    'gemini-2.5-pro-preview-03-25': 1_000_000,
    'gemini-1.5-pro': 1_000_000,
    'gemini-1.5-flash': 1_000_000,
    'gemini-1.5-flash-8b': 1_000_000,
    'gemini-pro': 32_000,

    // Open source / local models (typical)
    'llama-2-7b': 4_096,
    'llama-2-13b': 4_096,
    'llama-2-70b': 4_096,
    'mistral-7b': 8_192,
    'mixtral-8x7b': 32_768,

    // Llama 3.x (Meta) — 128k context
    'llama-3-8b': 128_000,
    'llama-3-70b': 128_000,
    'llama-3.1-8b': 128_000,
    'llama-3.1-70b': 128_000,
    'llama-3.1-405b': 128_000,
    'llama-3.2-1b': 128_000,
    'llama-3.2-3b': 128_000,
    'llama-3.2-11b-vision': 128_000,
    'llama-3.2-90b-vision': 128_000,
    'llama-3.3-70b': 128_000,

    // Groq model identifiers
    'llama-3.3-70b-versatile': 128_000,
    'llama-3.1-70b-versatile': 128_000,
    'llama-3.1-8b-instant': 128_000,
    'llama3-70b-8192': 8_192,
    'llama3-8b-8192': 8_192,
    'mixtral-8x7b-32768': 32_768,
    'gemma2-9b-it': 8_192,
    'gemma-7b-it': 8_192,

    // Anthropic Claude 3.7
    'claude-3-7-sonnet-20250219': 200_000,
    'claude-3-7-sonnet': 200_000,
    // Anthropic claude-4 / latest aliases
    'claude-opus-4': 200_000,
    'claude-sonnet-4': 200_000,

    // DeepSeek
    'deepseek-chat': 64_000,
    'deepseek-reasoner': 64_000,

    // Mistral (latest)
    'mistral-large-latest': 128_000,
    'mistral-small-latest': 32_000,
    'codestral-latest': 32_000,
    'open-mistral-nemo': 128_000,
    'open-mixtral-8x22b': 65_536,

    // xAI Grok
    'grok-3': 131_072,
    'grok-3-mini': 131_072,
    'grok-2': 131_072,

    // Cohere
    'command-r-plus-08-2024': 128_000,
    'command-r-08-2024': 128_000,
    'command-r7b-12-2024': 128_000,

    // Default for unknown models
    '__default__': 4_096,
};

/**
 * Strip `provider:` (e.g. `openai:gpt-4o` → `gpt-4o`) for table lookup.
 */
export function resolveModelKeyForContextLimit(model: string): string {
    let m = model.trim();
    const colon = m.lastIndexOf(':');
    if (colon >= 0) {
        const rest = m.slice(colon + 1);
        if (!rest.startsWith('//')) {
            m = rest;
        }
    }
    return m.trim().toLowerCase();
}

/**
 * Resolve context window size for a model id or `provider:model` string.
 */
export function getContextLimitForModel(model: string, explicitLimit?: number): number {
    if (explicitLimit != null && explicitLimit > 0) {
        return explicitLimit;
    }
    const key = resolveModelKeyForContextLimit(model);
    const direct = MODEL_CONTEXT_LIMITS[key];
    if (direct != null) {
        return direct;
    }
    const slashSeg = key.includes('/') ? (key.split('/').pop() as string) : '';
    if (slashSeg && MODEL_CONTEXT_LIMITS[slashSeg] != null) {
        return MODEL_CONTEXT_LIMITS[slashSeg];
    }
    const noSnapshot = key.replace(/-\d{8}$/, '');
    if (noSnapshot !== key && MODEL_CONTEXT_LIMITS[noSnapshot] != null) {
        return MODEL_CONTEXT_LIMITS[noSnapshot];
    }
    return MODEL_CONTEXT_LIMITS['__default__'];
}

/**
 * Token counting estimates
 * Rough estimates based on tokenizer implementations
 */
export const TOKEN_ESTIMATES = {
    // English text: ~4 chars per token on average
    CHARS_PER_TOKEN: 3.5,

    // Tool definitions: ~100 tokens per tool on average
    TOKENS_PER_TOOL: 100,

    // System prompt overhead
    SYSTEM_PROMPT_TOKENS: 50,
};

/**
 * Configuration for context window manager
 */
export interface ContextWindowManagerConfig {
    /**
     * Model name (used to look up context limit)
     */
    model: string;

    /**
     * Explicit context limit (overrides model-based lookup)
     */
    contextLimit?: number;

    /**
     * Reserved tokens for output (safety margin)
     * Default: 2000 (enough for ~500 word response)
     */
    reservedTokens?: number;

    /**
     * Strategy for handling oversized context
     * 'truncate': Remove oldest messages (DEFAULT)
     * 'summarize': Summarize oldest messages instead of removing
     * 'sliding_window': Keep only N most recent messages
     */
    strategy?: 'truncate' | 'summarize' | 'sliding_window';

    /**
     * For sliding_window strategy: max messages to keep
     */
    maxMessages?: number;

    /**
     * Callback to summarize a batch of messages
     * Only used if strategy === 'summarize'
     */
    summarizer?: (messages: Message[]) => Promise<string>;
}

/**
 * Token counting for messages
 */
export function estimateTokenCount(text: string | Message[]): number {
    if (typeof text === 'string') {
        return Math.ceil(text.length / TOKEN_ESTIMATES.CHARS_PER_TOKEN);
    }

    let total = TOKEN_ESTIMATES.SYSTEM_PROMPT_TOKENS;
    for (const msg of text) {
        const contentTokens = Array.isArray(msg.content)
            ? msg.content.reduce((sum, part) => {
                if (typeof part === 'string') {
                    return sum + estimateTokenCount(part);
                } else if ('type' in part && part.type === 'text') {
                    return sum + estimateTokenCount((part as { text: string }).text);
                }
                return sum;
            }, 0)
            : estimateTokenCount(msg.content as string);

        total += contentTokens + 4; // Role + formatting overhead
    }

    return total;
}

/**
 * Context Window Manager for automatic prompt compression
 */
export class ContextWindowManager {
    private config: Required<Omit<ContextWindowManagerConfig, 'summarizer'>> & {
        summarizer?: (messages: Message[]) => Promise<string>;
    };
    private contextLimit: number;
    private maxPromptTokens: number;

    constructor(config: ContextWindowManagerConfig) {
        const contextLimit = getContextLimitForModel(config.model, config.contextLimit);

        this.contextLimit = contextLimit;
        this.config = {
            model: config.model,
            reservedTokens: config.reservedTokens ?? 2000,
            strategy: config.strategy ?? 'truncate',
            maxMessages: config.maxMessages ?? 10,
            contextLimit,
            summarizer: config.summarizer,
        };

        this.maxPromptTokens = Math.max(1024, this.contextLimit - this.config.reservedTokens);
    }

    /**
     * Enforce context window limits on messages
     * Returns array of messages that fit within context limit
     */
    async enforceLimit(
        messages: Message[],
        toolDefinitions?: Array<{ name: string; description: string }>,
    ): Promise<{ messages: Message[]; dropped: number; summarized: boolean }> {
        const toolTokens = (toolDefinitions?.length ?? 0) * TOKEN_ESTIMATES.TOKENS_PER_TOOL;
        const availableTokens = this.maxPromptTokens - toolTokens;

        let currentTokens = estimateTokenCount(messages);
        let dropped = 0;
        let summarized = false;

        if (currentTokens <= availableTokens) {
            return { messages, dropped: 0, summarized: false };
        }

        let result = [...messages];

        // Strategy 1: Truncate (remove oldest messages until it fits)
        if (this.config.strategy === 'truncate') {
            while (result.length > 1) {
                const nextMessages = result.slice(1);
                currentTokens = estimateTokenCount(nextMessages);

                if (currentTokens <= availableTokens) {
                    dropped = result.length - nextMessages.length;
                    return { messages: nextMessages, dropped, summarized: false };
                }

                result = nextMessages;
            }

            return { messages: result, dropped: messages.length - 1, summarized: false };
        }

        // Strategy 2: Summarize (compress oldest messages into a summary)
        if (this.config.strategy === 'summarize' && this.config.summarizer) {
            const toSummarize = result.slice(0, Math.floor(result.length / 2));
            const toKeep = result.slice(toSummarize.length);

            try {
                const summary = await this.config.summarizer(toSummarize);
                const summaryMessage: Message = {
                    role: 'system',
                    content: `[Summary of previous context]\n${summary}`,
                };

                result = [summaryMessage, ...toKeep];
                currentTokens = estimateTokenCount(result);

                if (currentTokens > availableTokens && result.length > 2) {
                    // Still too large, fall back to truncation
                    result = result.slice(1);
                }

                return { messages: result, dropped: toSummarize.length, summarized: true };
            } catch (error) {
                // Summarization failed, fall back to truncation
                console.warn('Summarization failed, falling back to truncate:', error);
            }
        }

        // Strategy 3: Sliding window (keep only last N messages)
        if (this.config.strategy === 'sliding_window' && result.length > this.config.maxMessages) {
            dropped = result.length - this.config.maxMessages;
            return { messages: result.slice(dropped), dropped, summarized: false };
        }

        return { messages: result, dropped, summarized };
    }

    /**
     * Get remaining token budget for generation
     */
    getRemainingTokenBudget(messages: Message[]): number {
        const usedTokens = estimateTokenCount(messages);
        return Math.max(0, this.maxPromptTokens - usedTokens);
    }

    /**
     * Get context limit for this model
     */
    getContextLimit(): number {
        return this.contextLimit;
    }

    /**
     * Get max tokens available for prompt (after reserved for output)
     */
    getMaxPromptTokens(): number {
        return this.maxPromptTokens;
    }
}
