/**
 * ToolCompressor
 * ==============
 * Compresses large tool results before they are returned to the agent/LLM.
 *
 * Two strategies:
 *   truncate  — fast, no LLM needed; slices the serialised output at `maxBytes`
 *   summarize — calls a provided LLM function to produce a fact-dense summary
 *
 * Usage:
 *   const compressor = new ToolCompressor({ maxBytes: 4000, strategy: 'truncate' });
 *   const wrapped = withCompression(myTool, compressor);
 *
 *   // Or use directly:
 *   if (compressor.shouldCompress(result)) {
 *     const small = await compressor.compress(result);
 *   }
 */

// ── Config ────────────────────────────────────────────────────────────────────

export type CompressionStrategy = 'truncate' | 'summarize';

export interface ToolCompressorConfig {
    /**
     * Serialised byte length above which compression is triggered.
     * Measured as `JSON.stringify(result).length` (UTF-16 code units).
     * Default: 8000
     */
    maxBytes?: number;
    /**
     * Compression strategy.
     * - `truncate`  (default): slice at `maxBytes`, append suffix
     * - `summarize`: call `summarize()` to produce an LLM-generated summary
     */
    strategy?: CompressionStrategy;
    /**
     * Required when `strategy === 'summarize'`.
     * Receives the serialised string and returns a compact summary.
     */
    summarize?: (content: string) => Promise<string>;
    /**
     * Suffix appended when `strategy === 'truncate'`.
     * Default: ' … [truncated]'
     */
    truncateSuffix?: string;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface ToolCompressorStats {
    compressions: number;
    /** Cumulative bytes saved */
    bytesSaved: number;
}

// ── ToolCompressor ────────────────────────────────────────────────────────────

export class ToolCompressor {
    private readonly _maxBytes: number;
    private readonly _strategy: CompressionStrategy;
    private readonly _summarizeFn?: (content: string) => Promise<string>;
    private readonly _suffix: string;
    private _compressions = 0;
    private _bytesSaved = 0;

    constructor(config: ToolCompressorConfig = {}) {
        this._maxBytes = config.maxBytes ?? 8000;
        this._strategy = config.strategy ?? 'truncate';
        this._summarizeFn = config.summarize;
        this._suffix = config.truncateSuffix ?? ' … [truncated]';

        if (this._strategy === 'summarize' && !this._summarizeFn) {
            throw new Error('ToolCompressor: strategy "summarize" requires a summarize() function');
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Returns true if the result needs compression.
     * Accepts any value; non-strings are serialised for measurement.
     */
    shouldCompress(result: unknown): boolean {
        return this._serialise(result).length > this._maxBytes;
    }

    /**
     * Compress a tool result.
     * - `truncate`:  synchronous path, returns immediately
     * - `summarize`: awaits the provided LLM function
     * Returns the original value unchanged if below threshold.
     */
    async compress(result: unknown): Promise<unknown> {
        const serialised = this._serialise(result);
        if (serialised.length <= this._maxBytes) return result;

        const original = serialised.length;

        if (this._strategy === 'truncate') {
            return this._truncate(result, serialised, original);
        }

        // summarize
        const summary = await this._summarizeFn!(serialised);
        this._compressions++;
        this._bytesSaved += original - summary.length;
        return summary;
    }

    /**
     * Synchronous truncation-only compression.
     * Throws if the strategy is 'summarize' (which requires async).
     */
    compressSync(result: unknown): unknown {
        if (this._strategy === 'summarize') {
            throw new Error('ToolCompressor: compressSync() cannot be used with strategy "summarize"');
        }
        const serialised = this._serialise(result);
        if (serialised.length <= this._maxBytes) return result;
        return this._truncate(result, serialised, serialised.length);
    }

    getStats(): ToolCompressorStats {
        return { compressions: this._compressions, bytesSaved: this._bytesSaved };
    }

    // ── Private ────────────────────────────────────────────────────────────

    private _serialise(value: unknown): string {
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value) ?? '';
        } catch {
            return String(value);
        }
    }

    private _truncate(_result: unknown, serialised: string, original: number): string {
        const cutAt = this._maxBytes - this._suffix.length;
        const compressed = serialised.slice(0, cutAt) + this._suffix;
        this._compressions++;
        this._bytesSaved += original - compressed.length;
        return compressed;
    }
}
