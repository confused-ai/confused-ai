/**
 * Tree-of-Thought (ToT) Engine
 * ============================
 * Explores multiple reasoning branches in parallel (beam search) and selects
 * the highest-confidence branch as the final answer.
 *
 * Algorithm: BFS beam search
 *   - Expand `beamWidth` candidate thoughts from each node
 *   - Score each candidate with a self-evaluation LLM call
 *   - Keep top-`beamWidth` branches by score at each depth level
 *   - Return the terminal leaf with the highest cumulative score
 *
 * Usage:
 *   const tot = new TreeOfThoughtEngine({
 *     generate: async (msgs) => llm.chat(msgs),
 *     evaluate: async (thought, goal) => llm.chat([...]), // returns 0-1 score string
 *     beamWidth: 3,
 *     maxDepth: 4,
 *   });
 *
 *   const result = await tot.solve(goal, context);
 *   console.log(result.bestThought, result.score);
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TotConfig {
    /**
     * LLM callable — same signature as ReasoningManager.generate.
     * Used to generate candidate thoughts.
     */
    generate: (messages: Array<{ role: string; content: string }>) => Promise<string>;
    /**
     * Optional separate evaluator LLM — scores a candidate thought.
     * Should return a JSON object with a `score` field (0.0–1.0) or a plain float string.
     * Defaults to using `generate` when absent.
     */
    evaluate?: (messages: Array<{ role: string; content: string }>) => Promise<string>;
    /** Number of branches to expand and keep per BFS level. Default: 3 */
    beamWidth?: number;
    /** Maximum BFS depth (tree depth). Default: 4 */
    maxDepth?: number;
    /** System prompt for generating new thoughts */
    generationPrompt?: string;
    /** System prompt for evaluating thoughts */
    evaluationPrompt?: string;
}

export interface TotNode {
    /** The thought text at this node */
    thought: string;
    /** Depth level (root = 0) */
    depth: number;
    /** Cumulative score product from root to this node */
    score: number;
    /** Parent node index (root has -1) */
    parentIndex: number;
}

export interface TotResult {
    /** The best final thought from the beam */
    bestThought: string;
    /** Cumulative score of the best branch (0–1) */
    score: number;
    /** Full beam tree (for inspection/debugging) */
    nodes: TotNode[];
    /** Number of BFS levels traversed */
    depth: number;
}

// ── Default prompts ───────────────────────────────────────────────────────────

const DEFAULT_GENERATION_PROMPT = `You are a creative problem-solving assistant using Tree-of-Thought reasoning.
Given a goal and the current partial thought chain, generate ONE concise next reasoning step.
Output ONLY the step as plain text — no JSON, no preamble, no explanation.`;

const DEFAULT_EVALUATION_PROMPT = `You are a rigorous evaluator of reasoning steps.
Given a goal and a candidate reasoning step, output a single JSON object:
{ "score": <float 0.0-1.0>, "rationale": "<brief justification>" }
Score criteria:
  1.0 = directly solves the goal, factually correct, concise
  0.7 = helpful partial progress
  0.4 = marginally relevant
  0.0 = off-topic, harmful, or factually wrong`;

// ── TreeOfThoughtEngine ───────────────────────────────────────────────────────

export class TreeOfThoughtEngine {
    private readonly _generate: TotConfig['generate'];
    private readonly _evaluate: NonNullable<TotConfig['evaluate']>;
    private readonly _beamWidth: number;
    private readonly _maxDepth: number;
    private readonly _generationPrompt: string;
    private readonly _evaluationPrompt: string;

    constructor(config: TotConfig) {
        this._generate         = config.generate;
        this._evaluate         = config.evaluate ?? config.generate;
        this._beamWidth        = config.beamWidth        ?? 3;
        this._maxDepth         = config.maxDepth         ?? 4;
        this._generationPrompt = config.generationPrompt ?? DEFAULT_GENERATION_PROMPT;
        this._evaluationPrompt = config.evaluationPrompt ?? DEFAULT_EVALUATION_PROMPT;
    }

    /**
     * Run beam-search Tree-of-Thought for `goal` with optional initial `context`.
     *
     * Returns the best leaf node (highest cumulative score) and the full beam.
     */
    async solve(
        goal: string,
        context?: string,
    ): Promise<TotResult> {
        const nodes: TotNode[] = [];

        // ── Seed: generate `beamWidth` root thoughts ─────────────────────────
        const roots = await this._expandThoughts(goal, context ?? '', [], nodes.length);
        for (const root of roots) nodes.push(root);

        // Current beam = indices into `nodes`
        let beam: number[] = roots.map((_, i) => i);

        // ── BFS levels ────────────────────────────────────────────────────────
        let depth = 1;
        while (depth < this._maxDepth && beam.length > 0) {
            const nextBeam: Array<{ nodeIndex: number; score: number }> = [];

            // Expand each current beam node in parallel
            const expansions = await Promise.all(
                beam.map(async (nodeIdx) => {
                    const parent = nodes[nodeIdx]!;
                    const ancestry = this._ancestryChain(nodes, nodeIdx);
                    const children = await this._expandThoughts(goal, ancestry, [parent], nodes.length + nextBeam.length);
                    return { children, parentIdx: nodeIdx, parentScore: parent.score };
                }),
            );

            for (const { children, parentIdx, parentScore } of expansions) {
                for (const child of children) {
                    const childIdx = nodes.length;
                    // Adjust parentIndex to point to the actual parent in the flat array
                    const node: TotNode = {
                        thought:     child.thought,
                        depth:       child.depth,
                        score:       parentScore * child.score,   // cumulative product
                        parentIndex: parentIdx,
                    };
                    nodes.push(node);
                    nextBeam.push({ nodeIndex: childIdx, score: node.score });
                }
            }

            // Keep top-beamWidth by cumulative score
            nextBeam.sort((a, b) => b.score - a.score);
            beam = nextBeam.slice(0, this._beamWidth).map((e) => e.nodeIndex);
            depth++;
        }

        // ── Select best leaf ──────────────────────────────────────────────────
        let bestIdx = 0;
        let bestScore = -1;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i]!;
            if (n.score > bestScore) { bestScore = n.score; bestIdx = i; }
        }

        const best = nodes[bestIdx]!;
        return {
            bestThought: best.thought,
            score:       best.score,
            nodes,
            depth,
        };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Generate `beamWidth` candidate thoughts for the current position.
     * Evaluates each thought and returns scored TotNode stubs.
     * Offset is used to avoid index collisions when called in parallel.
     */
    private async _expandThoughts(
        goal: string,
        context: string,
        priorThoughts: TotNode[],
        _offset: number,
    ): Promise<TotNode[]> {
        const depth = priorThoughts.length > 0
            ? (priorThoughts[priorThoughts.length - 1]!.depth + 1)
            : 0;

        const chainText = priorThoughts.map((n, i) => `Step ${i + 1}: ${n.thought}`).join('\n');
        const userMsg = [
            `Goal: ${goal}`,
            context ? `Context: ${context}` : '',
            chainText ? `Prior steps:\n${chainText}` : '',
            `Generate step ${depth + 1}:`,
        ].filter(Boolean).join('\n\n');

        // Generate `beamWidth` candidates in parallel
        const candidatePromises = Array.from({ length: this._beamWidth }, () =>
            this._generate([
                { role: 'system', content: this._generationPrompt },
                { role: 'user',   content: userMsg },
            ]).catch(() => ''),
        );
        const candidates = await Promise.all(candidatePromises);

        // Evaluate each candidate in parallel
        const evalPromises = candidates.map((thought) => {
            if (!thought) return Promise.resolve(0);
            const evalMsg = [
                `Goal: ${goal}`,
                `Candidate thought: ${thought}`,
            ].join('\n\n');
            return this._evaluate([
                { role: 'system', content: this._evaluationPrompt },
                { role: 'user',   content: evalMsg },
            ])
                .then((raw) => this._parseScore(raw))
                .catch(() => 0);
        });

        const scores = await Promise.all(evalPromises);

        return candidates
            .map((thought, i): TotNode | null => {
                if (!thought) return null;
                return {
                    thought,
                    depth,
                    score:       scores[i] ?? 0,
                    parentIndex: -1,   // caller fills in the real parent
                };
            })
            .filter((n): n is TotNode => n !== null);
    }

    /** Walk parent pointers to build a readable chain of ancestor thoughts. */
    private _ancestryChain(nodes: TotNode[], leafIdx: number): string {
        const chain: string[] = [];
        let idx = leafIdx;
        while (idx >= 0) {
            const node = nodes[idx];
            if (!node) break;
            chain.unshift(node.thought);
            idx = node.parentIndex;
        }
        return chain.join('\n');
    }

    /** Extract a 0–1 float from the evaluator's raw output. */
    private _parseScore(raw: string): number {
        // Try JSON `{ "score": 0.8 }` form first
        try {
            const json = JSON.parse(raw.trim()) as { score?: unknown };
            const s = Number(json.score);
            if (!isNaN(s)) return Math.max(0, Math.min(1, s));
        } catch {
            // ignore parse error — fall through to regex
        }

        // Fall back to first float in the string
        const match = /([0-9]*\.?[0-9]+)/.exec(raw);
        if (match) {
            const s = parseFloat(match[1]!);
            return Math.max(0, Math.min(1, s));
        }
        return 0.5; // neutral fallback
    }
}
