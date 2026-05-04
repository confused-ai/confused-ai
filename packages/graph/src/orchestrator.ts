/**
 * Multi-Agent Orchestration Layer
 *
 * Coordinates multiple agents working on the same graph or across graphs.
 * Supports several orchestration patterns:
 *
 * 1. Supervisor: One agent directs others
 * 2. Peer-to-Peer: Agents communicate directly
 * 3. Pipeline: Agents process sequentially
 * 4. Consensus: Agents vote on decisions
 * 5. Competitive: Agents race, best result wins
 *
 * Design: Agents are just graph nodes with LLM capabilities.
 * The orchestrator manages message passing and result aggregation.
 */

import {
  type GraphDef,
  type GraphPlugin,
  type LLMProvider,
  type LLMMessage,
  type LLMOptions,
  type LLMToolDef,
  type ToolDef,
  type NodeContext,
} from './types.js';

import { DAGEngine, type ExecutionResult } from './engine.js';

// ── Agent Definition ────────────────────────────────────────────────────────

export interface AgentDef {
  /** Unique agent name */
  name: string;
  /** Agent's role description */
  description?: string;
  /** System prompt / instructions */
  instructions: string;
  /** LLM provider to use */
  llm: LLMProvider;
  /** Available tools */
  tools?: ToolDef[];
  /** LLM options */
  llmOptions?: LLMOptions;
  /** Max ReAct steps */
  maxSteps?: number;
  /** Temperature */
  temperature?: number;
  /** Model override */
  model?: string;
}

// ── Agent Runtime ───────────────────────────────────────────────────────────

/**
 * Lightweight ReAct agent runtime.
 * Runs: LLM → tool calls → results → repeat until done.
 */
export class AgentRuntime {
  private agent: AgentDef;
  private messages: LLMMessage[] = [];
  private toolMap: Map<string, ToolDef> = new Map();

  constructor(agent: AgentDef) {
    this.agent = agent;
    for (const tool of agent.tools ?? []) {
      this.toolMap.set(tool.name, tool);
    }
  }

  async run(prompt: string, options?: {
    maxSteps?: number;
    signal?: AbortSignal;
    onStep?: (step: AgentStep) => void;
  }): Promise<AgentResult> {
    const maxSteps = options?.maxSteps ?? this.agent.maxSteps ?? 10;
    const steps: AgentStep[] = [];

    // Build system message
    this.messages = [
      { role: 'system', content: this.agent.instructions },
      { role: 'user', content: prompt },
    ];

    // Build tool definitions for LLM
    const toolDefs: LLMToolDef[] = (this.agent.tools ?? []).map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const llmOptions: LLMOptions = {
      ...this.agent.llmOptions,
      model: this.agent.model,
      temperature: this.agent.temperature,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
    };

    for (let step = 0; step < maxSteps; step++) {
      if (options?.signal?.aborted) {
        return { text: '', steps, finishReason: 'cancelled', messages: this.messages };
      }

      // Call LLM
      const response = await this.agent.llm.generate(this.messages, llmOptions);

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const stepInfo: AgentStep = {
          step,
          type: 'response',
          text: response.content,
          usage: response.usage,
        };
        steps.push(stepInfo);
        options?.onStep?.(stepInfo);

        this.messages.push({ role: 'assistant', content: response.content });

        return {
          text: response.content,
          steps,
          finishReason: 'stop',
          messages: this.messages,
          usage: response.usage,
        };
      }

      // Process tool calls
      this.messages.push({
        role: 'assistant',
        content: response.content ?? '',
        toolCalls: response.toolCalls,
      });

      const toolResults: ToolCallResult[] = [];

      for (const tc of response.toolCalls) {
        const tool = this.toolMap.get(tc.function.name);
        if (!tool) {
          const errorResult = `Tool "${tc.function.name}" not found`;
          this.messages.push({
            role: 'tool',
            content: errorResult,
            toolCallId: tc.id,
          });
          toolResults.push({ name: tc.function.name, error: errorResult });
          continue;
        }

        try {
          const args = JSON.parse(tc.function.arguments);
          const result = await tool.execute(args);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

          this.messages.push({
            role: 'tool',
            content: resultStr,
            toolCallId: tc.id,
          });
          toolResults.push({ name: tc.function.name, result, args });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.messages.push({
            role: 'tool',
            content: `Error: ${errorMsg}`,
            toolCallId: tc.id,
          });
          toolResults.push({ name: tc.function.name, error: errorMsg, args: tc.function.arguments });
        }
      }

      const stepInfo: AgentStep = {
        step,
        type: 'tool_use',
        toolCalls: toolResults,
        usage: response.usage,
      };
      steps.push(stepInfo);
      options?.onStep?.(stepInfo);
    }

    // Max steps reached
    return {
      text: this.messages[this.messages.length - 1]?.content ?? '',
      steps,
      finishReason: 'max_steps',
      messages: this.messages,
    };
  }

  /** Get conversation history */
  getMessages(): readonly LLMMessage[] {
    return this.messages;
  }
}

export interface AgentStep {
  step: number;
  type: 'response' | 'tool_use';
  text?: string;
  toolCalls?: ToolCallResult[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ToolCallResult {
  name: string;
  args?: unknown;
  result?: unknown;
  error?: string;
}

export interface AgentResult {
  text: string;
  steps: AgentStep[];
  finishReason: 'stop' | 'max_steps' | 'cancelled' | 'error';
  messages: LLMMessage[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ── Multi-Agent Orchestrator ────────────────────────────────────────────────

/**
 * Message passed between agents.
 */
export interface AgentMessage {
  from: string;
  to: string;
  content: string;
  type: 'request' | 'response' | 'broadcast' | 'delegation';
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Orchestrator manages multiple agents working together.
 */
export class MultiAgentOrchestrator {
  private agents: Map<string, AgentDef> = new Map();
  private runtimes: Map<string, AgentRuntime> = new Map();
  private messageLog: AgentMessage[] = [];
  private plugins: GraphPlugin[] = [];

  constructor(options?: { plugins?: GraphPlugin[] }) {
    this.plugins = options?.plugins ?? [];
  }

  /**
   * Register an agent with the orchestrator.
   */
  addAgent(agent: AgentDef): this {
    this.agents.set(agent.name, agent);
    this.runtimes.set(agent.name, new AgentRuntime(agent));
    return this;
  }

  /**
   * Supervisor pattern: One agent directs the work, delegates to others.
   */
  async runSupervisor(options: {
    supervisor: string;
    workers: string[];
    task: string;
    maxRounds?: number;
  }): Promise<OrchestratorResult> {
    const maxRounds = options.maxRounds ?? 5;
    const results: Record<string, AgentResult> = {};
    const rounds: OrchestratorRound[] = [];

    const supervisorDef = this.agents.get(options.supervisor);
    if (!supervisorDef) throw new Error(`Supervisor agent "${options.supervisor}" not found`);

    // Enhance supervisor with delegation capability
    const delegateTool: ToolDef = {
      name: 'delegate',
      description: `Delegate a task to a worker agent. Available workers: ${options.workers.join(', ')}`,
      parameters: {
        type: 'object',
        properties: {
          worker: { type: 'string', description: 'Name of the worker agent' },
          task: { type: 'string', description: 'Task to delegate' },
        },
        required: ['worker', 'task'],
      },
      execute: async (input: any) => {
        const workerRuntime = this.runtimes.get(input.worker);
        if (!workerRuntime) return { error: `Worker "${input.worker}" not found` };

        const result = await workerRuntime.run(input.task);
        results[input.worker] = result;

        this._logMessage({
          from: options.supervisor,
          to: input.worker,
          content: input.task,
          type: 'delegation',
        });
        this._logMessage({
          from: input.worker,
          to: options.supervisor,
          content: result.text,
          type: 'response',
        });

        return { worker: input.worker, response: result.text };
      },
    };

    const finishTool: ToolDef = {
      name: 'finish',
      description: 'Indicate that the task is complete and provide the final answer.',
      parameters: {
        type: 'object',
        properties: {
          answer: { type: 'string', description: 'The final answer' },
        },
        required: ['answer'],
      },
      execute: async (input: any) => input.answer,
    };

    // Create enhanced supervisor runtime
    const enhancedSupervisor = new AgentRuntime({
      ...supervisorDef,
      tools: [...(supervisorDef.tools ?? []), delegateTool, finishTool],
    });

    const finalResult = await enhancedSupervisor.run(options.task, { maxSteps: maxRounds * 3 });
    results[options.supervisor] = finalResult;

    return {
      text: finalResult.text,
      agentResults: results,
      messages: this.messageLog,
      rounds,
    };
  }

  /**
   * Pipeline pattern: Agents process in sequence, each receiving the previous output.
   */
  async runPipeline(options: {
    agents: string[];
    input: string;
  }): Promise<OrchestratorResult> {
    const results: Record<string, AgentResult> = {};
    let currentInput = options.input;

    for (const agentName of options.agents) {
      const runtime = this.runtimes.get(agentName);
      if (!runtime) throw new Error(`Agent "${agentName}" not found`);

      const result = await runtime.run(currentInput);
      results[agentName] = result;
      currentInput = result.text;

      this._logMessage({
        from: agentName,
        to: options.agents[options.agents.indexOf(agentName) + 1] ?? 'output',
        content: result.text,
        type: 'response',
      });
    }

    const lastAgent = options.agents[options.agents.length - 1];
    return {
      text: results[lastAgent]?.text ?? '',
      agentResults: results,
      messages: this.messageLog,
      rounds: [],
    };
  }

  /**
   * Consensus pattern: All agents respond, then vote/aggregate.
   */
  async runConsensus(options: {
    agents: string[];
    task: string;
    strategy?: 'majority' | 'best' | 'merge';
    judge?: AgentDef;
  }): Promise<OrchestratorResult> {
    const strategy = options.strategy ?? 'best';
    const results: Record<string, AgentResult> = {};

    // Run all agents in parallel
    const promises = options.agents.map(async (name) => {
      const runtime = this.runtimes.get(name);
      if (!runtime) throw new Error(`Agent "${name}" not found`);
      const result = await runtime.run(options.task);
      results[name] = result;
      return { name, result };
    });

    const agentResults = await Promise.all(promises);

    // Log all responses
    for (const { name, result } of agentResults) {
      this._logMessage({
        from: name,
        to: 'orchestrator',
        content: result.text,
        type: 'response',
      });
    }

    // Aggregate results based on strategy
    let finalText: string;

    switch (strategy) {
      case 'majority': {
        // Simple frequency-based voting
        const votes = new Map<string, number>();
        for (const { result } of agentResults) {
          const key = result.text.trim().toLowerCase();
          votes.set(key, (votes.get(key) ?? 0) + 1);
        }
        const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
        finalText = agentResults.find(r =>
          r.result.text.trim().toLowerCase() === sorted[0]?.[0]
        )?.result.text ?? '';
        break;
      }

      case 'best': {
        if (options.judge) {
          // Use a judge agent to pick the best
          const judgeRuntime = new AgentRuntime(options.judge);
          const judgePrompt = `Given these responses to the task "${options.task}":\n\n` +
            agentResults.map(r => `## ${r.name}\n${r.result.text}`).join('\n\n') +
            '\n\nChoose the best response and explain why. Return only the best response text.';

          const judgeResult = await judgeRuntime.run(judgePrompt);
          finalText = judgeResult.text;
          results['judge'] = judgeResult;
        } else {
          // Without a judge, pick the longest (heuristic)
          const sorted = agentResults.sort((a, b) => b.result.text.length - a.result.text.length);
          finalText = sorted[0]?.result.text ?? '';
        }
        break;
      }

      case 'merge': {
        // Concatenate all responses
        finalText = agentResults.map(r => `## ${r.name}\n${r.result.text}`).join('\n\n');
        break;
      }

      default:
        finalText = agentResults[0]?.result.text ?? '';
    }

    return {
      text: finalText,
      agentResults: results,
      messages: this.messageLog,
      rounds: [],
    };
  }

  /**
   * Competitive pattern: Race agents, return first result.
   */
  async runCompetitive(options: {
    agents: string[];
    task: string;
  }): Promise<OrchestratorResult> {
    const results: Record<string, AgentResult> = {};
    const controller = new AbortController();

    const result = await Promise.race(
      options.agents.map(async (name) => {
        const runtime = this.runtimes.get(name);
        if (!runtime) throw new Error(`Agent "${name}" not found`);
        const result = await runtime.run(options.task, { signal: controller.signal });
        results[name] = result;
        controller.abort(); // Cancel other agents
        return { name, result };
      })
    );

    return {
      text: result.result.text,
      agentResults: results,
      messages: this.messageLog,
      rounds: [],
      winner: result.name,
    };
  }

  /**
   * Graph-based orchestration: Define a custom agent workflow as a DAG.
   */
  async runGraph(options: {
    graph: GraphDef;
    variables?: Record<string, unknown>;
    plugins?: GraphPlugin[];
  }): Promise<ExecutionResult> {
    const engine = new DAGEngine(options.graph);
    return engine.execute({
      variables: options.variables,
      plugins: [...this.plugins, ...(options.plugins ?? [])],
    });
  }

  /** Get all registered agents */
  getAgents(): AgentDef[] {
    return Array.from(this.agents.values());
  }

  /** Get message log */
  getMessageLog(): readonly AgentMessage[] {
    return this.messageLog;
  }

  private _logMessage(msg: Omit<AgentMessage, 'timestamp'>): void {
    this.messageLog.push({ ...msg, timestamp: Date.now() });
  }
}

export interface OrchestratorResult {
  text: string;
  agentResults: Record<string, AgentResult>;
  messages: AgentMessage[];
  rounds: OrchestratorRound[];
  winner?: string;
}

export interface OrchestratorRound {
  round: number;
  agentName: string;
  action: string;
  result: string;
  durationMs: number;
}

// ── Convenience: Create agent-based graph nodes ─────────────────────────────

/**
 * Helper to create a graph node that runs an agent.
 */
export function agentNode(
  _name: string,
  agent: AgentDef,
  options?: { promptTemplate?: (input: unknown) => string }
): { kind: 'task'; execute: (ctx: NodeContext) => Promise<unknown>; description?: string } {
  const runtime = new AgentRuntime(agent);

  return {
    kind: 'task',
    description: agent.description,
    execute: async (ctx: NodeContext) => {
      const prompt = options?.promptTemplate
        ? options.promptTemplate(ctx.input)
        : typeof ctx.input === 'string'
          ? ctx.input
          : JSON.stringify(ctx.input);

      const result = await runtime.run(prompt, { signal: ctx.signal });
      return {
        text: result.text,
        steps: result.steps,
        finishReason: result.finishReason,
      };
    },
  };
}
