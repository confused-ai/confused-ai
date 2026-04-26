/**
 * LLM-as-judge: rubric-based scoring for eval pipelines and guardrails.
 */

import type { LLMProvider } from '../providers/types.js';
import { extractJson } from '../providers/structured-output.js';

export interface LlmJudgeOptions {
    readonly llm: LLMProvider;
    /** What “good” means for this task */
    readonly rubric: string;
    /** Model output to score */
    readonly candidate: string;
    /** Optional gold answer */
    readonly reference?: string;
    /** Max score (inclusive). Default 10 */
    readonly maxScore?: number;
    /** Extra system context for the judge model */
    readonly preamble?: string;
}

export interface LlmJudgeResult {
    readonly score: number;
    readonly rationale: string;
    readonly rawText: string;
}

/**
 * Ask an LLM to return JSON `{ "score": number, "rationale": string }`.
 */
export async function runLlmAsJudge(options: LlmJudgeOptions): Promise<LlmJudgeResult> {
    const max = options.maxScore ?? 10;
    const ref = options.reference
        ? `Reference (may be incomplete):\n${options.reference}\n\n`
        : '';
    const preamble = options.preamble
        ? `${options.preamble}\n\n`
        : 'You are a fair evaluator. Score strictly against the rubric.\n\n';
    const user = `${preamble}${ref}Rubric:\n${options.rubric}\n\nCandidate:\n${options.candidate}\n\nRespond with ONLY a JSON object: {"score": number from 0 to ${max}, "rationale": string}`;

    const { text } = await options.llm.generateText([{ role: 'user', content: user }], {
        maxTokens: 600,
        temperature: 0.2,
    });

    let parsed: { score?: unknown; rationale?: unknown } | null = null;
    try {
        parsed = extractJson(text) as { score?: unknown; rationale?: unknown };
    } catch {
        parsed = null;
    }
    const scoreRaw = parsed?.score;
    const rationaleRaw = parsed?.rationale;
    let score = typeof scoreRaw === 'number' ? scoreRaw : Number(scoreRaw);
    if (!Number.isFinite(score)) {
        score = 0;
    }
    score = Math.max(0, Math.min(max, score));
    const rationale =
        typeof rationaleRaw === 'string' ? rationaleRaw : parsed ? 'No rationale parsed' : 'No JSON in judge output';

    return { score, rationale, rawText: text };
}

// ── Multi-criteria judge ───────────────────────────────────────────────────

export interface JudgeCriterion {
    /** Machine-readable key (e.g. 'relevance', 'groundedness') */
    name: string;
    /** Description used in the judge prompt */
    description: string;
    /** Numeric scale max. Default 10 */
    maxScore?: number;
}

export interface MultiCriteriaJudgeOptions {
    llm: LLMProvider;
    criteria: JudgeCriterion[];
    preamble?: string;
    /** Timeout per judgment in ms. Default 30_000 */
    timeoutMs?: number;
}

export interface CriterionScore {
    readonly name: string;
    readonly score: number;
    readonly maxScore: number;
    /** Normalised 0-1 */
    readonly normalised: number;
    readonly rationale: string;
}

export interface MultiCriteriaJudgeResult {
    readonly criteria: CriterionScore[];
    /** Mean of normalised scores across all criteria */
    readonly overallScore: number;
    readonly rawText: string;
}

export interface MultiCriteriaJudgeInput {
    candidate: string;
    reference?: string;
    context?: string;
}

export type MultiCriteriaJudge = (input: MultiCriteriaJudgeInput) => Promise<MultiCriteriaJudgeResult>;

/**
 * Create a reusable multi-criteria judge.
 *
 * Scores the candidate against every criterion in a single LLM call.
 *
 * @example
 * ```ts
 * const judge = createMultiCriteriaJudge({
 *   llm: openaiProvider,
 *   criteria: RAG_CRITERIA,
 * });
 * const result = await judge({ candidate: agentResponse, reference: expected });
 * console.log(result.overallScore);
 * ```
 */
export function createMultiCriteriaJudge(opts: MultiCriteriaJudgeOptions): MultiCriteriaJudge {
    const { llm, criteria, preamble, timeoutMs = 30_000 } = opts;
    if (criteria.length === 0) throw new Error('createMultiCriteriaJudge: criteria must not be empty');

    return async (input: MultiCriteriaJudgeInput): Promise<MultiCriteriaJudgeResult> => {
        const criteriaBlock = criteria
            .map((c) => `- "${c.name}" (0-${c.maxScore ?? 10}): ${c.description}`)
            .join('\n');

        const responseShape = JSON.stringify(
            Object.fromEntries(criteria.map((c) => [c.name, { score: 0, rationale: '...' }])),
            null, 2,
        );

        const contextBlock = input.context ? `\nRelevant context:\n${input.context}\n` : '';
        const referenceBlock = input.reference ? `\nReference answer:\n${input.reference}\n` : '';
        const system = preamble ?? 'You are an expert AI evaluator. Be concise and honest.';

        const user = [
            system, '',
            'Score the candidate answer against each criterion below.', '',
            'Criteria:', criteriaBlock,
            contextBlock, referenceBlock,
            `Candidate:\n${input.candidate}`, '',
            'Respond with ONLY a JSON object matching this shape:',
            responseShape,
        ].join('\n');

        const genPromise = llm.generateText([{ role: 'user', content: user }], {
            maxTokens: 800, temperature: 0.1,
        });
        const timerPromise = new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error(`Multi-criteria judge timed out after ${timeoutMs}ms`)), timeoutMs)
        );

        let rawText = '';
        let parsed: Record<string, unknown> | null = null;

        try {
            const { text } = await Promise.race([genPromise, timerPromise]);
            rawText = text;
            parsed = extractJson(text) as Record<string, unknown>;
        } catch (err) {
            const zeroCriteria = criteria.map((c) => ({
                name: c.name, score: 0, maxScore: c.maxScore ?? 10, normalised: 0,
                rationale: err instanceof Error ? err.message : 'Judge call failed',
            }));
            return { criteria: zeroCriteria, overallScore: 0, rawText };
        }

        const scoredCriteria: CriterionScore[] = criteria.map((c) => {
            const entry = (parsed?.[c.name] ?? {}) as { score?: unknown; rationale?: unknown };
            const max = c.maxScore ?? 10;
            let score = typeof entry.score === 'number' ? entry.score : Number(entry.score ?? 0);
            if (!Number.isFinite(score)) score = 0;
            score = Math.max(0, Math.min(max, score));
            const rationale = typeof entry.rationale === 'string' ? entry.rationale : 'No rationale';
            return { name: c.name, score, maxScore: max, normalised: score / max, rationale };
        });

        const overallScore =
            scoredCriteria.reduce((acc, c) => acc + c.normalised, 0) / scoredCriteria.length;

        return { criteria: scoredCriteria, overallScore, rawText };
    };
}

// ── Built-in criteria presets ──────────────────────────────────────────────

/** Standard criteria for RAG / QA evaluation */
export const RAG_CRITERIA: JudgeCriterion[] = [
    { name: 'relevance',     description: 'Does the response directly answer the question?' },
    { name: 'groundedness',  description: 'Is every factual claim supported by the provided context?' },
    { name: 'completeness',  description: 'Does the response cover all important aspects of the question?' },
    { name: 'conciseness',   description: 'Is the response appropriately brief without omitting key info?' },
];

/** Standard criteria for agentic / task completion evaluation */
export const AGENT_CRITERIA: JudgeCriterion[] = [
    { name: 'task_completion', description: 'Did the agent complete the requested task?' },
    { name: 'correctness',     description: 'Is the output factually correct and free of errors?' },
    { name: 'helpfulness',     description: 'Is the output useful and actionable for the user?' },
    { name: 'safety',          description: 'Is the output free of harmful, biased, or inappropriate content?' },
];

// ── Batch eval runner ──────────────────────────────────────────────────────

export interface EvalCase {
    id: string;
    candidate: string;
    reference?: string;
    context?: string;
}

export interface EvalRunResult {
    id: string;
    result: MultiCriteriaJudgeResult | null;
    error?: string;
    durationMs: number;
}

export interface EvalSummary {
    total: number;
    succeeded: number;
    failed: number;
    meanOverallScore: number;
    criteriaScores: Record<string, number>;
    results: EvalRunResult[];
}

export interface EvalRunnerOptions {
    judge: MultiCriteriaJudge;
    cases: EvalCase[];
    /** Max concurrent judgments. Default 5 */
    concurrency?: number;
    /** Retries on LLM failure. Default 1 */
    retries?: number;
    onProgress?: (completed: number, total: number, latest: EvalRunResult) => void;
}

/**
 * Run a batch of evaluation cases through a multi-criteria judge.
 *
 * @example
 * ```ts
 * const summary = await runEvalBatch({ judge, cases, concurrency: 10 });
 * console.log(`Mean score: ${summary.meanOverallScore.toFixed(2)}`);
 * ```
 */
export async function runEvalBatch(opts: EvalRunnerOptions): Promise<EvalSummary> {
    const { judge, cases, concurrency = 5, retries = 1, onProgress } = opts;
    const results: EvalRunResult[] = [];
    let completed = 0;

    async function processCase(c: EvalCase): Promise<EvalRunResult> {
        const start = Date.now();
        let lastErr: string | undefined;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const result = await judge({ candidate: c.candidate, reference: c.reference, context: c.context });
                return { id: c.id, result, durationMs: Date.now() - start };
            } catch (err) {
                lastErr = err instanceof Error ? err.message : String(err);
                if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            }
        }
        return { id: c.id, result: null, error: lastErr, durationMs: Date.now() - start };
    }

    // Sliding window concurrency
    const pending = [...cases];
    const active: Promise<void>[] = [];

    while (pending.length > 0 || active.length > 0) {
        while (active.length < concurrency && pending.length > 0) {
            const c = pending.shift()!;
            const p: Promise<void> = processCase(c).then((r) => {
                results.push(r);
                completed++;
                onProgress?.(completed, cases.length, r);
                const idx = active.indexOf(p);
                if (idx !== -1) active.splice(idx, 1);
            });
            active.push(p);
        }
        if (active.length > 0) await Promise.race(active);
    }

    const succeeded = results.filter((r) => r.result !== null);
    const meanOverallScore = succeeded.length > 0
        ? succeeded.reduce((acc, r) => acc + (r.result?.overallScore ?? 0), 0) / succeeded.length
        : 0;

    const criteriaAccum: Record<string, number[]> = {};
    for (const r of succeeded) {
        for (const c of r.result?.criteria ?? []) {
            if (!criteriaAccum[c.name]) criteriaAccum[c.name] = [];
            criteriaAccum[c.name]!.push(c.normalised);
        }
    }
    const criteriaScores: Record<string, number> = {};
    for (const [name, scores] of Object.entries(criteriaAccum)) {
        criteriaScores[name] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    return {
        total: cases.length,
        succeeded: succeeded.length,
        failed: results.filter((r) => r.result === null).length,
        meanOverallScore,
        criteriaScores,
        results,
    };
}
