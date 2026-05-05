/**
 * createTeam — Ergonomic wrapper over the multi-agent orchestration primitives.
 *
 * Lets developers compose a team of role-defined agents with a single
 * declarative call, choosing a collaboration mode that maps to the underlying
 * `Team`, `AgentSwarm`, and `AgentRouter` implementations.
 *
 * @example
 * ```ts
 * import { createTeam, defineRole } from '@confused-ai/orchestration';
 *
 * const researcher = defineRole({ role: 'Researcher', backstory: '...', goal: '...', llm, tools: [searchTool] });
 * const writer     = defineRole({ role: 'Writer',     backstory: '...', goal: '...', llm });
 * const reviewer   = defineRole({ role: 'Reviewer',   backstory: '...', goal: '...', llm });
 *
 * // Sequential pipeline — researcher → writer → reviewer
 * const team = createTeam({
 *   name: 'ContentTeam',
 *   mode: 'pipeline',
 *   agents: [researcher, writer, reviewer],
 * });
 *
 * const result = await team.run('Write a blog post about TypeScript 5.5');
 * ```
 *
 * Modes:
 *   - `'route'`      — Capability-based routing; best-fit agent handles each task.
 *   - `'coordinate'` — Parallel execution; all agents run simultaneously and results are merged.
 *   - `'collaborate'`— Sequential pipeline; each agent's output feeds the next.
 *   - `'pipeline'`   — Alias for `'collaborate'`.
 */

import type { RoleAgent } from './define-role.js';
import type { TeamResult } from '../multi-agent/team.js';
import { Team } from '../multi-agent/team.js';
import type { AgentRouterConfig, RoutableAgent } from '../multi-agent/router.js';
import { createAgentRouter } from '../multi-agent/router.js';
import type { AgenticRunResult } from '@confused-ai/agentic';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Collaboration modes for `createTeam`. */
export type TeamMode = 'route' | 'coordinate' | 'collaborate' | 'pipeline';

export interface TeamOptions {
  /** Display name for the team. Used in logs. */
  name: string;
  /**
   * How agents collaborate:
   * - `'route'`       — Single best agent handles each task (capability router).
   * - `'coordinate'`  — All agents run in parallel; results are merged.
   * - `'collaborate'` — Sequential pipeline; each agent sees the previous result.
   * - `'pipeline'`    — Alias for `'collaborate'`.
   */
  mode: TeamMode;
  /** Role agents composing the team. */
  agents: RoleAgent[];
  /**
   * Timeout per run in milliseconds.
   * @default 120_000
   */
  timeoutMs?: number;
  /**
   * For `'route'` mode: supply capability tags per agent (index-aligned with `agents`).
   * If omitted, the agent's `name` is used as its single capability tag.
   */
  capabilities?: string[][];
}

/** A runnable team. */
export interface TeamHandle {
  readonly name: string;
  readonly mode: TeamMode;
  /**
   * Run the team.
   *
   * - `'route'`      — Returns the single best agent's result.
   * - `'coordinate'` — Returns merged output from all agents.
   * - `'collaborate'`/ `'pipeline'` — Returns final agent's output.
   */
  run(prompt: string): Promise<TeamRunResult>;
}

export interface TeamRunResult {
  /** Combined / final output text. */
  output: string;
  /** Raw per-agent results (for debugging / auditing). */
  agentResults: Array<{ name: string; output: string; success: boolean }>;
  /** Total wall-clock time (ms). */
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert an `AgenticRunResult` to a plain string. */
function extractText(result: AgenticRunResult): string {
  if (typeof result.output === 'string') return result.output;
  if (result.output && typeof (result.output as { text?: unknown }).text === 'string') {
    return (result.output as { text: string }).text;
  }
  return JSON.stringify(result.output ?? '');
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Build a team and return a simple `{ run }` handle.
 */
export function createTeam(opts: TeamOptions): TeamHandle {
  const { name, mode, agents, timeoutMs = 120_000 } = opts;

  if (agents.length === 0) {
    throw new Error(`createTeam("${name}"): at least one agent is required.`);
  }

  const normalizedMode: TeamMode = mode === 'pipeline' ? 'collaborate' : mode;

  // ── 'route' mode — capability-based router ──────────────────────────────
  if (normalizedMode === 'route') {
    const routerAgents: AgentRouterConfig['agents'] = {};
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const caps = opts.capabilities?.[i] ?? [agent.name.toLowerCase().replace(/\s+/g, '-')];
      routerAgents[agent.name] = {
        agent: {
          id: agent.name,
          name: agent.name,
          run: (input) => agent.run({ prompt: typeof input === 'string' ? input : String(input) }),
        } as RoutableAgent['agent'],
        capabilities: caps,
        description: agent.systemPrompt.slice(0, 200),
      };
    }

    const router = createAgentRouter({
      agents: routerAgents,
      strategy: 'capability-match',
    });

    return {
      name,
      mode,
      async run(prompt) {
        const start = Date.now();
        const result = await router.route(prompt);
        const text = typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? '');
        return {
          output: text,
          agentResults: [{ name: result.agentId ?? 'unknown', output: text, success: true }],
          durationMs: Date.now() - start,
        };
      },
    };
  }

  // ── 'coordinate' (parallel) mode ─────────────────────────────────────────
  if (normalizedMode === 'coordinate') {
    return {
      name,
      mode,
      async run(prompt) {
        const start = Date.now();
        const settled = await Promise.allSettled(
          agents.map((a) => a.run({ prompt })),
        );
        const agentResults = settled.map((s, i) => {
          if (s.status === 'fulfilled') {
            return { name: agents[i].name, output: extractText(s.value), success: true };
          }
          return { name: agents[i].name, output: String((s as PromiseRejectedResult).reason), success: false };
        });
        const output = agentResults
          .filter((r) => r.success)
          .map((r) => `### ${r.name}\n${r.output}`)
          .join('\n\n');
        return { output, agentResults, durationMs: Date.now() - start };
      },
    };
  }

  // ── 'collaborate' (sequential / pipeline) mode ───────────────────────────
  return {
    name,
    mode,
    async run(prompt) {
      const start = Date.now();
      const agentResults: TeamRunResult['agentResults'] = [];
      let currentPrompt = prompt;

      for (const agent of agents) {
        let result: AgenticRunResult;
        try {
          result = await agent.run({ prompt: currentPrompt });
          const text = extractText(result);
          agentResults.push({ name: agent.name, output: text, success: true });
          // Next agent receives both the original task and this agent's output.
          currentPrompt = `Original task: ${prompt}\n\nPrevious output from ${agent.name}:\n${text}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          agentResults.push({ name: agent.name, output: msg, success: false });
          // Continue with last good prompt to keep pipeline moving.
        }
      }

      const lastSuccess = [...agentResults].reverse().find((r) => r.success);
      return {
        output: lastSuccess?.output ?? '',
        agentResults,
        durationMs: Date.now() - start,
      };
    },
  };
}
