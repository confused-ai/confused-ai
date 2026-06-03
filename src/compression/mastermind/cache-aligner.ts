/**
 * CacheAligner
 * ============
 * Stabilises the leading portion of the message list so that
 * provider-side KV caches (Anthropic prompt-caching, OpenAI prefix caching)
 * get a higher hit rate across consecutive agent runs.
 *
 * Technique:
 *   1. System message is always position 0 and never mutated.
 *   2. Static context injected at agent creation time (knowledge, memory preamble)
 *      is moved to a stable prefix block at positions 1-N.
 *   3. Dynamic trailing messages are left untouched.
 *   4. Trailing whitespace / newline normalisation on the system message prevents
 *      trivial cache misses from editor formatting.
 *
 * No LLM calls required. All operations are O(n) on message count.
 */

export interface CacheAlignerMessage {
    role: string;
    content?: string | null;
    /** Internal marker: message belongs to the stable prefix */
    _cachePrefix?: boolean;
    [key: string]: unknown;
}

export interface CacheAlignerOptions {
    /**
     * Normalise trailing whitespace on every message content.
     * Default: true
     */
    normaliseWhitespace?: boolean;
}

export class CacheAligner {
    private readonly normalise: boolean;

    constructor(opts: CacheAlignerOptions = {}) {
        this.normalise = opts.normaliseWhitespace ?? true;
    }

    /**
     * Returns a new message array with a stabilised prefix.
     * Does NOT mutate the input array or individual message objects.
     *
     * Safety: conversation history order is ALWAYS preserved. Only messages
     * explicitly tagged via {@link CacheAligner.markPrefix} are hoisted to the
     * stable prefix block — live history is never reordered, so tool_call /
     * tool_result pairing and chronological order remain intact.
     */
    align(messages: CacheAlignerMessage[]): CacheAlignerMessage[] {
        if (messages.length === 0) return [];

        const [systemMsg, ...rest] = messages as [CacheAlignerMessage, ...CacheAlignerMessage[]];

        // Normalise system message content (stable trailing newline → cache-friendly)
        const sys: CacheAlignerMessage = {
            ...systemMsg,
            ...(this.normalise && typeof systemMsg.content === 'string'
                ? { content: systemMsg.content.trimEnd() + '\n' }
                : {}),
        };

        // Only explicitly-marked messages are hoisted. Everything else keeps order.
        const hasMarkers = rest.some(m => m._cachePrefix);
        if (!hasMarkers) {
            return [sys, ...rest.map(m => this._normalise(m))];
        }

        const prefixMessages: CacheAlignerMessage[] = [];
        const dynamicMessages: CacheAlignerMessage[] = [];
        for (const msg of rest) {
            if (msg._cachePrefix) prefixMessages.push(this._normalise(msg));
            else dynamicMessages.push(this._normalise(msg));
        }

        return [sys, ...prefixMessages, ...dynamicMessages];
    }

    /**
     * Mark a message as belonging to the stable prefix.
     * Call this on messages injected as static context (knowledge, tools description).
     */
    static markPrefix<T extends CacheAlignerMessage>(msg: T): T {
        return { ...msg, _cachePrefix: true };
    }

    private _normalise(msg: CacheAlignerMessage): CacheAlignerMessage {
        if (!this.normalise || typeof msg.content !== 'string') return msg;
        return { ...msg, content: msg.content.trimEnd() };
    }
}
