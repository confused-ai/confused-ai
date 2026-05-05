/**
 * defineRole — CrewAI-style declarative role builder.
 *
 * Generates a structured system prompt from a role definition and optionally
 * creates a ready-to-run agent via `createAgenticAgent`.
 *
 * @example
 * ```ts
 * import { defineRole } from '@confused-ai/orchestration';
 *
 * const analyst = defineRole({
 *   role: 'Senior Data Analyst',
 *   backstory: 'You have 10 years of experience turning messy datasets into clear insights.',
 *   goal: 'Analyse the provided data and surface the three most actionable findings.',
 *   tools: [sqlTool, chartTool],
 *   llm,
 * });
 *
 * const result = await analyst.run({ prompt: 'Analyse Q3 revenue data' });
 * ```
 */

import type { LLMProvider } from '@confused-ai/core';
import type { ToolProvider } from '@confused-ai/agentic';
import type {
  AgenticLifecycleHooks,
  AgenticRetryPolicy,
  AgenticRunConfig,
  AgenticRunResult,
  AgenticStreamHooks,
} from '@confused-ai/agentic';
import { createAgenticAgent } from '@confused-ai/agentic';
import type { Message } from '@confused-ai/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoleDefinition {
  /**
   * The agent's job title / role name, e.g. `'Senior Research Analyst'`.
   * Used in the generated system prompt and as the agent's `name`.
   */
  role: string;
  /**
   * A short, vivid backstory that sets context, persona, and expertise.
   * Keep it to 2–4 sentences for best results.
   */
  backstory: string;
  /**
   * The specific objective for this agent on the current run.
   * This is included at the end of the system prompt to keep the agent focused.
   */
  goal: string;
  /** LLM provider (required unless you only want the system prompt string). */
  llm?: LLMProvider;
  /** Tools this role has access to. */
  tools?: ToolProvider;
  /** Max ReAct steps. */
  maxSteps?: number;
  /** Timeout in milliseconds. */
  timeoutMs?: number;
  /** Retry policy. */
  retry?: AgenticRetryPolicy;
  /** Lifecycle hooks. */
  hooks?: AgenticLifecycleHooks;
}

/** A role-based agent with a `.run()` method and `.systemPrompt` string. */
export interface RoleAgent {
  /** The role name passed to `defineRole`. */
  readonly name: string;
  /** Generated system prompt (role + backstory + goal). */
  readonly systemPrompt: string;
  /**
   * Run the agent with an input prompt.
   * Throws if `llm` was not provided to `defineRole`.
   */
  run(
    config: Omit<AgenticRunConfig, 'instructions'> & { prompt: string; messages?: Message[] },
    hooks?: AgenticStreamHooks,
  ): Promise<AgenticRunResult>;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Build a system prompt string from a role definition.
 * Usable standalone when you only need the string.
 */
export function buildSystemPrompt(def: Pick<RoleDefinition, 'role' | 'backstory' | 'goal'>): string {
  return [
    `## Role: ${def.role}`,
    '',
    `## Backstory`,
    def.backstory.trim(),
    '',
    `## Goal`,
    def.goal.trim(),
    '',
    '---',
    'Always reason step-by-step. Use tools when needed. Be concise and actionable.',
  ].join('\n');
}

/**
 * Define a role-based agent.
 *
 * When `llm` is provided the returned object has a fully-functional `.run()`.
 * When `llm` is omitted, `.run()` throws with a clear message — useful for
 * building role definitions that are passed to `createTeam` which supplies its
 * own LLM.
 */
export function defineRole(def: RoleDefinition): RoleAgent {
  const systemPrompt = buildSystemPrompt(def);

  let _agent: ReturnType<typeof createAgenticAgent> | null = null;

  function getAgent(): ReturnType<typeof createAgenticAgent> {
    if (!_agent) {
      if (!def.llm) {
        throw new Error(
          `defineRole("${def.role}"): cannot call .run() without an llm. ` +
          `Supply an llm to defineRole, or pass this role to createTeam which provides one.`,
        );
      }
      _agent = createAgenticAgent({
        name: def.role,
        instructions: systemPrompt,
        llm: def.llm,
        tools: def.tools ?? [],
        maxSteps: def.maxSteps,
        timeoutMs: def.timeoutMs,
        retry: def.retry,
        hooks: def.hooks,
      });
    }
    return _agent;
  }

  return {
    name: def.role,
    systemPrompt,
    run(config, hooks) {
      return getAgent().run(
        {
          ...config,
          instructions: systemPrompt,
        },
        hooks,
      );
    },
  };
}
