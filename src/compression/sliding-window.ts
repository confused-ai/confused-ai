/**
 * Sliding Window
 * ==============
 * Simple, deterministic context truncation — no LLM calls required.
 *
 * Strategies:
 *   - `lastN`      — keep the last N messages exactly
 *   - `tokenBudget` — drop oldest messages until total tokens fit budget
 *   - `hybrid`     — keep system message + lastN OR tokenBudget (whichever
 *                    is smaller), always preserving the system prompt
 *
 * When to use this vs SummaryBufferMemory:
 *   - Use SlidingWindow when latency matters more than completeness
 *   - Use SummaryBufferMemory when facts from older turns are still needed
 *
 * Usage:
 *   const window = createSlidingWindow({ strategy: 'tokenBudget', maxTokens: 4000 });
 *   const trimmed = window.apply(messages);
 */

import { countTokens } from './token-counter.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SlidingWindowMessage {
    role: string;
    content?: string | null;
    [key: string]: unknown;
}

export type SlidingWindowStrategy = 'lastN' | 'tokenBudget' | 'hybrid';

export interface SlidingWindowConfig {
    /** Truncation strategy. Default: 'tokenBudget' */
    strategy?: SlidingWindowStrategy;

    /**
     * For 'lastN': number of messages to keep (excluding system).
     * For 'hybrid': fallback lastN if tokenBudget isn't reached.
     */
    maxMessages?: number;

    /**
     * For 'tokenBudget' and 'hybrid': maximum total tokens.
     * Uses built-in estimator (fast, sync).
     */
    maxTokens?: number;

    /**
     * If true, messages with role === 'system' are always kept
     * at position 0 regardless of window constraints.
     * Default: true
     */
    preserveSystem?: boolean;

    /**
     * If > 0, always keep this many messages from the beginning
     * (after the system message) regardless of budget.
     * Useful for keeping initial instructions visible.
     * Default: 0
     */
    anchorFirst?: number;

    debug?: boolean;
}

export interface SlidingWindowResult {
    /** Trimmed message list */
    messages: SlidingWindowMessage[];
    /** How many messages were dropped */
    dropped: number;
    /** Estimated tokens in the result */
    tokens: number;
}

// ── Core ──────────────────────────────────────────────────────────────────────

export interface SlidingWindow {
    /** Apply the window to a message list. Returns a new array (does not mutate). */
    apply(messages: SlidingWindowMessage[]): SlidingWindowResult;
    readonly config: Required<SlidingWindowConfig>;
}

export function createSlidingWindow(config: SlidingWindowConfig = {}): SlidingWindow {
    const cfg: Required<SlidingWindowConfig> = {
        strategy:       config.strategy       ?? 'tokenBudget',
        maxMessages:    config.maxMessages     ?? 20,
        maxTokens:      config.maxTokens       ?? 4000,
        preserveSystem: config.preserveSystem  ?? true,
        anchorFirst:    config.anchorFirst     ?? 0,
        debug:          config.debug           ?? false,
    };

    function apply(messages: SlidingWindowMessage[]): SlidingWindowResult {
        if (messages.length === 0) return { messages: [], dropped: 0, tokens: 0 };

        // Separate system messages from the rest
        const systemMessages: SlidingWindowMessage[] = [];
        const rest: SlidingWindowMessage[] = [];

        for (const m of messages) {
            if (cfg.preserveSystem && m.role === 'system') {
                systemMessages.push(m);
            } else {
                rest.push(m);
            }
        }

        // Anchor messages (always kept at the start of non-system messages)
        const anchored = rest.slice(0, cfg.anchorFirst);
        const sliding  = rest.slice(cfg.anchorFirst);

        let kept: SlidingWindowMessage[];

        switch (cfg.strategy) {
            case 'lastN':
                kept = applyLastN(sliding, cfg.maxMessages);
                break;
            case 'tokenBudget':
                kept = applyTokenBudget(sliding, anchored, systemMessages, cfg.maxTokens);
                break;
            case 'hybrid':
                kept = applyHybrid(sliding, anchored, systemMessages, cfg.maxMessages, cfg.maxTokens);
                break;
        }

        const result = [...systemMessages, ...anchored, ...kept];
        const tokens = result.reduce((s, m) => s + countTokens(m.content ?? ''), 0);
        const dropped = messages.length - result.length;

        if (cfg.debug) {
            console.warn('[SlidingWindow] applied', {
                strategy: cfg.strategy,
                original: messages.length,
                result: result.length,
                dropped,
                tokens,
            });
        }

        return { messages: result, dropped, tokens };
    }

    return { apply, config: cfg };
}

// ── Strategy implementations ──────────────────────────────────────────────────

function applyLastN(messages: SlidingWindowMessage[], n: number): SlidingWindowMessage[] {
    return messages.slice(-n);
}

function applyTokenBudget(
    sliding: SlidingWindowMessage[],
    anchored: SlidingWindowMessage[],
    system: SlidingWindowMessage[],
    maxTokens: number,
): SlidingWindowMessage[] {
    if (maxTokens <= 0) return [];

    const fixedTokens =
        system.reduce((s, m) => s + countTokens(m.content ?? ''), 0) +
        anchored.reduce((s, m) => s + countTokens(m.content ?? ''), 0);

    // If fixed content alone already exceeds budget, keep nothing from the window.
    let budget = maxTokens - fixedTokens;
    if (budget <= 0) return [];

    const kept: SlidingWindowMessage[] = [];

    // Walk from newest → oldest, accumulate until over budget
    for (let i = sliding.length - 1; i >= 0; i--) {
        const msg = sliding[i] as SlidingWindowMessage;
        const t = countTokens(msg.content ?? '');
        if (budget - t < 0) break;
        budget -= t;
        kept.unshift(msg);
    }

    return kept;
}

function applyHybrid(
    sliding: SlidingWindowMessage[],
    anchored: SlidingWindowMessage[],
    system: SlidingWindowMessage[],
    maxMessages: number,
    maxTokens: number,
): SlidingWindowMessage[] {
    const byN      = applyLastN(sliding, maxMessages);
    const byTokens = applyTokenBudget(sliding, anchored, system, maxTokens);

    // Take whichever is more restrictive (fewer messages)
    return byN.length <= byTokens.length ? byN : byTokens;
}

// ── Convenience: one-shot sliding window ──────────────────────────────────────

/**
 * Apply a token-budget sliding window in a single call.
 * The most common use case: trim messages to fit a context budget.
 *
 * @example
 * const trimmed = applyWindow(messages, 4000);
 */
export function applyWindow(
    messages: SlidingWindowMessage[],
    maxTokens: number,
    options: Omit<SlidingWindowConfig, 'strategy' | 'maxTokens'> = {},
): SlidingWindowResult {
    return createSlidingWindow({ ...options, strategy: 'tokenBudget', maxTokens }).apply(messages);
}
