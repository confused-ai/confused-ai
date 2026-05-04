/**
 * CompressionManager
 * ==================
 * Detects when a message list is "too large" and uses an LLM to summarise
 * verbose tool results into compact, fact-preserving representations.
 * Works both synchronously (one-by-one) and in parallel (acompress).
 *
 * Usage:
 *   const cm = new CompressionManager({
 *     generate: async (msgs) => llm.chat(msgs),
 *     compressToolResults: true,
 *     compressToolResultsLimit: 3,
 *   });
 *
 *   if (cm.shouldCompress(messages)) {
 *     await cm.acompress(messages);  // mutates messages in-place
 *   }
 */

export const DEFAULT_COMPRESSION_PROMPT = `You are a professional summarizer.
Your task is to compress tool results or long text into a concise, fact-dense summary.

CRITICAL RULES:
1. Preserve ALL key facts, entities, IDs, numbers, names, dates.
2. Remove all filler, pleasantries, repeated boilerplate, and excessive whitespace.
3. Use clear, direct language (no passive voice, no introductory phrases).
4. If the result contains structured data, keep the structure but remove empty/null fields.
5. Never invent or infer information not present in the original.
6. Keep the result in the same language as the input.
7. Output ONLY the compressed content — no preamble, no explanations.`;

// ── Message shape (minimal, provider-agnostic) ────────────────────────────────

export interface CompressibleMessage {
    role: string;
    content?: string | null;
    /** If set, this message was produced by compressing the original `content` */
    compressedContent?: string;
    /** tool-use specific fields (pass-through) */
    [key: string]: unknown;
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface CompressionManagerConfig {
    /**
     * LLM callable — same signature as ReasoningManager.generate.
     * (messages: Array<{role, content}>) => Promise<string>
     */
    generate: (messages: Array<{ role: string; content: string }>) => Promise<string>;
    /** Whether to compress tool / function call results */
    compressToolResults?: boolean;
    /**
     * Minimum number of tool messages before triggering compression.
     * Default: 3
     */
    compressToolResultsLimit?: number;
    /**
     * Approximate token limit for a single message content above which
     * compression is triggered regardless of message count.
     * Token count is estimated as `content.length / 4`.
     * Set to 0 to disable token-based compression.
     */
    compressTokenLimit?: number;
    /** Custom compression prompt override */
    prompt?: string;
    debug?: boolean;
}

// ── CompressionManager ────────────────────────────────────────────────────────

export class CompressionManager {
    private readonly config: Required<CompressionManagerConfig>;
    private _compressionCount = 0;

    constructor(config: CompressionManagerConfig) {
        this.config = {
            generate:                  config.generate,
            compressToolResults:       config.compressToolResults        ?? true,
            compressToolResultsLimit:  config.compressToolResultsLimit   ?? 3,
            compressTokenLimit:        config.compressTokenLimit         ?? 4096,
            prompt:                    config.prompt                     ?? DEFAULT_COMPRESSION_PROMPT,
            debug:                     config.debug                      ?? false,
        };
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Returns true if the message list warrants compression.
     * Two triggers:
     *  1. Count of tool-result messages ≥ compressToolResultsLimit
     *  2. Any single message content exceeds compressTokenLimit (estimated tokens)
     */
    shouldCompress(messages: CompressibleMessage[]): boolean {
        if (this.config.compressToolResults) {
            const toolMessages = messages.filter(m => this._isToolResult(m));
            if (toolMessages.length >= this.config.compressToolResultsLimit) return true;
        }
        if (this.config.compressTokenLimit > 0) {
            for (const msg of messages) {
                const content = msg.compressedContent ?? (typeof msg.content === 'string' ? msg.content : '');
                if (this._estimateTokens(content) > this.config.compressTokenLimit) return true;
            }
        }
        return false;
    }

    /**
     * Compress messages sequentially (one await after another).
     * Mutates `messages` in-place, setting `compressedContent` on affected messages.
     */
    async compress(messages: CompressibleMessage[]): Promise<void> {
        for (const msg of messages) {
            if (this._shouldCompressMessage(msg)) {
                await this._compressMessage(msg);
            }
        }
    }

    /**
     * Compress all qualifying messages in parallel.
     * Faster than `compress()` for large batches but uses more concurrency.
     */
    async acompress(messages: CompressibleMessage[]): Promise<void> {
        const targets = messages.filter(msg => this._shouldCompressMessage(msg));
        await Promise.all(targets.map(msg => this._compressMessage(msg)));
    }

    /** Number of messages compressed since instantiation */
    get compressionCount(): number {
        return this._compressionCount;
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    private _isToolResult(msg: CompressibleMessage): boolean {
        return (
            msg.role === 'tool' ||
            (msg.role === 'assistant' && !!msg.tool_calls) ||
            (msg.role === 'user' && !!msg.tool_call_id)
        );
    }

    private _shouldCompressMessage(msg: CompressibleMessage): boolean {
        if (msg.compressedContent) return false; // already compressed
        const content = typeof msg.content === 'string' ? msg.content : '';
        if (!content) return false;

        if (this.config.compressToolResults && this._isToolResult(msg)) return true;
        if (
            this.config.compressTokenLimit > 0 &&
            this._estimateTokens(content) > this.config.compressTokenLimit
        ) return true;

        return false;
    }

    private async _compressMessage(msg: CompressibleMessage): Promise<void> {
        const content = typeof msg.content === 'string' ? msg.content : '';
        if (!content) return;

        this._debug('Compressing message', { role: msg.role, length: content.length });

        try {
            const compressed = await this.config.generate([
                { role: 'system', content: this.config.prompt },
                { role: 'user',   content: content },
            ]);
            msg.compressedContent = compressed.trim();
            this._compressionCount++;
            this._debug('Compressed', { before: content.length, after: msg.compressedContent.length });
        } catch (err) {
            // Non-fatal: leave original content untouched
            this._debug('Compression failed', err);
        }
    }

    /** Rough token estimate: 4 characters ≈ 1 token (GPT-style) */
    private _estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }

    private _debug(label: string, data?: unknown): void {
        if (this.config.debug) {
            console.debug(`[CompressionManager] ${label}`, data ?? '');
        }
    }
}
