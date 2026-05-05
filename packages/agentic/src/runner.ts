/**
 * Agentic runner: ReAct-style loop (reason → tool call → observe → repeat)
 *
 * Architecture:
 * - `run()` is the coordinator — delegates to focused private methods (SRP)
 * - `_buildSystemPrompt()` — builds the effective system prompt
 * - `_buildInitialMessages()` — constructs the initial message array
 * - `_restoreCheckpoint()` — resumes a durable run from checkpoint
 * - `_invokeLlm()` — single LLM call with retry + distributed tracing
 * - `_executeAllTools()` — dispatches all tool calls for a step in parallel
 * - `_executeOneTool()` — single tool execution with guardrails + middleware
 *
 * Key invariants:
 * - Per-run lifecycle hooks arrive via `runConfig.hooks` and are merged locally — no
 *   shared config mutation. Concurrent `run()` calls on the same agent are fully isolated.
 * - Tool calls within a step are executed in parallel (Promise.all). Results are collected
 *   in the original call order so the LLM sees a deterministic message history.
 */

import type { Message, ToolCall as LLMToolCall, LLMToolDefinition, GenerateResult } from '@confused-ai/core';
import type { Tool, ToolResult, ToolContext } from './_tool-types.js';
import type {
    AgenticRunConfig,
    AgenticRunResult,
    AgenticRunnerConfig,
    AgenticStreamHooks,
    AgenticRetryPolicy,
    AgenticLifecycleHooks,
} from './types.js';
import type { HumanInTheLoopHooks, GuardrailContext } from './_guardrail-types.js';
import type { GuardrailEngine } from './_guardrail-types.js';
import type { Span } from '@opentelemetry/api';
import { LLMError, ToolNotAuthorizedError } from '@confused-ai/shared';
import { toolToLLMDef } from './_zod-to-schema.js';
import { validateStructuredOutput, buildStructuredOutputPrompt } from './_structured-output.js';
import { withRetry as guardWithRetry, runToolWithTimeout, createDeadline } from '@confused-ai/guard';
import type { RetryPolicy } from '@confused-ai/guard';
import { withSpan, Metrics } from '@confused-ai/observe';
import { ReasoningManager, TreeOfThoughtEngine } from '@confused-ai/reasoning';
import { CompressionManager } from '@confused-ai/compression';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_STEPS = 20;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 1_000;
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

// ── Internal types ────────────────────────────────────────────────────────────

/** Immutable context shared across all helper methods within a single run. */
interface RunContext {
    readonly agentId: string;
    readonly sessionId: string;
    readonly lifecycle: AgenticLifecycleHooks;
    readonly streamHooks: AgenticStreamHooks | undefined;
    readonly toolTimeoutMs: number;
    readonly retry: AgenticRetryPolicy;
    readonly step: number;
    /** Tool allowlist for this run (undefined = no restriction). */
    readonly allowedTools: string[] | undefined;
}

// ── Pure utility functions ────────────────────────────────────────────────────

/** Translate AgenticRetryPolicy → guard RetryPolicy (adds jitter). */
function toGuardRetryPolicy(policy: AgenticRetryPolicy): Partial<RetryPolicy> {
    return {
        maxAttempts: (policy.maxRetries ?? DEFAULT_RETRIES) + 1,
        initialDelayMs: policy.backoffMs ?? DEFAULT_BACKOFF_MS,
        maxDelayMs: policy.maxBackoffMs ?? 30_000,
        multiplier: 2,
        jitter: true,
        retryOn: () => true,
    };
}

/**
 * Merges two lifecycle hook objects. `base` runs first; `override` runs after.
 * Returns `undefined` when both are absent.
 */
function mergeLifecycleHooks(
    base?: AgenticLifecycleHooks,
    override?: AgenticLifecycleHooks,
): AgenticLifecycleHooks | undefined {
    if (!base && !override) return undefined;
    if (!base) return override;
    if (!override) return base;

    return {
        beforeRun: async (prompt, config) => {
            const p = base.beforeRun ? await base.beforeRun(prompt, config) : prompt;
            return override.beforeRun ? override.beforeRun(p, config) : p;
        },
        afterRun: async (result) => {
            const r = base.afterRun ? await base.afterRun(result) : result;
            return override.afterRun ? override.afterRun(r) : r;
        },
        beforeStep: async (step, messages) => {
            const m = base.beforeStep ? await base.beforeStep(step, messages) : messages;
            return override.beforeStep ? override.beforeStep(step, m) : m;
        },
        afterStep: async (step, messages, text) => {
            if (base.afterStep) await base.afterStep(step, messages, text);
            if (override.afterStep) await override.afterStep(step, messages, text);
        },
        beforeToolCall: async (name, args, step) => {
            const a = base.beforeToolCall ? await base.beforeToolCall(name, args, step) : args;
            return override.beforeToolCall ? override.beforeToolCall(name, a, step) : a;
        },
        afterToolCall: async (name, result, args, step) => {
            const r = base.afterToolCall ? await base.afterToolCall(name, result, args, step) : result;
            return override.afterToolCall ? override.afterToolCall(name, r, args, step) : r;
        },
        buildSystemPrompt: base.buildSystemPrompt ?? override.buildSystemPrompt,
        onError: async (err, step) => {
            if (base.onError) await base.onError(err, step);
            if (override.onError) await override.onError(err, step);
        },
    };
}

// ── AgenticRunner ─────────────────────────────────────────────────────────────

/**
 * AgenticRunner implements a ReAct-style reasoning loop:
 *   LLM generates → tool calls dispatched in parallel → results fed back → repeat
 *
 * Concurrent runs are fully isolated — no shared mutable state between calls.
 */
export class AgenticRunner {
    private readonly config: AgenticRunnerConfig;
    private humanInTheLoop?: HumanInTheLoopHooks;
    private guardrails?: GuardrailEngine;
    /** Zod → JSON Schema computed once at construction; tools are immutable after creation. */
    private readonly _cachedLlmTools: LLMToolDefinition[];
    /** Optional reasoning manager (CoT) — created lazily when strategy is 'cot' or 'react'. */
    private _reasoningManager?: ReasoningManager;
    /** Optional ToT engine — created lazily when strategy is 'tot'. */
    private _totEngine?: TreeOfThoughtEngine;
    /** Optional compression manager — created lazily when compression is enabled. */
    private _compressionManager?: CompressionManager;

    constructor(config: AgenticRunnerConfig) {
        this.config = { ...config, toolMiddleware: config.toolMiddleware ?? [] };
        this._cachedLlmTools = config.tools.list().map((t) => toolToLLMDef(t));
        if (config.guardrails) this.guardrails = config.guardrails;
    }

    setHumanInTheLoop(hooks: HumanInTheLoopHooks): void {
        this.humanInTheLoop = hooks;
    }

    setGuardrails(engine: GuardrailEngine): void {
        this.guardrails = engine;
    }

    /**
     * Execute the agentic loop.
     *
     * Per-run lifecycle hooks in `runConfig.hooks` are merged with the agent-level hooks at
     * call time. No shared state is mutated, so concurrent invocations are fully isolated.
     */
    async run(runConfig: AgenticRunConfig, streamHooks?: AgenticStreamHooks): Promise<AgenticRunResult> {
        const lifecycle = mergeLifecycleHooks(this.config.hooks, runConfig.hooks) ?? {};

        return withSpan(
            'agent.loop',
            {
                'agent.id': this.config.agentId ?? 'agent',
                'session.id': this.config.sessionId ?? 'unknown',
                'prompt.length': runConfig.prompt.length,
            },
            (span) => this._runCore(runConfig, streamHooks, lifecycle, span),
        );
    }

    // ── Private: core loop ────────────────────────────────────────────────────

    private async _runCore(
        runConfig: AgenticRunConfig,
        streamHooks: AgenticStreamHooks | undefined,
        lifecycle: AgenticLifecycleHooks,
        span: Span,
    ): Promise<AgenticRunResult> {
        const maxSteps  = runConfig.maxSteps  ?? this.config.maxSteps  ?? DEFAULT_MAX_STEPS;
        const timeoutMs = runConfig.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const retry     = this.config.retry   ?? { maxRetries: DEFAULT_RETRIES, backoffMs: DEFAULT_BACKOFF_MS };
        const agentId   = this.config.agentId  ?? 'agent';
        const sessionId = this.config.sessionId ?? `session-${Date.now()}`;

        const prompt = lifecycle.beforeRun
            ? await lifecycle.beforeRun(runConfig.prompt, runConfig)
            : runConfig.prompt;

        // ── Input guardrail check — runs BEFORE the LLM loop ─────────────────
        if (this.guardrails) {
            const inputCtx: GuardrailContext = { agentId, sessionId, output: prompt };
            const inputResults = await this.guardrails.checkAll(inputCtx);
            const inputViolations = this.guardrails.getViolations(inputResults);
            if (inputViolations.length > 0) {
                span.setStatus?.({ code: 2 /* ERROR */ });
                return this._blockedResult(prompt, agentId, sessionId, runConfig);
            }
        }

        const systemPrompt = await this._buildSystemPrompt(runConfig, lifecycle);
        let messages = this._buildInitialMessages(runConfig, systemPrompt, prompt);

        const checkpointStore = this.config.checkpointStore;
        const runId = runConfig.runId;
        let steps = 0;
        if (checkpointStore && runId) {
            ({ messages, steps } = await this._restoreCheckpoint(checkpointStore, runId, messages, steps));
        }

        // ── Pre-run reasoning enrichment ──────────────────────────────────────
        // Only run on a fresh session (no checkpoint restore) to avoid double-enrichment.
        if (steps === 0 && this.config.reasoning?.enabled) {
            const enriched = await this._applyReasoning(prompt, systemPrompt);
            if (enriched) {
                // Inject as an extra assistant message so the LLM sees its own chain-of-thought
                messages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user',   content: prompt },
                    { role: 'assistant', content: `[Reasoning]\n${enriched}` },
                ];
            }
        }

        const baseCtx: Omit<RunContext, 'step'> = {
            agentId, sessionId, lifecycle, streamHooks,
            toolTimeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
            retry,
            allowedTools: runConfig.allowedTools,
        };

        let lastText = '';
        let usage: AgenticRunResult['usage'];
        let finishReason: AgenticRunResult['finishReason'] = 'stop';
        const startTime = Date.now();
        const deadline   = createDeadline(timeoutMs, 'agent.run');

        // ── ReAct loop ────────────────────────────────────────────────────────
        while (steps < maxSteps) {
            if (runConfig.signal?.aborted) { finishReason = 'aborted'; break; }
            if (deadline.expired())         { finishReason = 'timeout'; break; }

            steps++;
            streamHooks?.onStep?.(steps);

            if (lifecycle.beforeStep) {
                messages = await lifecycle.beforeStep(steps, messages);
            }

            // ── LLM call ──────────────────────────────────────────────────
            let result: GenerateResult;
            try {
                result = await this._invokeLlm(messages, { ...baseCtx, step: steps });
            } catch (err) {
                finishReason = 'error';
                const error = err instanceof Error ? err : new Error(String(err));
                await lifecycle.onError?.(error, steps);
                throw err instanceof LLMError ? err : new LLMError(error.message, { cause: error });
            }

            // ── Process LLM output ────────────────────────────────────────
            lastText = result.text ?? '';
            if (result.usage) {
                usage = { ...result.usage };
                this.config.budgetEnforcer?.addStepCost(
                    this.config.budgetModelId ?? 'gpt-4o',
                    result.usage.promptTokens ?? 0,
                    result.usage.completionTokens ?? 0,
                );
                // Record context window utilization when contextWindowSize is configured.
                const promptTokens = result.usage.promptTokens;
                const cwSize = this.config.contextWindowSize;
                if (promptTokens !== undefined && cwSize !== undefined && cwSize > 0) {
                    Metrics.contextWindowUtilization.record(
                        promptTokens / cwSize,
                        { agent_name: agentId, model: this.config.budgetModelId ?? 'unknown' },
                    );
                }
            }

            if (result.text) {
                messages.push({ role: 'assistant', content: result.text });
                const isStreaming = !!streamHooks?.onChunk && !!this.config.llm.streamText;
                if (!isStreaming) streamHooks?.onChunk?.(result.text);
            }

            if (lifecycle.afterStep) {
                await lifecycle.afterStep(steps, messages, lastText);
            }

            // ── Terminal state: no tool calls = final answer ───────────────
            if (!result.toolCalls?.length) {
                const guardrailCtx: GuardrailContext = { agentId, sessionId, output: lastText };
                if (this.humanInTheLoop?.beforeFinish) {
                    const approved = await this.humanInTheLoop.beforeFinish(lastText, guardrailCtx);
                    if (!approved) { finishReason = 'human_rejected'; break; }
                }
                finishReason = 'stop';
                break;
            }

            // ── Tool dispatch (parallel) ───────────────────────────────────
            messages.push({
                role: 'assistant',
                content: result.text || '',
                toolCalls: result.toolCalls,
            } as Message & { toolCalls: LLMToolCall[] });

            const toolMessages = await this._executeAllTools(result.toolCalls, { ...baseCtx, step: steps });
            messages.push(...toolMessages);

            // ── Auto context compression ───────────────────────────────────
            if (this.config.compression?.enabled) {
                await this._maybeCompress(messages);
            }

            if (steps >= maxSteps) finishReason = 'max_steps';

            if (checkpointStore && runId && finishReason !== 'max_steps') {
                await this._saveCheckpoint(checkpointStore, runId, steps, messages, runConfig, startTime);
            }
        }

        // ── Post-loop: structured output, hooks, budget, cleanup ─────────────
        const structuredOutput = await this._validateStructuredOutput(runConfig, lastText);

        let finalResult: AgenticRunResult = {
            text: lastText,
            markdown: {
                name: `response-${runConfig.runId ?? Date.now()}.md`,
                content: lastText,
                mimeType: 'text/markdown' as const,
                type: 'markdown' as const,
            },
            messages,
            steps,
            finishReason,
            usage,
            ...(runConfig.runId    && { runId:    runConfig.runId }),
            ...(runConfig.traceId  && { traceId:  runConfig.traceId }),
            ...(structuredOutput !== undefined && { structuredOutput }),
        } as AgenticRunResult;

        if (lifecycle.afterRun) {
            finalResult = await lifecycle.afterRun(finalResult);
        }

        if (this.config.budgetEnforcer) {
            await this.config.budgetEnforcer.recordAndCheck(runConfig.userId);
        }

        if (checkpointStore && runId && (finishReason === 'stop' || finishReason === 'max_steps')) {
            await checkpointStore.delete(runId).catch(() => { /* ignore cleanup errors */ });
        }

        span.setAttribute('agent.steps', steps);
        span.setAttribute('agent.finish_reason', finishReason);
        if (usage?.totalTokens !== undefined) {
            span.setAttribute('llm.usage.total_tokens', usage.totalTokens);
        }

        return finalResult;
    }

    // ── Private: reasoning pre-pass ──────────────────────────────────────────

    /**
     * Runs a CoT or ToT reasoning pass and returns the enriched reasoning text
     * to prepend to the conversation. Returns `undefined` if reasoning yields nothing.
     */
    private async _applyReasoning(prompt: string, systemPrompt: string): Promise<string | undefined> {
        const cfg = this.config.reasoning!;
        const strategy = cfg.strategy ?? 'cot';
        const maxSteps  = cfg.maxSteps ?? 6;

        // Build a lightweight generate fn that delegates to the runner's LLM
        const generate = async (msgs: Array<{ role: string; content: string }>): Promise<string> => {
            const result = await this.config.llm.generateText(msgs as Message[]);
            return result.text ?? '';
        };

        if (strategy === 'tot') {
            if (!this._totEngine) {
                this._totEngine = new TreeOfThoughtEngine({
                    generate,
                    beamWidth: cfg.beamWidth ?? 3,
                    maxDepth:  maxSteps,
                });
            }
            const result = await this._totEngine.solve(prompt, systemPrompt).catch(() => null);
            if (!result) return undefined;
            // Summarise the best branch as a reasoning preamble
            return result.nodes
                .filter((n) => n.score > 0.3)
                .map((n, i) => `Thought ${i + 1} (score=${n.score.toFixed(2)}): ${n.thought}`)
                .join('\n');
        }

        // CoT (default) and 'react' both use ReasoningManager
        if (!this._reasoningManager) {
            this._reasoningManager = new ReasoningManager({ generate, maxSteps });
        }
        const result = await this._reasoningManager.run([{ role: 'user', content: prompt }]).catch(() => null);
        if (!result?.steps.length) return undefined;
        return result.steps
            .map((s, i) =>
                `Step ${i + 1}${s.title ? ` — ${s.title}` : ''}: ${s.result ?? s.action ?? ''}`,
            )
            .join('\n');
    }

    // ── Private: context compression ─────────────────────────────────────────

    /**
     * Lazily instantiates `CompressionManager` and compresses messages in-place
     * when the message list grows beyond the configured thresholds.
     */
    private async _maybeCompress(messages: Message[]): Promise<void> {
        if (!this._compressionManager) {
            const generate = async (msgs: Array<{ role: string; content: string }>): Promise<string> => {
                const result = await this.config.llm.generateText(msgs as Message[]);
                return result.text ?? '';
            };
            const cfg = this.config.compression!;
            // messageSizeThreshold is in chars; CompressionManager works in estimated tokens (chars/4)
            const tokenLimit = Math.ceil((cfg.messageSizeThreshold ?? 2000) / 4);
            this._compressionManager = new CompressionManager({
                generate,
                compressToolResults:      true,
                compressToolResultsLimit: cfg.toolResultsLimit ?? 3,
                compressTokenLimit:       tokenLimit,
            });
        }

        // CompressibleMessage is structurally compatible with Message (same role/content shape)
        type CM = Parameters<CompressionManager['shouldCompress']>[0];
        const compressible = messages as unknown as CM;
        if (this._compressionManager.shouldCompress(compressible)) {
            await this._compressionManager.acompress(compressible);
        }
    }

    // ── Private: system prompt ────────────────────────────────────────────────

    private async _buildSystemPrompt(
        runConfig: AgenticRunConfig,
        lifecycle: AgenticLifecycleHooks,
    ): Promise<string> {
        if (lifecycle.buildSystemPrompt) {
            return lifecycle.buildSystemPrompt(runConfig.instructions, runConfig.ragContext);
        }

        let prompt = runConfig.instructions;
        if (runConfig.ragContext) {
            prompt += `\n\n[Knowledge Base Context]\n${runConfig.ragContext}`;
        }
        if (runConfig.responseModel) {
            prompt += `\n\n${buildStructuredOutputPrompt({ schema: runConfig.responseModel })}`;
        }
        return prompt;
    }

    // ── Private: message construction ────────────────────────────────────────

    private _buildInitialMessages(
        runConfig: AgenticRunConfig,
        systemPrompt: string,
        prompt: string,
    ): Message[] {
        if (runConfig.messages?.length) {
            return [...runConfig.messages];
        }
        return [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: prompt },
        ];
    }

    // ── Private: checkpoint ───────────────────────────────────────────────────

    private async _restoreCheckpoint(
        store: NonNullable<AgenticRunnerConfig['checkpointStore']>,
        runId: string,
        initialMessages: Message[],
        initialSteps: number,
    ): Promise<{ messages: Message[]; steps: number }> {
        const checkpoint = await store.load(runId);
        if (!checkpoint) return { messages: initialMessages, steps: initialSteps };
        return {
            messages: [...checkpoint.state.messages],
            steps: checkpoint.step,
        };
    }

    private async _saveCheckpoint(
        store: NonNullable<AgenticRunnerConfig['checkpointStore']>,
        runId: string,
        steps: number,
        messages: Message[],
        runConfig: AgenticRunConfig,
        startTime: number,
    ): Promise<void> {
        const agentName = this.config.agentId ?? 'agent';
        await store.save(runId, steps, {
            messages: [...messages],
            step: steps,
            agentName,
            prompt: runConfig.prompt,
            startedAt: new Date(startTime).toISOString(),
            checkpointAt: new Date().toISOString(),
        });
    }

    // ── Private: LLM call ─────────────────────────────────────────────────────

    private _invokeLlm(messages: Message[], ctx: RunContext): Promise<GenerateResult> {
        const llmTools = this._cachedLlmTools;
        const useStreaming = !!ctx.streamHooks?.onChunk && !!this.config.llm.streamText;

        return withSpan(
            'llm.generate',
            { 'agent.step': ctx.step, 'llm.stream': useStreaming },
            () => guardWithRetry(
                () => {
                    if (useStreaming) {
                        return this.config.llm.streamText!(messages, {
                            temperature: 0.7,
                            maxTokens: 4096,
                            tools: llmTools.length ? llmTools : undefined,
                            toolChoice: llmTools.length ? 'auto' : 'none',
                            // streamText onChunk receives typed StreamDelta; forward text parts to string onChunk
                            onChunk: (chunk: string | { type: string; text: string }) => {
                                const text = typeof chunk === 'string' ? chunk : chunk.text;
                                ctx.streamHooks!.onChunk!(text);
                            },
                        });
                    }
                    return this.config.llm.generateText(messages, {
                        temperature: 0.7,
                        maxTokens: 4096,
                        tools: llmTools.length ? llmTools : undefined,
                        toolChoice: llmTools.length ? 'auto' : 'none',
                    });
                },
                toGuardRetryPolicy(ctx.retry),
            ),
        );
    }

    // ── Private: tool dispatch ────────────────────────────────────────────────

    private _executeAllTools(toolCalls: LLMToolCall[], ctx: RunContext): Promise<Message[]> {
        return Promise.all(toolCalls.map((tc) => this._executeOneTool(tc, ctx)));
    }

    private async _executeOneTool(tc: LLMToolCall, ctx: RunContext): Promise<Message> {
        const { agentId, sessionId, lifecycle, streamHooks, toolTimeoutMs, step } = ctx;

        const tool = this.config.tools.getByName(tc.name);
        if (!tool) {
            return this._toolErrorMessage(tc.id, `Unknown tool: ${tc.name}`);
        }

        // Tool authorization: if allowedTools is set, reject tools not in the list.
        if (ctx.allowedTools !== undefined && !ctx.allowedTools.includes(tc.name)) {
            throw new ToolNotAuthorizedError(tc.name);
        }

        const guardrailCtx: GuardrailContext = {
            agentId, sessionId, toolName: tc.name, toolArgs: tc.arguments,
        };

        if (this.guardrails) {
            const blocked = await this._checkInputGuardrails(tc, guardrailCtx);
            if (blocked) return blocked;
        }

        if (this.humanInTheLoop?.beforeToolCall) {
            const approved = await this.humanInTheLoop.beforeToolCall(tc.name, tc.arguments, guardrailCtx);
            if (!approved) return this._toolErrorMessage(tc.id, 'Tool call rejected by human');
        }

        const effectiveArgs = lifecycle.beforeToolCall
            ? await lifecycle.beforeToolCall(tc.name, tc.arguments, step)
            : tc.arguments;

        streamHooks?.onToolCall?.(tc.name, effectiveArgs);

        const toolContext = this._buildToolContext(tool, agentId, sessionId);
        const middleware = this.config.toolMiddleware!;

        for (const m of middleware) {
            if (m.beforeExecute) await m.beforeExecute(tool, effectiveArgs, toolContext);
        }

        let toolResult: unknown;
        let toolResultObj: ToolResult<unknown> | undefined;
        const _toolStart = Date.now();
        try {
            const out = await withSpan(
                'tool.call',
                { 'tool.name': tc.name, 'agent.step': step },
                () => runToolWithTimeout(
                    () => tool.execute(effectiveArgs as Record<string, unknown>, toolContext),
                    toolTimeoutMs,
                    tc.name,
                ),
            );
            Metrics.toolDurationMs.record(Date.now() - _toolStart, {
                tool_name: tc.name, agent_name: agentId,
            });
            toolResultObj = out;
            toolResult = out.success ? out.data : (out.error ? { error: out.error.message } : out);
        } catch (err) {
            Metrics.toolDurationMs.record(Date.now() - _toolStart, {
                tool_name: tc.name, agent_name: agentId,
            });
            const error = err instanceof Error ? err : new Error(String(err));
            for (const m of middleware) {
                if (m.onError) await m.onError(tool, error, toolContext);
            }
            await lifecycle.onError?.(error, step);
            return this._toolErrorMessage(tc.id, error.message);
        }

        if (toolResultObj !== undefined) {
            for (const m of middleware) {
                if (m.afterExecute) await m.afterExecute(tool, toolResultObj, toolContext);
            }
        }

        if (lifecycle.afterToolCall) {
            toolResult = await lifecycle.afterToolCall(tc.name, toolResult, effectiveArgs, step);
        }

        if (this.guardrails && toolResult !== undefined) {
            toolResult = await this._checkOutputGuardrails(toolResult, guardrailCtx);
        }

        streamHooks?.onToolResult?.(tc.name, toolResult);

        const content = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
        return { role: 'tool', content, toolCallId: tc.id } as Message & { toolCallId: string };
    }

    // ── Private: guardrail helpers ────────────────────────────────────────────

    private async _checkInputGuardrails(
        tc: LLMToolCall,
        ctx: GuardrailContext,
    ): Promise<(Message & { toolCallId: string }) | null> {
        const results = await this.guardrails!.checkToolCall(tc.name, tc.arguments, ctx);
        const violations = this.guardrails!.getViolations(results);
        if (!violations.length) return null;

        const msg = `Guardrail violation: ${violations.map((v) => v.message).join(', ')}`;
        if (this.humanInTheLoop?.onViolation) {
            for (const v of violations) await this.humanInTheLoop.onViolation(v, ctx);
        }
        return this._toolErrorMessage(tc.id, msg);
    }

    private async _checkOutputGuardrails(result: unknown, ctx: GuardrailContext): Promise<unknown> {
        const outputCtx: GuardrailContext = { ...ctx, output: result };
        const results = await this.guardrails!.validateOutput(result, outputCtx);
        const violations = this.guardrails!.getViolations(results);
        if (!violations.length) return result;

        const msg = `Output guardrail violation: ${violations.map((v) => v.message).join(', ')}`;
        if (this.humanInTheLoop?.onViolation) {
            for (const v of violations) await this.humanInTheLoop.onViolation(v, outputCtx);
        }
        return { error: msg };
    }

    // ── Private: structured output ────────────────────────────────────────────

    private async _validateStructuredOutput(
        runConfig: AgenticRunConfig,
        text: string,
    ): Promise<unknown> {
        if (!runConfig.responseModel || !text) return undefined;

        const validation = validateStructuredOutput(text, {
            schema: runConfig.responseModel,
            strict: true,
        });

        if (validation.validated) return validation.data;
        if (validation.errors.length > 0) {
            console.warn('[AgenticRunner] Structured output validation failed:', validation.errors);
        }
        return undefined;
    }

    // ── Private: small builders ───────────────────────────────────────────────

    private _buildToolContext(
        tool: Tool,
        agentId: string,
        sessionId: string,
    ): ToolContext {
        return {
            toolId: tool.id,
            agentId,
            sessionId,
            timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
            permissions: tool.permissions,
        };
    }

    private _toolErrorMessage(toolCallId: string, message: string): Message & { toolCallId: string } {
        return {
            role: 'tool',
            content: JSON.stringify({ error: message }),
            toolCallId,
        } as Message & { toolCallId: string };
    }

    /** Construct a short-circuit AgenticRunResult for a blocked (guardrail-rejected) input. */
    private _blockedResult(
        prompt: string,
        agentId: string,
        sessionId: string,
        runConfig: AgenticRunConfig,
    ): AgenticRunResult {
        const runName = `response-${runConfig.runId ?? Date.now()}.md`;
        return {
            text: '',
            markdown: { name: runName, content: '', mimeType: 'text/markdown', type: 'markdown' },
            messages: [{ role: 'user', content: prompt }],
            steps: 0,
            finishReason: 'human_rejected',
            ...(runConfig.runId    && { runId:    runConfig.runId }),
            ...(runConfig.traceId  && { traceId:  runConfig.traceId }),
        };
        void agentId; void sessionId; // referenced for future hook plumbing
    }
}
