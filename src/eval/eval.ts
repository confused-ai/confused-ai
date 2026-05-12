/**
 * Evaluation Framework
 *
 * Metrics and evaluation utilities for measuring agent quality:
 * - Latency (end-to-end, per-step)
 * - Correctness (if gold labels available)
 * - Cost (token usage + pricing)
 * - Token usage (prompt, completion, total)
 */

/**
 * Single evaluation result
 */
export interface EvalResult {
    /**
     * Unique identifier for this evaluation
     */
    id: string;

    /**
     * Input prompt
     */
    input: string;

    /**
     * Model output
     */
    output: string;

    /**
     * Expected output (if available)
     */
    expected?: string;

    /**
     * Latency metrics (ms)
     */
    latency: {
        total: number;
        firstToken?: number;
    };

    /**
     * Token usage
     */
    tokens: {
        input: number;
        output: number;
        total: number;
    };

    /**
     * Cost in USD
     */
    cost: number;

    /**
     * Correctness score (0-1)
     */
    correctness?: number;

    /**
     * Custom metrics
     */
    custom?: Record<string, number | string>;

    /**
     * Timestamp
     */
    timestamp: number;

    /**
     * Error if failed
     */
    error?: string;
}

/**
 * Evaluation statistics
 */
export interface EvalStats {
    /**
     * Number of evaluations
     */
    total: number;

    /**
     * Success rate (0-1)
     */
    successRate: number;

    /**
     * Latency stats
     */
    latency: {
        mean: number;
        median: number;
        p95: number;
        p99: number;
        min: number;
        max: number;
    };

    /**
     * Cost stats
     */
    cost: {
        total: number;
        mean: number;
        median: number;
        min: number;
        max: number;
    };

    /**
     * Token usage stats
     */
    tokens: {
        input: { total: number; mean: number };
        output: { total: number; mean: number };
        total: { total: number; mean: number };
    };

    /**
     * Correctness stats (if available)
     */
    correctness?: {
        mean: number;
        median: number;
        min: number;
        max: number;
    };

    /**
     * Custom metric stats
     */
    custom?: Record<string, { mean: number; min: number; max: number }>;
}

/**
 * Evaluation aggregator and statistics calculator
 */
export class EvalAggregator {
    private results: EvalResult[] = [];

    /**
     * Add an evaluation result
     */
    addResult(result: EvalResult): void {
        this.results.push(result);
    }

    /**
     * Add multiple results
     */
    addResults(results: EvalResult[]): void {
        this.results.push(...results);
    }

    /**
     * Get all results
     */
    getResults(): EvalResult[] {
        return [...this.results];
    }

    /**
     * Filter results by criteria
     */
    filterResults(predicate: (result: EvalResult) => boolean): EvalResult[] {
        return this.results.filter(predicate);
    }

    /**
     * Calculate comprehensive stats
     */
    getStats(): EvalStats {
        if (this.results.length === 0) {
            return {
                total: 0,
                successRate: 0,
                latency: { mean: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0 },
                cost: { total: 0, mean: 0, median: 0, min: 0, max: 0 },
                tokens: {
                    input: { total: 0, mean: 0 },
                    output: { total: 0, mean: 0 },
                    total: { total: 0, mean: 0 },
                },
            };
        }

        const successful = this.results.filter((r) => !r.error);
        const latencies = successful.map((r) => r.latency.total).sort((a, b) => a - b);
        const costs = successful.map((r) => r.cost).sort((a, b) => a - b);

        const stats: EvalStats = {
            total: this.results.length,
            successRate: successful.length / this.results.length,
            latency: {
                mean: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
                median: this.median(latencies),
                p95: this.percentile(latencies, 0.95),
                p99: this.percentile(latencies, 0.99),
                min: latencies.length ? Math.min(...latencies) : 0,
                max: latencies.length ? Math.max(...latencies) : 0,
            },
            cost: {
                total: costs.reduce((a, b) => a + b, 0),
                mean: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0,
                median: this.median(costs),
                min: costs.length ? Math.min(...costs) : 0,
                max: costs.length ? Math.max(...costs) : 0,
            },
            tokens: {
                input: {
                    total: successful.reduce((sum, r) => sum + r.tokens.input, 0),
                    mean: successful.length ? successful.reduce((sum, r) => sum + r.tokens.input, 0) / successful.length : 0,
                },
                output: {
                    total: successful.reduce((sum, r) => sum + r.tokens.output, 0),
                    mean: successful.length ? successful.reduce((sum, r) => sum + r.tokens.output, 0) / successful.length : 0,
                },
                total: {
                    total: successful.reduce((sum, r) => sum + r.tokens.total, 0),
                    mean: successful.length ? successful.reduce((sum, r) => sum + r.tokens.total, 0) / successful.length : 0,
                },
            },
        };

        // Correctness stats
        const correctnessScores = successful
            .filter((r) => r.correctness !== undefined)
            .map((r) => r.correctness!)
            .sort((a, b) => a - b);

        if (correctnessScores.length > 0) {
            stats.correctness = {
                mean: correctnessScores.reduce((a, b) => a + b, 0) / correctnessScores.length,
                median: this.median(correctnessScores),
                min: Math.min(...correctnessScores),
                max: Math.max(...correctnessScores),
            };
        }

        return stats;
    }

    /**
     * Export results as CSV
     */
    exportCSV(): string {
        if (this.results.length === 0) return '';

        const headers = [
            'id',
            'input',
            'output',
            'expected',
            'latency_ms',
            'tokens_input',
            'tokens_output',
            'tokens_total',
            'cost_usd',
            'correctness',
            'timestamp',
            'error',
        ];

        const rows = this.results.map((r) => [
            r.id,
            `"${r.input.replace(/"/g, '""')}"`,
            `"${r.output.replace(/"/g, '""')}"`,
            r.expected ? `"${r.expected.replace(/"/g, '""')}"` : '',
            r.latency.total,
            r.tokens.input,
            r.tokens.output,
            r.tokens.total,
            r.cost.toFixed(4),
            r.correctness?.toFixed(4) ?? '',
            r.timestamp,
            r.error ? `"${r.error.replace(/"/g, '""')}"` : '',
        ]);

        return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    /**
     * Export results as JSON
     */
    exportJSON(): string {
        return JSON.stringify(this.results, null, 2);
    }

    /**
     * Clear all results
     */
    clear(): void {
        this.results = [];
    }

    /**
     * Helper: calculate median
     */
    private median(sorted: number[]): number {
        if (sorted.length === 0) return 0;
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    /**
     * Helper: calculate percentile
     */
    private percentile(sorted: number[], p: number): number {
        if (sorted.length === 0) return 0;
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, index)];
    }
}

/**
 * Accuracy evaluator (simple exact/partial match)
 */
export interface AccuracyEvaluator {
    /**
     * Score output against expected (0-1)
     */
    score(output: string, expected: string): number;
}

/**
 * Exact match accuracy
 */
export const ExactMatchAccuracy: AccuracyEvaluator = {
    score: (output, expected) => (output.trim() === expected.trim() ? 1.0 : 0.0),
};

/**
 * Partial match accuracy (substring)
 */
export const PartialMatchAccuracy: AccuracyEvaluator = {
    score: (output, expected) => {
        const out = output.toLowerCase().trim();
        const exp = expected.toLowerCase().trim();
        if (out === exp) return 1.0;
        if (out.includes(exp) || exp.includes(out)) return 0.5;
        return 0.0;
    },
};

/**
 * Levenshtein distance-based accuracy (normalized edit distance)
 */
export const LevenshteinAccuracy: AccuracyEvaluator = {
    score: (output, expected) => {
        const a = output.trim();
        const b = expected.trim();
        const maxLen = Math.max(a.length, b.length);
        if (maxLen === 0) return 1.0;

        const dist = editDistance(a, b);
        return 1.0 - dist / maxLen;
    },
};

/**
 * Calculate Levenshtein edit distance
 */
function editDistance(a: string, b: string): number {
    const arr: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) arr[i][0] = i;
    for (let j = 0; j <= b.length; j++) arr[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            arr[i][j] = Math.min(
                arr[i - 1][j] + 1,
                arr[i][j - 1] + 1,
                arr[i - 1][j - 1] + cost,
            );
        }
    }

    return arr[a.length][b.length];
}

function tokenizeWords(s: string): string[] {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

/**
 * Token-level F1 overlap between candidate and reference (cheap lexical metric).
 * Returns 0–1.
 */
export function wordOverlapF1(candidate: string, reference: string): number {
    const a = tokenizeWords(candidate);
    const b = tokenizeWords(reference);
    if (a.length === 0 && b.length === 0) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    const countsB = new Map<string, number>();
    for (const w of b) {
        countsB.set(w, (countsB.get(w) ?? 0) + 1);
    }
    let overlap = 0;
    const countsA = new Map<string, number>();
    for (const w of a) {
        countsA.set(w, (countsA.get(w) ?? 0) + 1);
    }
    for (const [w, ca] of countsA) {
        const cb = countsB.get(w) ?? 0;
        overlap += Math.min(ca, cb);
    }
    const prec = overlap / a.length;
    const rec = overlap / b.length;
    if (prec + rec === 0) return 0;
    return (2 * prec * rec) / (prec + rec);
}

/** Longest common subsequence length on word tokens */
function lcsWords(a: string[], b: string[]): number {
    const n = a.length;
    const m = b.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[n][m];
}

/**
 * Word-level ROUGE-L style score: LCS / (candidate words + reference words) scaled to 0–1.
 */
export function rougeLWords(candidate: string, reference: string): number {
    const a = tokenizeWords(candidate);
    const b = tokenizeWords(reference);
    if (a.length === 0 && b.length === 0) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    const lcs = lcsWords(a, b);
    const r = lcs / b.length;
    const p = lcs / a.length;
    if (p + r === 0) return 0;
    return (2 * p * r) / (p + r);
}
