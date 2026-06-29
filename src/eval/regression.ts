/**
 * Regression runner: runs an eval dataset through a function and reports pass/fail.
 * Designed for CI/CD pipelines — exit code 1 on regression.
 */

import type { EvalSample } from './dataset.js';

export interface RegressionCase {
    sample: EvalSample;
    /** Function under test — returns candidate output */
    run: (input: string) => Promise<string>;
    /** Scorer: returns 0–1 */
    score: (candidate: string, expected: string | undefined) => Promise<number> | number;
}

export interface RegressionResult {
    id: string;
    input: string;
    candidate: string;
    expected?: string;
    score: number;
    passed: boolean;
}

/**
 * Prior-run aggregate to compare the current run against.
 * Provide whichever metric(s) you track; comparison is skipped for omitted ones.
 */
export interface RegressionBaseline {
    /** Prior mean score (0–1). */
    meanScore?: number;
    /** Prior pass rate (0–1). */
    passRate?: number;
}

export interface RegressionReport {
    results: RegressionResult[];
    totalSamples: number;
    passed: number;
    failed: number;
    meanScore: number;
    passRate: number;
    regressions: RegressionResult[];
    /**
     * True when a baseline was provided AND the current aggregate dropped below
     * `baseline - tolerance` on any compared metric. `undefined` when no baseline
     * was supplied (fixed-threshold mode only).
     */
    baselineRegression?: boolean;
    /** Per-metric deltas (current − baseline) when a baseline was provided. */
    baselineDelta?: { meanScore?: number; passRate?: number };
}

export interface RegressionRunOptions {
    /** Dataset samples */
    samples: EvalSample[];
    /** Function under test */
    run: (input: string) => Promise<string>;
    /** Scorer */
    score: (candidate: string, expected: string | undefined) => Promise<number> | number;
    /** Pass threshold (0–1, default 0.6) */
    threshold?: number;
    /** Concurrency (default 4) */
    concurrency?: number;
    /**
     * Optional prior-run aggregate. When provided, the report sets
     * `baselineRegression` if the new aggregate drops below baseline minus
     * {@link regressionTolerance}. When omitted, only the fixed `threshold`
     * gate is applied (default behavior, unchanged).
     */
    baseline?: RegressionBaseline;
    /** Allowed drop from baseline before flagging a regression (default 0.05). */
    regressionTolerance?: number;
}

/**
 * Run a regression evaluation over a dataset.
 */
export async function runRegression(opts: RegressionRunOptions): Promise<RegressionReport> {
    const { samples, run, score, threshold = 0.6, concurrency = 4, baseline, regressionTolerance = 0.05 } = opts;
    const results: RegressionResult[] = [];

    for (let i = 0; i < samples.length; i += concurrency) {
        const batch = samples.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(async (sample) => {
                const candidate = await run(sample.input);
                const s = await score(candidate, sample.expected);
                return {
                    id: sample.id ?? String(i),
                    input: sample.input,
                    candidate,
                    expected: sample.expected,
                    score: s,
                    passed: s >= threshold,
                } satisfies RegressionResult;
            })
        );
        results.push(...batchResults);
    }

    const passed = results.filter(r => r.passed).length;
    const meanScore = results.reduce((acc, r) => acc + r.score, 0) / (results.length || 1);
    const passRate = passed / (results.length || 1);

    // Optional baseline comparison — flag a regression when the new aggregate
    // drops below baseline minus the tolerance band on any compared metric.
    let baselineRegression: boolean | undefined;
    let baselineDelta: { meanScore?: number; passRate?: number } | undefined;
    if (baseline) {
        baselineRegression = false;
        baselineDelta = {};
        if (baseline.meanScore != null) {
            baselineDelta.meanScore = meanScore - baseline.meanScore;
            if (meanScore < baseline.meanScore - regressionTolerance) baselineRegression = true;
        }
        if (baseline.passRate != null) {
            baselineDelta.passRate = passRate - baseline.passRate;
            if (passRate < baseline.passRate - regressionTolerance) baselineRegression = true;
        }
    }

    return {
        results,
        totalSamples: results.length,
        passed,
        failed: results.length - passed,
        meanScore,
        passRate,
        regressions: results.filter(r => !r.passed),
        ...(baselineRegression !== undefined ? { baselineRegression } : {}),
        ...(baselineDelta !== undefined ? { baselineDelta } : {}),
    };
}

/**
 * Print a human-readable regression report to console.
 */
export function printRegressionReport(report: RegressionReport): void {
    console.log(`\n=== Eval Regression Report ===`);
    console.log(`Samples:   ${report.totalSamples}`);
    console.log(`Passed:    ${report.passed}`);
    console.log(`Failed:    ${report.failed}`);
    console.log(`Pass rate: ${(report.passRate * 100).toFixed(1)}%`);
    console.log(`Mean score: ${report.meanScore.toFixed(3)}`);
    if (report.baselineRegression !== undefined) {
        const d = report.baselineDelta;
        const parts: string[] = [];
        if (d?.meanScore != null) parts.push(`mean ${d.meanScore >= 0 ? '+' : ''}${d.meanScore.toFixed(3)}`);
        if (d?.passRate != null) parts.push(`passRate ${d.passRate >= 0 ? '+' : ''}${(d.passRate * 100).toFixed(1)}%`);
        console.log(`Baseline:  ${report.baselineRegression ? 'REGRESSION' : 'OK'}${parts.length ? ` (${parts.join(', ')})` : ''}`);
    }
    if (report.regressions.length > 0) {
        console.log(`\nRegressions:`);
        for (const r of report.regressions) {
            console.log(`  [FAIL] id=${r.id} score=${r.score.toFixed(3)}`);
            console.log(`    input:    ${r.input.slice(0, 80)}`);
            console.log(`    output:   ${r.candidate.slice(0, 80)}`);
            if (r.expected) console.log(`    expected: ${r.expected.slice(0, 80)}`);
        }
    }
}
