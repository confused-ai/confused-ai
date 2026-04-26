/**
 * Fallback Chain Provider
 *
 * Implements fallback chains that cascade through multiple LLM providers.
 * Useful for cost optimization (try cheaper models first) and reliability
 * (retry on rate limits or errors with alternative providers).
 */

import type { LLMProvider, Message, GenerateResult, GenerateOptions, StreamOptions } from './types.js';
import { LLMError } from '../shared/errors.js';

/**
 * Fallback strategy when a provider fails
 */
export enum FallbackStrategy {
    /**
     * Try next provider on any error
     */
    ANY_ERROR = 'any-error',

    /**
     * Try next provider only on rate limit errors
     */
    RATE_LIMIT = 'rate-limit',

    /**
     * Try next provider only on timeout errors
     */
    TIMEOUT = 'timeout',

    /**
     * Try next provider on API errors (4xx, 5xx)
     */
    API_ERROR = 'api-error',
}

/**
 * Fallback chain configuration
 */
export interface FallbackChainConfig {
    /**
     * Ordered list of LLM providers to try
     */
    providers: LLMProvider[];

    /**
     * Strategy for determining when to fallback
     */
    strategy?: FallbackStrategy;

    /**
     * Maximum retries across the chain
     */
    maxRetries?: number;

    /**
     * Enable logging for debugging fallback chain behavior
     */
    debug?: boolean;
}

/**
 * Determine if an error should trigger fallback
 */
function shouldFallback(error: Error, strategy: FallbackStrategy): boolean {
    const message = error.message.toLowerCase();

    switch (strategy) {
        case FallbackStrategy.ANY_ERROR:
            return true;

        case FallbackStrategy.RATE_LIMIT:
            return message.includes('rate limit') || message.includes('429') || message.includes('quota');

        case FallbackStrategy.TIMEOUT:
            return message.includes('timeout') || message.includes('timed out') || message.includes('408');

        case FallbackStrategy.API_ERROR:
            return (
                message.includes('api error') ||
                /[45]\d{2}/.test(message) ||
                message.includes('server error') ||
                message.includes('service unavailable')
            );

        default:
            return false;
    }
}

/**
 * Fallback Chain Provider
 *
 * Wraps multiple LLM providers and falls back to the next one if an error occurs.
 */
export class FallbackChainProvider implements LLMProvider {
    private providers: LLMProvider[];
    private strategy: FallbackStrategy;
    private maxRetries: number;
    private debug: boolean;
    private callHistory: Array<{ provider: number; model: string; success: boolean; error?: string }> = [];

    constructor(config: FallbackChainConfig) {
        if (config.providers.length === 0) {
            throw new Error('FallbackChainProvider requires at least one provider');
        }

        this.providers = config.providers;
        this.strategy = config.strategy ?? FallbackStrategy.RATE_LIMIT;
        this.maxRetries = config.maxRetries ?? 3;
        this.debug = config.debug ?? false;
    }

/**
 * Get the display name for this provider
 */
getName(): string {
    return `FallbackChain(${this.providers.map((_, i) => `Provider${i + 1}`).join(' → ')})`;
}

/**
 * Generate text using fallback chain
 */
async generateText(messages: Message[], options?: GenerateOptions): Promise<GenerateResult> {
    let lastError: Error = new Error('No providers available');
    let providerIndex = 0;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
            const provider = this.providers[providerIndex];

            if (this.debug) {
                console.log(`[FallbackChain] Attempt ${attempt + 1}: Provider ${providerIndex}`);
            }

            const result = await provider.generateText(messages, options);

            this.recordCall(providerIndex, options?.maxTokens ?? 0, true);

            if (this.debug) {
                console.log(`[FallbackChain] Success with Provider ${providerIndex}`);
            }

            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            this.recordCall(providerIndex, options?.maxTokens ?? 0, false, lastError.message);

            if (this.debug) {
                console.log(`[FallbackChain] Error at Provider ${providerIndex}: ${lastError.message}`);
            }

            // Check if we should fallback (vs. retry same provider)
            if (shouldFallback(lastError, this.strategy)) {
                providerIndex++;

                if (providerIndex >= this.providers.length) {
                    // Wrap around or fail?
                    // For now, wrap to first provider and continue retrying
                    providerIndex = 0;
                }
            } else {
                // Don't fallback, but might retry same provider
                // For non-fallback errors, break to avoid wasting tries
                break;
            }
        }
    }

    throw new LLMError(
        `All fallback providers exhausted (${this.providers.length} providers, ${this.maxRetries} attempts)`,
        { cause: lastError },
    );
}

/**
 * Stream text using fallback chain
 */
async streamText(messages: Message[], options?: StreamOptions): Promise<GenerateResult> {
    let lastError: Error = new Error('No providers available');
    let providerIndex = 0;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
            const provider = this.providers[providerIndex];

            if (this.debug) {
                console.log(`[FallbackChain] Stream attempt ${attempt + 1}: Provider ${providerIndex}`);
            }

            // Check if provider supports streaming
            if (!provider.streamText) {
                throw new Error(`Provider ${providerIndex} does not support streaming`);
            }

            const result = await provider.streamText(messages, options);

            this.recordCall(providerIndex, options?.maxTokens ?? 0, true);

            if (this.debug) {
                console.log(`[FallbackChain] Stream established with Provider ${providerIndex}`);
            }

            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            this.recordCall(providerIndex, options?.maxTokens ?? 0, false, lastError.message);

            if (this.debug) {
                console.log(
                    `[FallbackChain] Stream error at Provider ${providerIndex}: ${lastError.message}`,
                );
            }

            // Check if we should fallback
            if (shouldFallback(lastError, this.strategy)) {
                providerIndex++;

                if (providerIndex >= this.providers.length) {
                    providerIndex = 0;
                }
            } else {
                break;
            }
        }
    }

    throw new LLMError(
        `All fallback providers exhausted for streaming (${this.providers.length} providers, ${this.maxRetries} attempts)`,
        { cause: lastError },
    );
}

/**
 * Get success rate for each provider
 */
getStats(): {
    totalAttempts: number;
    successfulAttempts: number;
    providers: Array<{
        provider: string;
        attempts: number;
        successes: number;
        successRate: number;
    }>;
} {
    const providerStats = new Map<number, { attempts: number; successes: number }>();

    for (const call of this.callHistory) {
        const stats = providerStats.get(call.provider) ?? { attempts: 0, successes: 0 };
        stats.attempts++;
        if (call.success) stats.successes++;
        providerStats.set(call.provider, stats);
    }

    const providers = Array.from(providerStats.entries()).map(([idx, stats]) => ({
        provider: `Provider${idx + 1}`,
        attempts: stats.attempts,
        successes: stats.successes,
        successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0,
    }));

    const totalAttempts = this.callHistory.length;
    const successfulAttempts = this.callHistory.filter((c) => c.success).length;

    return {
        totalAttempts,
        successfulAttempts,
        providers,
    };
}

    /**
     * Clear call history
     */
    clearStats(): void {
        this.callHistory = [];
    }

    /**
     * Record a call attempt
     */
    private recordCall(providerIndex: number, maxTokens: number, success: boolean, error?: string): void {
        this.callHistory.push({ provider: providerIndex, model: `Provider${providerIndex + 1}(${maxTokens}tk)`, success, error });
    }
}

/**
 * Convenience function to create a cost-optimized fallback chain
 * Tries cheaper models first before falling back to more expensive ones
 *
 * @example
 * ```ts
 * const chain = createCostOptimizedChain([
 *   new OpenAIProvider({ model: 'gpt-3.5-turbo' }), // Cheap
 *   new OpenAIProvider({ model: 'gpt-4' }),         // Expensive
 * ]);
 * ```
 */
export function createCostOptimizedChain(providers: LLMProvider[]): FallbackChainProvider {
    return new FallbackChainProvider({
        providers,
        strategy: FallbackStrategy.RATE_LIMIT,
        maxRetries: 2,
    });
}

/**
 * Convenience function to create a reliability-focused fallback chain
 * Tries multiple providers to maximize uptime
 */
export function createReliabilityChain(providers: LLMProvider[]): FallbackChainProvider {
    return new FallbackChainProvider({
        providers,
        strategy: FallbackStrategy.ANY_ERROR,
        maxRetries: 5,
    });
}
