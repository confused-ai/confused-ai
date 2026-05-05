/**
 * Benchmark Pipeline Runner
 * ==========================
 * Run a benchmark dataset through an agent (or any async function), score each
 * output with configurable scorers, and produce a structured report.
 *
 * Scorers available out-of-the-box:
 *   - `exactMatchScorer`   — case-insensitive string equality
 *   - `containsScorer`     — output contains expected substring
 *   - `llmJudgeScorer`     — LLM-as-judge with rubric (wraps runLlmAsJudge)
 *   - `wordOverlapScorer`  — word-overlap F1 (wraps wordOverlapF1)
 *   - `rougeLScorer`       — ROUGE-L (wraps rougeLWords)
 *   - Custom: any `(output, expected?) => number | Promise<number>` function
 *
 * Usage:
 *   import { runBenchmark, exactMatchScorer, llmJudgeScorer } from '@confused-ai/eval';
 *
 *   const report = await runBenchmark({
 *     name:      'qa-v1',
 *     dataset:   [{ input: 'What is 2+2?', expected: '4' }],
 *     run:       async (input) => agent.run(input),
 *     scorers:   [exactMatchScorer(), llmJudgeScorer({ llm, rubric: 'Is answer correct?' })],
 *     concurrency: 4,
 *   });
 *   console.log(report.summary);
 */

import type { LLMProvider } from '@confused-ai/core';
import { runLlmAsJudge }  from './llm-judge.js';
import { wordOverlapF1 }  from './eval.js';
import { rougeLWords }    from './eval.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BenchmarkSample {
    /** Unique identifier for this sample */
    id?:      string;
    /** Input prompt fed to the agent */
    input:    string;
    /** Gold answer (optional — some scorers don't require it) */
    expected?: string;
    /** Arbitrary metadata forwarded into the result */
    metadata?: Record<string, unknown>;
}

export type ScorerFn = (
    output:   string,
    expected: string | undefined,
    sample:   BenchmarkSample,
) => number | Promise<number>;

export interface Scorer {
    name:  string;
    score: ScorerFn;
}

export interface BenchmarkSampleResult {
    id:          string;
    input:       string;
    expected?:   string;
    output:      string;
    scores:      Record<string, number>;
    /** Average of all scorer scores (0–1, normalised) */
    avgScore:    number;
    latencyMs:   number;
    error?:      string;
    metadata?:   Record<string, unknown>;
}

export interface BenchmarkReport {
    name:      string;
    timestamp: string;
    /** Total wall time in ms */
    durationMs: number;
    samples:   BenchmarkSampleResult[];
    summary:   BenchmarkSummary;
}

export interface BenchmarkSummary {
    total:       number;
    passed:      number;
    failed:      number;
    /** Fraction of samples with avgScore >= passThreshold */
    passRate:    number;
    /** Average score per scorer + overall */
    avgScores:   Record<string, number>;
    /** Median latency in ms */
    medianLatencyMs: number;
    /** p95 latency in ms */
    p95LatencyMs:    number;
}

export interface BenchmarkOptions {
    /** Human-readable name for this benchmark run */
    name: string;
    /** Dataset of input/expected pairs */
    dataset: BenchmarkSample[];
    /** The agent (or any async function) to evaluate */
    run: (input: string, sample: BenchmarkSample) => Promise<string>;
    /** Scorers to apply to each output. At least one recommended. */
    scorers?: Scorer[];
    /** Max concurrent agent invocations. Default: 1 */
    concurrency?: number;
    /**
     * A sample is considered "passed" if its avgScore >= this threshold (0–1).
     * Default: 0.7
     */
    passThreshold?: number;
    /**
     * Called after each sample completes (for progress reporting).
     */
    onSample?: (result: BenchmarkSampleResult, index: number, total: number) => void;
}

// ── Benchmark runner ──────────────────────────────────────────────────────────

let _sampleCounter = 0;

/**
 * Run a benchmark and return a full report.
 */
export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkReport> {
    const {
        name,
        dataset,
        run,
        scorers = [],
        concurrency = 1,
        passThreshold = 0.7,
        onSample,
    } = options;

    const startedAt = Date.now();
    const results: BenchmarkSampleResult[] = new Array(dataset.length);

    // Process in concurrent batches
    for (let i = 0; i < dataset.length; i += concurrency) {
        const batch = dataset.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map((sample, j) => _runSample(sample, i + j, run, scorers)),
        );
        for (let j = 0; j < batchResults.length; j++) {
            results[i + j] = batchResults[j]!;
            onSample?.(batchResults[j]!, i + j, dataset.length);
        }
    }

    const durationMs = Date.now() - startedAt;
    const summary    = _buildSummary(results, scorers, passThreshold);

    return {
        name,
        timestamp: new Date().toISOString(),
        durationMs,
        samples: results,
        summary,
    };
}

// ── Built-in scorers ──────────────────────────────────────────────────────────

/** 1.0 if `output.trim().toLowerCase() === expected.trim().toLowerCase()`, else 0 */
export function exactMatchScorer(): Scorer {
    return {
        name: 'exact_match',
        score(output, expected) {
            if (expected === undefined) return 0;
            return output.trim().toLowerCase() === expected.trim().toLowerCase() ? 1 : 0;
        },
    };
}

/** 1.0 if output contains `expected` as a substring (case-insensitive), else 0 */
export function containsScorer(): Scorer {
    return {
        name: 'contains',
        score(output, expected) {
            if (expected === undefined) return 0;
            return output.toLowerCase().includes(expected.toLowerCase()) ? 1 : 0;
        },
    };
}

/** Word-overlap F1 score (0–1) */
export function wordOverlapScorer(): Scorer {
    return {
        name: 'word_overlap_f1',
        score(output, expected) {
            if (expected === undefined) return 0;
            return wordOverlapF1(output, expected);
        },
    };
}

/** ROUGE-L score (0–1) */
export function rougeLScorer(): Scorer {
    return {
        name: 'rouge_l',
        score(output, expected) {
            if (expected === undefined) return 0;
            return rougeLWords(output, expected);
        },
    };
}

/** LLM-as-judge scorer — calls `runLlmAsJudge` and normalises score to 0–1 */
export function llmJudgeScorer(opts: {
    llm:      LLMProvider;
    rubric:   string;
    maxScore?: number;
    preamble?: string;
}): Scorer {
    const maxScore = opts.maxScore ?? 10;
    return {
        name: 'llm_judge',
        async score(output, expected) {
            const result = await runLlmAsJudge({
                llm:       opts.llm,
                rubric:    opts.rubric,
                candidate: output,
                reference: expected,
                maxScore,
                preamble:  opts.preamble,
            });
            return result.score / maxScore;
        },
    };
}

/** Build a scorer from any plain function */
export function customScorer(name: string, fn: ScorerFn): Scorer {
    return { name, score: fn };
}

// ── Report formatter ──────────────────────────────────────────────────────────

/**
 * Format a `BenchmarkReport` as a human-readable markdown string.
 */
export function formatBenchmarkReport(report: BenchmarkReport): string {
    const s = report.summary;
    const lines: string[] = [
        `# Benchmark: ${report.name}`,
        `**Date:** ${report.timestamp}   **Duration:** ${(report.durationMs / 1000).toFixed(1)}s`,
        '',
        '## Summary',
        `| Metric | Value |`,
        `|---|---|`,
        `| Total samples | ${s.total} |`,
        `| Passed (≥ threshold) | ${s.passed} (${(s.passRate * 100).toFixed(1)}%) |`,
        `| Failed | ${s.failed} |`,
        `| Median latency | ${s.medianLatencyMs.toFixed(0)}ms |`,
        `| p95 latency | ${s.p95LatencyMs.toFixed(0)}ms |`,
        '',
        '## Scores',
        '| Scorer | Avg |',
        '|---|---|',
        ...Object.entries(s.avgScores).map(([k, v]) => `| ${k} | ${(v * 100).toFixed(1)}% |`),
        '',
        '## Samples',
        '| ID | Input | Output | Avg Score | Error |',
        '|---|---|---|---|---|',
        ...report.samples.map((r) =>
            `| ${r.id} | ${_truncate(r.input, 40)} | ${_truncate(r.output, 60)} | ${(r.avgScore * 100).toFixed(0)}% | ${r.error ?? ''} |`,
        ),
    ];
    return lines.join('\n');
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function _runSample(
    sample:   BenchmarkSample,
    _index:   number,
    run:      BenchmarkOptions['run'],
    scorers:  Scorer[],
): Promise<BenchmarkSampleResult> {
    const id = sample.id ?? `sample-${++_sampleCounter}`;
    const t0 = Date.now();
    let output = '';
    let error: string | undefined;

    try {
        output = await run(sample.input, sample);
    } catch (err) {
        error = err instanceof Error ? err.message : String(err);
    }

    const latencyMs = Date.now() - t0;
    const scores: Record<string, number> = {};

    if (!error) {
        for (const scorer of scorers) {
            try {
                scores[scorer.name] = await scorer.score(output, sample.expected, sample);
            } catch {
                scores[scorer.name] = 0;
            }
        }
    }

    const scoreValues = Object.values(scores);
    const avgScore = scoreValues.length > 0
        ? scoreValues.reduce((s, v) => s + v, 0) / scoreValues.length
        : error ? 0 : 1;

    return { id, input: sample.input, expected: sample.expected, output, scores, avgScore, latencyMs, error, metadata: sample.metadata };
}

function _buildSummary(
    results:       BenchmarkSampleResult[],
    scorers:       Scorer[],
    passThreshold: number,
): BenchmarkSummary {
    const total  = results.length;
    const passed = results.filter((r) => !r.error && r.avgScore >= passThreshold).length;
    const failed = total - passed;

    const avgScores: Record<string, number> = {};
    for (const scorer of scorers) {
        const vals = results.filter((r) => !r.error).map((r) => r.scores[scorer.name] ?? 0);
        avgScores[scorer.name] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    }
    if (scorers.length > 0) {
        avgScores['overall'] = Object.values(avgScores).reduce((s, v) => s + v, 0) / scorers.length;
    }

    const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
    const median    = latencies[Math.floor(latencies.length / 2)] ?? 0;
    const p95       = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

    return { total, passed, failed, passRate: total ? passed / total : 0, avgScores, medianLatencyMs: median, p95LatencyMs: p95 };
}

function _truncate(s: string, max: number): string {
    const clean = s.replace(/\n/g, ' ').replace(/\|/g, '\\|');
    return clean.length <= max ? clean : clean.slice(0, max - 1) + '…';
}
