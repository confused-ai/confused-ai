/**
 * Compression module: LLM-powered and Huffman-based compression.
 */

export {
    CompressionManager,
    DEFAULT_COMPRESSION_PROMPT,
} from './manager.js';
export type {
    CompressionManagerConfig,
    CompressibleMessage,
} from './manager.js';

// Huffman codec for deterministic, zero-LLM-call compression
export {
    HuffmanCodec,
    compressContext,
    decompressContext,
    serializeTable,
    deserializeTable,
    estimateCompressionRatio,
} from './huffman.js';
export type { HuffmanTable, HuffmanEncodeResult } from './huffman.js';

