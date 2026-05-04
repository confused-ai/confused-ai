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

export interface RegressionReport {
    results: RegressionResult[];
    totalSamples: number;
    passed: number;
    failed: number;
    meanScore: number;
    passRate: number;
    regressions: RegressionResult[];
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
}

/**
 * Run a regression evaluation over a dataset.
 */
export async function runRegression(opts: RegressionRunOptions): Promise<RegressionReport> {
    const { samples, run, score, threshold = 0.6, concurrency = 4 } = opts;
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

    return {
        results,
        totalSamples: results.length,
        passed,
        failed: results.length - passed,
        meanScore,
        passRate: passed / (results.length || 1),
        regressions: results.filter(r => !r.passed),
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
