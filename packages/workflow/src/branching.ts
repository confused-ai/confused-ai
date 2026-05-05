/**
 * Workflow Branching & Loop Primitives
 * ======================================
 * Extend `compose()` pipelines with declarative control flow — no extra deps.
 *
 * Primitives:
 *   branch      — if/elseIf/else conditional routing between agents
 *   loopUntil   — repeat an agent step until a condition is met (or maxIter)
 *   forEach     — map a list of prompts through an agent, collecting results
 *   race        — run multiple agents concurrently, return the first to finish
 *   retry       — retry a step until it succeeds or maxAttempts is reached
 *
 * All primitives return a `WorkflowStep` that is compatible with `compose()`.
 *
 * Usage:
 *   import { branch, loopUntil, forEach, race, retry } from '@confused-ai/workflow';
 *
 *   const classify = branch(classifierAgent)
 *     .when((r) => r.text.includes('bug'),      bugFixAgent)
 *     .when((r) => r.text.includes('feature'),   featureAgent)
 *     .otherwise(generalAgent)
 *     .build();
 *
 *   const pipeline = compose(
 *     { agent: triageAgent },
 *     { agent: classify },
 *     { agent: summaryAgent },
 *   );
 */

import type { AgentRunResult, WorkflowAgent } from './types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowStep {
    readonly name: string;
    readonly instructions: string;
    run(prompt: string): Promise<AgentRunResult>;
}

// ── branch ────────────────────────────────────────────────────────────────────

export type BranchCondition = (result: AgentRunResult) => boolean | Promise<boolean>;

interface BranchCase {
    condition: BranchCondition;
    agent:     WorkflowAgent;
}

export interface BranchBuilder {
    when(condition: BranchCondition, agent: WorkflowAgent): BranchBuilder;
    otherwise(agent: WorkflowAgent): BranchBuilder;
    /** Finalise the branch into a WorkflowStep. */
    build(options?: { name?: string; instructions?: string }): WorkflowStep;
}

/**
 * Route to different agents based on the classifier output.
 *
 * @param classifier - Agent that classifies the input; its result is tested
 *                     against each `when()` condition in order.
 */
export function branch(classifier: WorkflowAgent): BranchBuilder {
    const cases: BranchCase[] = [];
    let fallback: WorkflowAgent | null = null;

    const builder: BranchBuilder = {
        when(condition, agent) {
            cases.push({ condition, agent });
            return builder;
        },
        otherwise(agent) {
            fallback = agent;
            return builder;
        },
        build(options = {}) {
            const name         = options.name         ?? `branch(${classifier.name})`;
            const instructions = options.instructions ?? classifier.instructions;

            return {
                name,
                instructions,
                async run(prompt: string): Promise<AgentRunResult> {
                    const classified = await classifier.run(prompt);
                    for (const { condition, agent } of cases) {
                        if (await condition(classified)) {
                            return agent.run(prompt);
                        }
                    }
                    if (fallback) return fallback.run(prompt);
                    return classified; // no branch matched, pass through
                },
            };
        },
    };

    return builder;
}

// ── loopUntil ─────────────────────────────────────────────────────────────────

export interface LoopUntilOptions {
    /** Max iterations before giving up. Default: 10 */
    maxIterations?: number;
    /** Transform the previous result into the next prompt. Default: `(r) => r.text` */
    nextPrompt?: (result: AgentRunResult, iteration: number) => string | Promise<string>;
    /**
     * Called after each iteration.
     * Can be used for logging or side effects.
     */
    onIteration?: (result: AgentRunResult, iteration: number) => void;
    name?: string;
    instructions?: string;
}

/**
 * Repeat `agent` until `condition(result)` returns true or `maxIterations` is reached.
 */
export function loopUntil(
    agent:     WorkflowAgent,
    condition: (result: AgentRunResult, iteration: number) => boolean | Promise<boolean>,
    options:   LoopUntilOptions = {},
): WorkflowStep {
    const maxIter   = options.maxIterations ?? 10;
    const nextPrompt = options.nextPrompt ?? ((r) => r.text);

    return {
        name:         options.name         ?? `loop(${agent.name})`,
        instructions: options.instructions ?? agent.instructions,

        async run(initialPrompt: string): Promise<AgentRunResult> {
            let prompt = initialPrompt;
            let result!: AgentRunResult;
            for (let i = 1; i <= maxIter; i++) {
                result = await agent.run(prompt);
                options.onIteration?.(result, i);
                if (await condition(result, i)) return result;
                if (i < maxIter) {
                    prompt = await nextPrompt(result, i);
                }
            }
            return result; // max iterations reached
        },
    };
}

// ── forEach ───────────────────────────────────────────────────────────────────

export interface ForEachOptions {
    /** Max concurrent agent invocations. Default: 1 (sequential). */
    concurrency?: number;
    /** Transform each item into a prompt string. Default: `String(item)`. */
    toPrompt?: (item: string, index: number) => string | Promise<string>;
    name?: string;
    instructions?: string;
}

export interface ForEachResult {
    results:  AgentRunResult[];
    /** Total text from all results, joined by '\n\n' */
    combined: string;
    /** Last result (for compose() compatibility) */
    text:     string;
    messages: unknown[];
    steps:    number;
    finishReason: string;
}

/**
 * Map an array of items through `agent`, collecting all results.
 * Returns a ForEachResult that also satisfies AgentRunResult.
 */
export function forEach(
    agent:   WorkflowAgent,
    items:   string[],
    options: ForEachOptions = {},
): WorkflowStep {
    const concurrency = Math.max(1, options.concurrency ?? 1);
    const toPrompt    = options.toPrompt ?? ((item) => item);

    return {
        name:         options.name         ?? `forEach(${agent.name})`,
        instructions: options.instructions ?? agent.instructions,

        async run(_prompt: string): Promise<AgentRunResult> {
            const results: AgentRunResult[] = new Array(items.length);

            // Process in concurrent batches
            for (let i = 0; i < items.length; i += concurrency) {
                const batch = items.slice(i, i + concurrency);
                const batchResults = await Promise.all(
                    batch.map(async (item, j) => {
                        const p = await toPrompt(item, i + j);
                        return agent.run(p);
                    }),
                );
                for (let j = 0; j < batchResults.length; j++) {
                    results[i + j] = batchResults[j]!;
                }
            }

            const combined = results.map((r) => r.text).join('\n\n');
            const usage = results.reduce(
                (acc, r) => ({
                    promptTokens:     acc.promptTokens     + (r.usage?.promptTokens    ?? 0),
                    completionTokens: acc.completionTokens + (r.usage?.completionTokens ?? 0),
                    totalTokens:      acc.totalTokens      + (r.usage?.totalTokens     ?? 0),
                }),
                { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            );
            return {
                text:         combined,
                messages:     results.flatMap((r) => r.messages),
                steps:        results.reduce((s, r) => s + r.steps, 0),
                finishReason: 'stop',
                usage,
            };
        },
    };
}

// ── race ──────────────────────────────────────────────────────────────────────

export interface RaceOptions {
    name?: string;
    instructions?: string;
    /** Called with the losing results (for cleanup / logging). */
    onLosers?: (results: AgentRunResult[]) => void;
}

/**
 * Run multiple agents concurrently with the same prompt.
 * Returns the result of whichever finishes first.
 */
export function race(agents: WorkflowAgent[], options: RaceOptions = {}): WorkflowStep {
    if (agents.length === 0) throw new Error('race: at least one agent required');
    return {
        name:         options.name         ?? `race(${agents.map((a) => a.name).join('|')})`,
        instructions: options.instructions ?? agents[0]!.instructions,

        async run(prompt: string): Promise<AgentRunResult> {
            const all = agents.map((a) => a.run(prompt));
            const winner = await Promise.race(all);
            if (options.onLosers) {
                void Promise.allSettled(all).then((settled) => {
                    const losers = settled
                        .filter((s): s is PromiseFulfilledResult<AgentRunResult> => s.status === 'fulfilled' && s.value !== winner)
                        .map((s) => s.value);
                    options.onLosers!(losers);
                });
            }
            return winner;
        },
    };
}

// ── retry ─────────────────────────────────────────────────────────────────────

export interface WorkflowRetryOptions {
    /** Max attempts including the first. Default: 3 */
    maxAttempts?: number;
    /** Initial back-off in ms (doubles each retry). Default: 500 */
    backoffMs?:   number;
    /** Custom success predicate — retry when this returns false. Default: always succeed. */
    isSuccess?:   (result: AgentRunResult) => boolean | Promise<boolean>;
    name?:        string;
    instructions?: string;
}

/**
 * Retry a step until `isSuccess` returns true or `maxAttempts` is exhausted.
 */
export function retry(agent: WorkflowAgent, options: WorkflowRetryOptions = {}): WorkflowStep {
    const maxAttempts = options.maxAttempts ?? 3;
    const backoffMs   = options.backoffMs   ?? 500;
    const isSuccess   = options.isSuccess   ?? (() => true);

    return {
        name:         options.name         ?? `retry(${agent.name})`,
        instructions: options.instructions ?? agent.instructions,

        async run(prompt: string): Promise<AgentRunResult> {
            let last!: AgentRunResult;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                last = await agent.run(prompt);
                if (await isSuccess(last)) return last;
                if (attempt < maxAttempts) {
                    await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt - 1)));
                }
            }
            return last;
        },
    };
}
