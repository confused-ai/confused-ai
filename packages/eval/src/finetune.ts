/**
 * Fine-Tune Dataset Generator
 * ============================
 * Converts agent run history (EvalResults, raw Q→A pairs, or conversation logs)
 * into fine-tuning datasets in industry-standard formats:
 *
 *   - OpenAI JSONL  (`{"messages": [{role, content}, ...]}`)
 *   - Alpaca JSON   (`[{instruction, input, output}]`)
 *   - ShareGPT JSON (`[{conversations: [{from, value}, ...]}]`)
 *
 * Workflow:
 *   1. Collect `TrainingExample[]` from your eval store / logs
 *   2. Call `generateDataset(examples, options)`
 *   3. Write the returned string to a `.jsonl` or `.json` file
 *   4. Upload to your fine-tuning provider
 *
 * Optionally use `filterByScore()` to keep only high-quality examples before
 * passing them to the generator.
 *
 * Usage:
 *   import { generateDataset, filterByScore } from '@confused-ai/eval/finetune';
 *
 *   const good = filterByScore(examples, { minScore: 7, maxScore: 10 });
 *   const jsonl = generateDataset(good, { format: 'openai', systemPrompt: 'You are…' });
 *   await writeFile('train.jsonl', jsonl, 'utf-8');
 */

import { writeFile } from 'node:fs/promises';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrainingExample {
    /** Free-form identifier */
    id?: string;
    /** User-facing question / instruction */
    input: string;
    /** Ideal model response */
    output: string;
    /** Optional multi-turn conversation history (excludes the final user+assistant turn) */
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    /** Quality score 0–10 (used by filterByScore) */
    score?: number;
    /** Arbitrary metadata (preserved in the JSONL object as `metadata` field if keepMetadata=true) */
    metadata?: Record<string, unknown>;
}

export type DatasetFormat = 'openai' | 'alpaca' | 'sharegpt';

export interface DatasetGeneratorOptions {
    /** Output format. Default: 'openai' */
    format?: DatasetFormat;
    /** System prompt injected into every example (openai + sharegpt only) */
    systemPrompt?: string;
    /** Whether to include the `metadata` field in each output record. Default: false */
    keepMetadata?: boolean;
    /**
     * Shuffle examples with a deterministic seed before writing.
     * Useful for train/val split reproducibility. Default: false.
     */
    shuffle?: boolean;
    /** Seed for shuffle (ignored unless shuffle=true). Default: 42 */
    shuffleSeed?: number;
}

export interface DatasetSplitOptions extends DatasetGeneratorOptions {
    /** Fraction of examples for validation set (0–1). Default: 0.1 */
    valFraction?: number;
    /** Output path prefix. E.g. 'data/train' → 'data/train.jsonl' + 'data/val.jsonl' */
    outputPrefix: string;
}

// ── Core generator ────────────────────────────────────────────────────────────

/**
 * Generate a fine-tuning dataset string from `examples`.
 *
 * - `'openai'` → JSONL, one JSON object per line
 * - `'alpaca'` → JSON array
 * - `'sharegpt'` → JSON array
 */
export function generateDataset(
    examples: TrainingExample[],
    options: DatasetGeneratorOptions = {},
): string {
    const format       = options.format       ?? 'openai';
    const systemPrompt = options.systemPrompt;
    const keepMeta     = options.keepMetadata ?? false;
    const ordered      = options.shuffle
        ? shuffleWithSeed([...examples], options.shuffleSeed ?? 42)
        : examples;

    switch (format) {
        case 'openai':   return _toOpenAI(ordered, systemPrompt, keepMeta);
        case 'alpaca':   return _toAlpaca(ordered, keepMeta);
        case 'sharegpt': return _toShareGPT(ordered, systemPrompt, keepMeta);
    }
}

/**
 * Write train + val splits to disk.
 * Files are written to `{outputPrefix}.jsonl` and `{outputPrefix}_val.jsonl`.
 */
export async function writeSplitDataset(
    examples: TrainingExample[],
    options: DatasetSplitOptions,
): Promise<{ trainPath: string; valPath: string; trainCount: number; valCount: number }> {
    const valFrac   = Math.max(0, Math.min(1, options.valFraction ?? 0.1));
    const shuffled  = shuffleWithSeed([...examples], options.shuffleSeed ?? 42);
    const splitAt   = Math.max(1, Math.floor(shuffled.length * (1 - valFrac)));
    const train     = shuffled.slice(0, splitAt);
    const val       = shuffled.slice(splitAt);

    const trainPath = `${options.outputPrefix}.jsonl`;
    const valPath   = `${options.outputPrefix}_val.jsonl`;

    await Promise.all([
        writeFile(trainPath, generateDataset(train, { ...options, shuffle: false }), 'utf-8'),
        writeFile(valPath,   generateDataset(val,   { ...options, shuffle: false }), 'utf-8'),
    ]);

    return { trainPath, valPath, trainCount: train.length, valCount: val.length };
}

// ── Filter helpers ────────────────────────────────────────────────────────────

export interface FilterOptions {
    /** Minimum score (inclusive). Default: 0 */
    minScore?: number;
    /** Maximum score (inclusive). Default: Infinity */
    maxScore?: number;
    /** Minimum input length (chars). Default: 1 */
    minInputLength?: number;
    /** Minimum output length (chars). Default: 1 */
    minOutputLength?: number;
}

/**
 * Keep only examples that pass the quality filters.
 * Examples with `score === undefined` pass the score filter by default.
 */
export function filterByScore(
    examples: TrainingExample[],
    options: FilterOptions = {},
): TrainingExample[] {
    const minScore  = options.minScore         ?? 0;
    const maxScore  = options.maxScore         ?? Infinity;
    const minInput  = options.minInputLength   ?? 1;
    const minOutput = options.minOutputLength  ?? 1;

    return examples.filter((ex) => {
        if (ex.score !== undefined && (ex.score < minScore || ex.score > maxScore)) return false;
        if (ex.input.length  < minInput)  return false;
        if (ex.output.length < minOutput) return false;
        return true;
    });
}

/**
 * Deduplicate examples by exact `input` string.
 * Keeps the first occurrence (or the one with the highest score if scored).
 */
export function deduplicateByInput(examples: TrainingExample[]): TrainingExample[] {
    const seen = new Map<string, TrainingExample>();
    for (const ex of examples) {
        const existing = seen.get(ex.input);
        if (!existing) {
            seen.set(ex.input, ex);
        } else if (ex.score !== undefined && (existing.score ?? 0) < ex.score) {
            seen.set(ex.input, ex);
        }
    }
    return Array.from(seen.values());
}

// ── Format serialisers ────────────────────────────────────────────────────────

function _toOpenAI(
    examples: TrainingExample[],
    systemPrompt: string | undefined,
    keepMeta: boolean,
): string {
    return examples.map((ex) => {
        const messages: Array<{ role: string; content: string }> = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        if (ex.history?.length) messages.push(...ex.history);
        messages.push({ role: 'user',      content: ex.input });
        messages.push({ role: 'assistant', content: ex.output });
        const record: Record<string, unknown> = { messages };
        if (keepMeta && ex.metadata) record['metadata'] = ex.metadata;
        return JSON.stringify(record);
    }).join('\n');
}

function _toAlpaca(
    examples: TrainingExample[],
    keepMeta: boolean,
): string {
    const records = examples.map((ex) => {
        const record: Record<string, unknown> = {
            instruction: ex.input,
            input:       '',
            output:      ex.output,
        };
        if (keepMeta && ex.metadata) record['metadata'] = ex.metadata;
        return record;
    });
    return JSON.stringify(records, null, 2);
}

function _toShareGPT(
    examples: TrainingExample[],
    systemPrompt: string | undefined,
    keepMeta: boolean,
): string {
    const records = examples.map((ex) => {
        const conversations: Array<{ from: string; value: string }> = [];
        if (systemPrompt) conversations.push({ from: 'system', value: systemPrompt });
        if (ex.history?.length) {
            for (const msg of ex.history) {
                conversations.push({ from: msg.role === 'user' ? 'human' : 'gpt', value: msg.content });
            }
        }
        conversations.push({ from: 'human', value: ex.input });
        conversations.push({ from: 'gpt',   value: ex.output });
        const record: Record<string, unknown> = { conversations };
        if (keepMeta && ex.metadata) record['metadata'] = ex.metadata;
        return record;
    });
    return JSON.stringify(records, null, 2);
}

// ── Shuffle ───────────────────────────────────────────────────────────────────

/** Deterministic Fisher-Yates shuffle using a LCG pseudo-random number generator. */
function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
    let s = seed >>> 0;
    const rand = (): number => {
        s = Math.imul(1664525, s) + 1013904223;
        return (s >>> 0) / 0x100000000;
    };
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
    }
    return arr;
}
