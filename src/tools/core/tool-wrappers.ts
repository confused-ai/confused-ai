/**
 * Tool wrappers — withCache and withCompression
 * ==============================================
 * Composable wrappers that add caching and/or compression to any LightweightTool
 * without modifying the original tool implementation.
 *
 * @example
 * ```ts
 * import { tool, withCache, withCompression, ToolCache, ToolCompressor } from 'agno';
 *
 * const cache = new ToolCache({ maxEntries: 200, ttlMs: 60_000 });
 * const compressor = new ToolCompressor({ maxBytes: 4000 });
 *
 * const searchTool = tool({ name: 'search', ... });
 *
 * // Cache + compress (compose left-to-right: cache checks first, then compress on miss)
 * const optimised = withCache(withCompression(searchTool, compressor), cache);
 * ```
 */

import type { LightweightTool } from './tool-helper.js';
import type { ToolResult } from './types.js';
import { ToolCache } from './tool-cache.js';
import { ToolCompressor } from './tool-compressor.js';
import type { ZodObject, ZodRawShape } from 'zod';

// ── withCache ─────────────────────────────────────────────────────────────────

/**
 * Wrap a LightweightTool with transparent result caching.
 *
 * On every `execute()` call:
 *  1. A cache key is derived from the tool name + serialised params.
 *  2. On hit  → return the cached result immediately (no tool invocation).
 *  3. On miss → invoke the original tool, store the result, then return it.
 *
 * Failed results (`success: false`) are never cached.
 */
export function withCache<TSchema extends ZodObject<ZodRawShape>, TOutput>(
    baseTool: LightweightTool<TSchema, TOutput>,
    cache: ToolCache,
): LightweightTool<TSchema, TOutput> {
    return {
        ...baseTool,

        async execute(params, context) {
            // Check cache
            const hit = cache.get<TOutput>(baseTool.name, params);
            if (hit) {
                return {
                    ...hit,
                    metadata: {
                        ...hit.metadata,
                        // Mark that this result came from cache
                        cached: true,
                    } as ToolResult<TOutput>['metadata'] & { cached: boolean },
                } as ToolResult<TOutput>;
            }

            // Execute and cache on success
            const result = await baseTool.execute(params, context);
            if (result.success) {
                cache.set(baseTool.name, params, result);
            }
            return result;
        },
    };
}

// ── withCompression ───────────────────────────────────────────────────────────

/**
 * Wrap a LightweightTool so that large results are automatically compressed
 * before being returned.
 *
 * On every `execute()` call:
 *  1. Original tool runs normally.
 *  2. If the result data exceeds `compressor.maxBytes`, it is compressed.
 *  3. Compressed data replaces `result.data`; `result.success` is unchanged.
 *
 * Errors are passed through unmodified.
 */
export function withCompression<TSchema extends ZodObject<ZodRawShape>, TOutput>(
    baseTool: LightweightTool<TSchema, TOutput>,
    compressor: ToolCompressor,
): LightweightTool<TSchema, TOutput> {
    return {
        ...baseTool,

        async execute(params, context) {
            const result = await baseTool.execute(params, context);

            if (!result.success || result.data === undefined) {
                return result;
            }

            if (!compressor.shouldCompress(result.data)) {
                return result;
            }

            const compressed = await compressor.compress(result.data);
            return {
                ...result,
                data: compressed as TOutput,
            };
        },
    };
}
