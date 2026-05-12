/**
 * SummaryBufferMemory
 * ===================
 * Maintains a rolling LLM summary of the "old" part of a conversation
 * combined with an exact verbatim window of the most recent K messages.
 *
 * This is the primary technique used by LangChain's SummaryBufferMemory
 * and beats simple compression because:
 *   - Recent messages are always exact (no hallucination risk)
 *   - Older content is factually summarised, not just truncated
 *   - The summary is updated incrementally, not rebuilt from scratch
 *
 * Architecture:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  [system]  original system prompt (always kept)              │
 *   │  [user]    "Previous context: {summary}"  ← injected         │
 *   │  [user]    ...                                               │  verbatim
 *   │  [asst]    ...  ← verbatim window (last maxWindowTokens)     │  window
 *   │  [user]    ...                                               │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   const sbm = new SummaryBufferMemory({
 *     generate: (msgs) => llm.chat(msgs),
 *     maxWindowTokens: 2000,
 *     model: 'gpt-4o',
 *   });
 *
 *   // After each turn:
 *   sbm.addMessages([userMsg, assistantMsg]);
 *
 *   // Before next LLM call:
 *   const context = await sbm.getContext();
 *   // → [{ role:'user', content:'Previous context: ...' }, ...recent msgs]
 */

import { countTokens } from './token-counter.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SBMMessage {
    role: string;
    content?: string | null;
    [key: string]: unknown;
}

export interface SummaryBufferConfig {
    /**
     * LLM callable for producing summaries.
     * (messages: {role, content}[]) => Promise<string>
     */
    generate: (messages: Array<{ role: string; content: string }>) => Promise<string>;

    /**
     * Maximum tokens to keep in the verbatim window.
     * When exceeded, oldest messages are folded into the summary.
     * Default: 2000
     */
    maxWindowTokens?: number;

    /**
     * Model name for token counting.
     * Default: 'gpt-4o'
     */
    model?: string;

    /**
     * System prompt kept verbatim at position 0 of the context.
     * If provided it is never summarised.
     */
    systemPrompt?: string;

    /** Custom prompt used to generate the rolling summary. */
    summaryPrompt?: string;

    /**
     * Role to use for the injected summary message.
     * Use 'system' for models that handle it cleanly (OpenAI),
     * or 'user' if the provider rejects system messages mid-conversation.
     * Default: 'system'
     */
    summaryRole?: 'system' | 'user' | 'assistant';

    /**
     * Maximum characters of raw conversation to pass to the summarizer LLM.
     * Prevents the summarizer itself from exceeding its own context limit.
     * Default: 24000  (~6k tokens)
     */
    summarizeCharLimit?: number;

    debug?: boolean;
}

const DEFAULT_SUMMARY_PROMPT = `You are a precise conversation summarizer.
Given an existing summary and new conversation messages, produce an updated summary.

Rules:
1. Keep ALL factual information: names, IDs, numbers, decisions, errors, file paths, code snippets.
2. Remove pleasantries, filler, and repeated information already in the summary.
3. Write in third-person past tense ("The user asked...", "The assistant returned...").
4. Preserve the chronological order of important events.
5. Output ONLY the updated summary — no preamble, no labels.`;

// ── SummaryBufferMemory ───────────────────────────────────────────────────────

export class SummaryBufferMemory {
    private _buffer: SBMMessage[] = [];
    private _summary = '';
    private _summaryTokens = 0;
    private _summarizationCount = 0;
    /** Prevents concurrent flush calls from racing each other. */
    private _flushPromise: Promise<void> | null = null;

    private readonly cfg: Required<SummaryBufferConfig>;

    constructor(config: SummaryBufferConfig) {
        this.cfg = {
            generate:           config.generate,
            maxWindowTokens:    config.maxWindowTokens    ?? 2000,
            model:              config.model              ?? 'gpt-4o',
            systemPrompt:       config.systemPrompt       ?? '',
            summaryPrompt:      config.summaryPrompt      ?? DEFAULT_SUMMARY_PROMPT,
            summaryRole:        config.summaryRole        ?? 'system',
            summarizeCharLimit: config.summarizeCharLimit ?? 24000,
            debug:              config.debug              ?? false,
        };
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /** Append one or more messages to the buffer. Does NOT trigger summarisation. */
    addMessages(messages: SBMMessage[]): void {
        this._buffer.push(...messages);
    }

    /**
     * Append messages and immediately flush the buffer if the verbatim window
     * exceeds `maxWindowTokens`. Concurrent calls are serialised — the second
     * caller waits for the in-flight flush to complete before checking again.
     */
    async addAndFlush(messages: SBMMessage[]): Promise<void> {
        this.addMessages(messages);
        await this._safeFlush();
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Get the context to inject before the next LLM call.
     *
     * Returns:
     *   - Optional system message (if systemPrompt was set)
     *   - Summary injection message (if a summary exists)
     *   - Verbatim recent messages
     *
     * If the window is over budget, flushes first.
     */
    async getContext(): Promise<SBMMessage[]> {
        await this._safeFlush();
        return this._buildContext();
    }

    /**
     * Synchronous version — returns context without triggering summarisation.
     * Use when you need to avoid async but the window may be over budget.
     */
    getContextSync(): SBMMessage[] {
        return this._buildContext();
    }

    /** Current rolling summary text. Empty string if no summarisation has run. */
    get summary(): string {
        return this._summary;
    }

    /** Number of times summarisation has been triggered. */
    get summarizationCount(): number {
        return this._summarizationCount;
    }

    /** Estimated tokens currently held in the verbatim buffer. */
    get windowTokens(): number {
        return this._windowTokens();
    }

    /** Estimated tokens in the rolling summary. */
    get summaryTokens(): number {
        return this._summaryTokens;
    }

    /** Total estimated tokens (summary + window). */
    get totalTokens(): number {
        return this._summaryTokens + this._windowTokens();
    }

    // ── Mutation ──────────────────────────────────────────────────────────────

    /** Clear all buffered messages and the summary. */
    clear(): void {
        this._buffer = [];
        this._summary = '';
        this._summaryTokens = 0;
    }

    /** Override the rolling summary (e.g., to inject a pre-existing summary). */
    setSummary(text: string): void {
        this._summary = text;
        this._summaryTokens = countTokens(text);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private _windowTokens(): number {
        return this._buffer.reduce((sum, m) => sum + countTokens(m.content ?? ''), 0);
    }

    private _buildContext(): SBMMessage[] {
        const result: SBMMessage[] = [];

        if (this.cfg.systemPrompt) {
            result.push({ role: 'system', content: this.cfg.systemPrompt });
        }

        if (this._summary) {
            result.push({
                role: this.cfg.summaryRole,
                content: `[Previous context summary]\n${this._summary}`,
            });
        }

        result.push(...this._buffer);
        return result;
    }

    /**
     * Ensures at most one flush runs at a time.
     * If a flush is already in-flight, waits for it, then checks budget again.
     */
    private async _safeFlush(): Promise<void> {
        if (this._flushPromise) {
            await this._flushPromise;
        }
        if (this._windowTokens() > this.cfg.maxWindowTokens) {
            this._flushPromise = this._flush().finally(() => {
                this._flushPromise = null;
            });
            await this._flushPromise;
        }
    }

    /**
     * Move oldest messages out of the buffer into the rolling summary.
     * Keeps the newest messages that fit within maxWindowTokens.
     */
    private async _flush(): Promise<void> {
        const half = Math.floor(this.cfg.maxWindowTokens / 2);

        // Find split point: keep newest messages that fit in half the budget
        let keepFrom = this._buffer.length;
        let acc = 0;
        for (let i = this._buffer.length - 1; i >= 0; i--) {
            const msg = this._buffer[i] as SBMMessage;
            const t = countTokens(msg.content ?? '');
            if (acc + t > half) break;
            acc += t;
            keepFrom = i;
        }

        const toSummarize = this._buffer.slice(0, keepFrom);
        this._buffer = this._buffer.slice(keepFrom);

        if (toSummarize.length === 0) return;

        this._debug('Flushing', { messages: toSummarize.length, keepFrom });

        const newSummary = await this._summarize(toSummarize);
        this._summary = newSummary;
        this._summaryTokens = countTokens(newSummary);
        this._summarizationCount++;
    }

    private async _summarize(messages: SBMMessage[]): Promise<string> {
        // Cap raw conversation to avoid hitting the summarizer's own context limit
        const rawConversation = messages
            .map(m => `${m.role.toUpperCase()}: ${m.content ?? ''}`)
            .join('\n');
        const conversation = rawConversation.slice(0, this.cfg.summarizeCharLimit);

        const promptMessages: Array<{ role: string; content: string }> = [
            { role: 'system', content: this.cfg.summaryPrompt },
        ];

        if (this._summary) {
            promptMessages.push({
                role: 'user',
                content: `Existing summary:\n${this._summary}\n\nNew messages to incorporate:\n${conversation}`,
            });
        } else {
            promptMessages.push({
                role: 'user',
                content: `Summarize the following conversation:\n${conversation}`,
            });
        }

        return (await this.cfg.generate(promptMessages)).trim();
    }

    private _debug(label: string, data?: unknown): void {
        if (this.cfg.debug) {
            console.warn(`[SummaryBufferMemory] ${label}`, data ?? '');
        }
    }
}
