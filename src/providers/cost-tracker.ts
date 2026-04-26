/**
 * Cost Tracking — token usage and estimated costs for LLM API calls.
 * Prices in USD per 1 M tokens (as of 2025-Q2; verify before billing customers).
 */

export const MODEL_PRICING: Record<
    string,
    { input: number; output: number; cache?: { input: number; output: number } }
> = {
    // ── OpenAI ────────────────────────────────────────────────────────────
    'gpt-4o': { input: 2.5, output: 10, cache: { input: 1.25, output: 5 } },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4o-audio-preview': { input: 2.5, output: 10 },
    'gpt-4.1': { input: 2, output: 8, cache: { input: 0.5, output: 2 } },
    'gpt-4.1-mini': { input: 0.4, output: 1.6, cache: { input: 0.1, output: 0.4 } },
    'gpt-4.1-nano': { input: 0.1, output: 0.4, cache: { input: 0.025, output: 0.1 } },
    'gpt-4-turbo': { input: 10, output: 30, cache: { input: 5, output: 15 } },
    'gpt-4-turbo-preview': { input: 10, output: 30 },
    'gpt-4': { input: 30, output: 60 },
    'gpt-4-32k': { input: 60, output: 120 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
    'gpt-3.5-turbo-16k': { input: 3, output: 4 },
    'o1': { input: 15, output: 60, cache: { input: 7.5, output: 30 } },
    'o1-mini': { input: 3, output: 12, cache: { input: 1.5, output: 6 } },
    'o3': { input: 10, output: 40, cache: { input: 2.5, output: 10 } },
    'o3-mini': { input: 1.1, output: 4.4, cache: { input: 0.55, output: 2.2 } },
    'o4-mini': { input: 1.1, output: 4.4, cache: { input: 0.275, output: 1.1 } },
    // Embeddings
    'text-embedding-3-small': { input: 0.02, output: 0 },
    'text-embedding-3-large': { input: 0.13, output: 0 },
    'text-embedding-ada-002': { input: 0.1, output: 0 },

    // ── Anthropic (Claude) ────────────────────────────────────────────────
    'claude-opus-4': { input: 15, output: 75, cache: { input: 1.5, output: 7.5 } },
    'claude-sonnet-4': { input: 3, output: 15, cache: { input: 0.3, output: 1.5 } },
    'claude-3-7-sonnet-20250219': { input: 3, output: 15, cache: { input: 0.3, output: 1.5 } },
    'claude-3-5-sonnet-20241022': { input: 3, output: 15, cache: { input: 0.3, output: 1.5 } },
    'claude-3-5-sonnet': { input: 3, output: 15, cache: { input: 0.3, output: 1.5 } },
    'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
    'claude-3-5-haiku': { input: 0.8, output: 4 },
    'claude-3-opus-20240229': { input: 15, output: 75, cache: { input: 1.5, output: 7.5 } },
    'claude-3-opus': { input: 15, output: 75, cache: { input: 1.5, output: 7.5 } },
    'claude-3-sonnet': { input: 3, output: 15 },
    'claude-3-haiku': { input: 0.25, output: 1.25, cache: { input: 0.03, output: 0.15 } },

    // ── Google Gemini ─────────────────────────────────────────────────────
    'gemini-2.5-pro-preview-05-06': { input: 1.25, output: 10, cache: { input: 0.31, output: 2.5 } },
    'gemini-2.5-pro-preview': { input: 1.25, output: 10, cache: { input: 0.31, output: 2.5 } },
    'gemini-2.5-flash-preview-04-17': { input: 0.15, output: 0.6, cache: { input: 0.037, output: 0.15 } },
    'gemini-2.0-flash': { input: 0.1, output: 0.4, cache: { input: 0.025, output: 0.1 } },
    'gemini-2.0-flash-lite': { input: 0.075, output: 0.3 },
    'gemini-1.5-pro': { input: 1.25, output: 5, cache: { input: 0.0625, output: 0.3125 } },
    'gemini-1.5-flash': { input: 0.075, output: 0.3, cache: { input: 0.006, output: 0.024 } },
    'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },
    'gemini-pro': { input: 0.5, output: 1.5 },

    // ── Groq (open models via LPU) ────────────────────────────────────────
    'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
    'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
    'llama3-70b-8192': { input: 0.59, output: 0.79 },
    'llama3-8b-8192': { input: 0.05, output: 0.08 },
    'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
    'gemma2-9b-it': { input: 0.2, output: 0.2 },
    'gemma-7b-it': { input: 0.07, output: 0.07 },

    // ── xAI (Grok) ────────────────────────────────────────────────────────
    'grok-3': { input: 3, output: 15 },
    'grok-3-mini': { input: 0.3, output: 0.5 },
    'grok-2': { input: 2, output: 10 },
    'grok-beta': { input: 5, output: 15 },

    // ── Together AI ───────────────────────────────────────────────────────
    'meta-llama/Llama-3.3-70B-Instruct-Turbo': { input: 0.88, output: 0.88 },
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': { input: 0.18, output: 0.18 },
    'Qwen/Qwen2.5-72B-Instruct-Turbo': { input: 1.2, output: 1.2 },
    'mistralai/Mixtral-8x22B-Instruct-v0.1': { input: 1.2, output: 1.2 },

    // ── DeepSeek ──────────────────────────────────────────────────────────
    'deepseek-chat': { input: 0.27, output: 1.1, cache: { input: 0.07, output: 0.28 } },
    'deepseek-reasoner': { input: 0.55, output: 2.19, cache: { input: 0.14, output: 0.55 } },

    // ── Mistral ───────────────────────────────────────────────────────────
    'mistral-large-latest': { input: 2, output: 6 },
    'mistral-small-latest': { input: 0.1, output: 0.3 },
    'codestral-latest': { input: 0.2, output: 0.6 },
    'open-mistral-nemo': { input: 0.15, output: 0.15 },
    'open-mixtral-8x22b': { input: 2, output: 6 },

    // ── Cohere ────────────────────────────────────────────────────────────
    'command-r-plus-08-2024': { input: 2.5, output: 10 },
    'command-r-08-2024': { input: 0.15, output: 0.6 },
    'command-r7b-12-2024': { input: 0.0375, output: 0.15 },

    // ── Perplexity ────────────────────────────────────────────────────────
    'sonar-pro': { input: 3, output: 15 },
    'sonar': { input: 1, output: 1 },
    'sonar-reasoning-pro': { input: 2, output: 8 },
    'sonar-reasoning': { input: 1, output: 5 },

    // ── Open-source / local (free) ────────────────────────────────────────
    'llama-2-7b': { input: 0, output: 0 },
    'llama-2-13b': { input: 0, output: 0 },
    'llama-2-70b': { input: 0, output: 0 },
    'mistral-7b': { input: 0, output: 0 },
    'mixtral-8x7b': { input: 0, output: 0 },

    // ── Default fallback ──────────────────────────────────────────────────
    '__default__': { input: 0, output: 0 },
};

export interface TokenUsage {
    input: number;
    output: number;
    cache?: { cacheCreation?: number; cacheRead?: number };
}

export interface CostCalculation {
    model: string;
    tokens: TokenUsage;
    inputCost: number;
    outputCost: number;
    cacheCost?: number;
    totalCost: number;
}

export class CostTracker {
    private calls: CostCalculation[] = [];
    private modelTotals = new Map<string, { calls: number; tokens: TokenUsage; cost: number }>();

    recordCall(model: string, tokens: TokenUsage): CostCalculation {
        // fuzzy match: strip date suffixes (e.g. claude-3-5-sonnet-20241022 → claude-3-5-sonnet)
        const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[model.replace(/-\d{8}$/, '')] ?? MODEL_PRICING['__default__']!;

        let inputCost = (tokens.input / 1_000_000) * pricing.input;
        const outputCost = (tokens.output / 1_000_000) * pricing.output;
        let cacheCost = 0;

        if (tokens.cache?.cacheRead && pricing.cache) {
            const saved = (tokens.cache.cacheRead / 1_000_000) * (pricing.input - pricing.cache.input);
            cacheCost = -saved; // negative = savings
        }
        if (tokens.cache?.cacheCreation && pricing.cache) {
            const writeCost = (tokens.cache.cacheCreation / 1_000_000) * (pricing.cache.output ?? pricing.output);
            cacheCost += writeCost;
        }

        const totalCost = inputCost + outputCost + cacheCost;

        const result: CostCalculation = {
            model, tokens, inputCost, outputCost,
            cacheCost: cacheCost !== 0 ? cacheCost : undefined,
            totalCost,
        };
        this.calls.push(result);

        const existing = this.modelTotals.get(model) ?? { calls: 0, tokens: { input: 0, output: 0 }, cost: 0 };
        this.modelTotals.set(model, {
            calls: existing.calls + 1,
            tokens: {
                input: existing.tokens.input + tokens.input,
                output: existing.tokens.output + tokens.output,
                cache: tokens.cache ? {
                    cacheCreation: (existing.tokens.cache?.cacheCreation ?? 0) + (tokens.cache.cacheCreation ?? 0),
                    cacheRead: (existing.tokens.cache?.cacheRead ?? 0) + (tokens.cache.cacheRead ?? 0),
                } : existing.tokens.cache,
            },
            cost: existing.cost + totalCost,
        });

        return result;
    }

    getTotalCost(): number {
        return this.calls.reduce((s, c) => s + c.totalCost, 0);
    }

    getTotalTokens(): TokenUsage {
        return this.calls.reduce<TokenUsage>((sum, call) => ({
            input: sum.input + call.tokens.input,
            output: sum.output + call.tokens.output,
            cache: (call.tokens.cache || sum.cache) ? {
                cacheCreation: (sum.cache?.cacheCreation ?? 0) + (call.tokens.cache?.cacheCreation ?? 0),
                cacheRead: (sum.cache?.cacheRead ?? 0) + (call.tokens.cache?.cacheRead ?? 0),
            } : undefined,
        }), { input: 0, output: 0 });
    }

    getByModel(model: string) { return this.modelTotals.get(model); }

    getAllModels() {
        return Array.from(this.modelTotals.entries()).map(([model, data]) => ({ model, ...data }));
    }

    getCallHistory(): CostCalculation[] { return [...this.calls]; }

    getSummary() {
        const total = this.getTotalCost();
        const tokens = this.getTotalTokens();
        const calls = this.calls.length;
        return {
            totalCalls: calls,
            totalCost: total,
            totalTokens: tokens,
            averageCostPerCall: calls > 0 ? total / calls : 0,
            costPerMillionTokens: (tokens.input + tokens.output) > 0
                ? (total / (tokens.input + tokens.output)) * 1_000_000 : 0,
            models: this.getAllModels(),
        };
    }

    clear(): void { this.calls = []; this.modelTotals.clear(); }
}

export function estimateCost(model: string, tokens: TokenUsage): number {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[model.replace(/-\d{8}$/, '')] ?? MODEL_PRICING['__default__']!;
    return (tokens.input / 1_000_000) * pricing.input + (tokens.output / 1_000_000) * pricing.output;
}
