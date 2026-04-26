/**
 * Agentic runner: ReAct-style loop (reason → tool call → observe → repeat)
 */

import type { Message, ToolCall as LLMToolCall, LLMToolDefinition, GenerateResult, StreamDelta } from '../providers/types.js';
import type { ToolResult } from '../tools/core/types.js';
import type {
    AgenticRunConfig,
    AgenticRunResult,
    AgenticRunnerConfig,
    AgenticStreamHooks,
    AgenticRetryPolicy,
    AgenticLifecycleHooks,
} from './types.js';
import type { HumanInTheLoopHooks, GuardrailContext } from '../guardrails/types.js';
import type { GuardrailEngine } from '../guardrails/types.js';
import { LLMError } from '../shared/errors.js';
import { toolToLLMDef } from '../providers/zod-to-schema.js';
import { validateStructuredOutput, buildStructuredOutputPrompt } from '../providers/structured-output.js';

const DEFAULT_MAX_STEPS = 10;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 1000;

/**
 * Sleep for backoff
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute with retry
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    policy: AgenticRetryPolicy
): Promise<T> {
    const maxRetries = policy.maxRetries ?? DEFAULT_RETRIES;
    const backoffMs = policy.backoffMs ?? DEFAULT_BACKOFF_MS;
    const maxBackoffMs = policy.maxBackoffMs ?? 30_000;
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt < maxRetries) {
                const delay = Math.min(backoffMs * Math.pow(2, attempt), maxBackoffMs);
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

/**
 * AgenticRunner runs a ReAct-style loop: LLM generates → tool calls → execute tools → feed results → repeat.
 */
export class AgenticRunner {
    private config: AgenticRunnerConfig;
    private humanInTheLoop?: HumanInTheLoopHooks;
    private guardrails?: GuardrailEngine;

    constructor(config: AgenticRunnerConfig) {
        this.config = { ...config, toolMiddleware: config.toolMiddleware ?? [] };
    }

    /**
     * Set human-in-the-loop hooks
     */
    setHumanInTheLoop(hooks: HumanInTheLoopHooks): void {
        this.humanInTheLoop = hooks;
    }

    /**
     * Set guardrail engine
     */
    setGuardrails(engine: GuardrailEngine): void {
        this.guardrails = engine;
    }

    /**
     * Run the agentic loop until the model returns no tool calls or max steps / timeout.
     */
    async run(
        runConfig: AgenticRunConfig,
        hooks?: AgenticStreamHooks
    ): Promise<AgenticRunResult> {
        const maxSteps = runConfig.maxSteps ?? this.config.maxSteps ?? DEFAULT_MAX_STEPS;
        const timeoutMs = runConfig.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const retry = this.config.retry ?? { maxRetries: DEFAULT_RETRIES, backoffMs: DEFAULT_BACKOFF_MS };
        const lifecycle: AgenticLifecycleHooks = this.config.hooks ?? {};

        const tools = this.config.tools.list();
        const llmTools: LLMToolDefinition[] = tools.map((t) => toolToLLMDef(t));

        // ── beforeRun hook ─────────────────────────────────────────────────
        let prompt = runConfig.prompt;
        if (lifecycle.beforeRun) {
            prompt = await lifecycle.beforeRun(prompt, runConfig);
        }

        // ── Build system prompt ────────────────────────────────────────────
        let systemPrompt: string;
        if (lifecycle.buildSystemPrompt) {
            systemPrompt = await lifecycle.buildSystemPrompt(runConfig.instructions, runConfig.ragContext);
        } else {
            systemPrompt = runConfig.instructions;
            if (runConfig.ragContext) {
                systemPrompt += `\n\n[Knowledge Base Context]\n${runConfig.ragContext}`;
            }
            if (runConfig.responseModel) {
                systemPrompt += `\n\n${buildStructuredOutputPrompt({ schema: runConfig.responseModel })}`;
            }
        }

        let messages: Message[] = runConfig.messages?.length
            ? [...runConfig.messages]
            : [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ];

        const startTime = Date.now();
        let steps = 0;
        let lastText = '';
        let usage: AgenticRunResult['usage'];
        let finishReason = 'stop';

        const agentId = this.config.agentId ?? 'agent';
        const sessionId = this.config.sessionId ?? `session-${Date.now()}`;

        // ── Checkpoint resume ──────────────────────────────────────────────
        const checkpointStore = this.config.checkpointStore;
        const runId = runConfig.runId;
        const agentName = this.config.agentId ?? 'agent';

        if (checkpointStore && runId) {
            const checkpoint = await checkpointStore.load(runId);
            if (checkpoint) {
                // Resume from last saved step — skip already-completed work
                messages = [...checkpoint.state.messages];
                steps = checkpoint.step;
            }
        }

        while (steps < maxSteps) {
            // Honour AbortSignal cancellation
            if (runConfig.signal?.aborted) {
                finishReason = 'aborted';
                break;
            }

            if (Date.now() - startTime > timeoutMs) {
                finishReason = 'timeout';
                break;
            }

            steps++;
            hooks?.onStep?.(steps);

            // ── beforeStep hook ────────────────────────────────────────────
            if (lifecycle.beforeStep) {
                messages = await lifecycle.beforeStep(steps, messages);
            }

            let result: GenerateResult;
            const useStreaming = !!hooks?.onChunk && !!this.config.llm.streamText;
            try {
                result = await withRetry(
                    () => {
                        if (useStreaming) {
                            return this.config.llm.streamText!(messages, {
                                temperature: 0.7,
                                maxTokens: 4096,
                                tools: llmTools.length ? llmTools : undefined,
                                toolChoice: llmTools.length ? 'auto' : 'none',
                                onChunk: (delta: StreamDelta) => {
                                    if (delta.type === 'text') {
                                        hooks!.onChunk!(delta.text);
                                    }
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
                    retry
                );
            } catch (err) {
                finishReason = 'error';
                if (lifecycle.onError) {
                    await lifecycle.onError(err instanceof Error ? err : new Error(String(err)), steps);
                }
                throw err instanceof LLMError ? err : new LLMError(err instanceof Error ? err.message : String(err), { cause: err instanceof Error ? err : undefined });
            }

            lastText = result.text ?? '';
            if (result.usage) {
                usage = {
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens,
                };
                // ── Budget step check ──────────────────────────────────────
                if (this.config.budgetEnforcer) {
                    this.config.budgetEnforcer.addStepCost(
                        this.config.budgetModelId ?? 'gpt-4o',
                        result.usage.promptTokens ?? 0,
                        result.usage.completionTokens ?? 0,
                    );
                }
            }

            if (result.text) {
                messages.push({ role: 'assistant', content: result.text });
                // Only fire onChunk for the full text if we didn't use real streaming
                if (!useStreaming) {
                    hooks?.onChunk?.(result.text);
                }
            }

            // ── afterStep hook ─────────────────────────────────────────────
            if (lifecycle.afterStep) {
                await lifecycle.afterStep(steps, messages, lastText);
            }

            if (!result.toolCalls?.length) {
                // Check beforeFinish hook
                const guardrailContext: GuardrailContext = {
                    agentId,
                    sessionId,
                    output: lastText,
                };

                if (this.humanInTheLoop?.beforeFinish) {
                    const approved = await this.humanInTheLoop.beforeFinish(lastText, guardrailContext);
                    if (!approved) {
                        finishReason = 'human_rejected';
                        break;
                    }
                }

                finishReason = 'stop';
                break;
            }

            messages.push({
                role: 'assistant',
                content: result.text || '',
                toolCalls: result.toolCalls,
            } as Message & { toolCalls: LLMToolCall[] });

            for (const tc of result.toolCalls) {
                const tool = this.config.tools.getByName(tc.name);
                if (!tool) {
                    messages.push({
                        role: 'tool',
                        content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
                        toolCallId: tc.id,
                    } as Message & { toolCallId: string });
                    continue;
                }

                // Check guardrails
                const guardrailContext: GuardrailContext = {
                    agentId,
                    sessionId,
                    toolName: tc.name,
                    toolArgs: tc.arguments,
                };

                if (this.guardrails) {
                    const results = await this.guardrails.checkToolCall(tc.name, tc.arguments, guardrailContext);
                    const violations = this.guardrails.getViolations(results);
                    if (violations.length > 0) {
                        const errorMsg = `Guardrail violation: ${violations.map(v => v.message).join(', ')}`;
                        messages.push({
                            role: 'tool',
                            content: JSON.stringify({ error: errorMsg }),
                            toolCallId: tc.id,
                        } as Message & { toolCallId: string });
                        if (this.humanInTheLoop?.onViolation) {
                            for (const v of violations) {
                                await this.humanInTheLoop.onViolation(v, guardrailContext);
                            }
                        }
                        continue;
                    }
                }

                // Check human-in-the-loop before tool call
                if (this.humanInTheLoop?.beforeToolCall) {
                    const approved = await this.humanInTheLoop.beforeToolCall(tc.name, tc.arguments, guardrailContext);
                    if (!approved) {
                        messages.push({
                            role: 'tool',
                            content: JSON.stringify({ error: 'Tool call rejected by human' }),
                            toolCallId: tc.id,
                        } as Message & { toolCallId: string });
                        continue;
                    }
                }

                // ── beforeToolCall lifecycle hook ──────────────────────────
                let effectiveArgs = tc.arguments;
                if (lifecycle.beforeToolCall) {
                    effectiveArgs = await lifecycle.beforeToolCall(tc.name, tc.arguments, steps);
                }

                hooks?.onToolCall?.(tc.name, effectiveArgs);

                const toolContext = {
                    toolId: tool.id,
                    agentId,
                    sessionId,
                    timeoutMs: 30_000,
                    permissions: tool.permissions,
                } as import('../tools/core/types.js').ToolContext;

                // Tool middleware: beforeExecute
                const middleware = this.config.toolMiddleware ?? [];
                for (const m of middleware) {
                    if (m.beforeExecute) await m.beforeExecute(tool, effectiveArgs, toolContext);
                }

                let toolResult: unknown;
                let toolResultObj: ToolResult<unknown> | undefined;
                try {
                    const out = await tool.execute(
                        effectiveArgs as Record<string, unknown>,
                        toolContext
                    );
                    toolResultObj = out;
                    toolResult = out.success ? out.data : (out.error ? { error: out.error.message } : out);
                } catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    for (const m of middleware) {
                        if (m.onError) await m.onError(tool, error, toolContext);
                    }
                    if (lifecycle.onError) await lifecycle.onError(error, steps);
                    toolResult = { error: error.message };
                    // Do not throw: let the agent see the error and continue or respond
                }

                // Tool middleware: afterExecute
                if (toolResultObj !== undefined) {
                    for (const m of middleware) {
                        if (m.afterExecute) await m.afterExecute(tool, toolResultObj, toolContext);
                    }
                }

                // ── afterToolCall lifecycle hook ───────────────────────────
                if (lifecycle.afterToolCall) {
                    toolResult = await lifecycle.afterToolCall(tc.name, toolResult, effectiveArgs, steps);
                }

                // Check output guardrails
                if (this.guardrails && toolResult !== undefined) {
                    const outputContext: GuardrailContext = {
                        ...guardrailContext,
                        output: toolResult,
                    };
                    const results = await this.guardrails.validateOutput(toolResult, outputContext);
                    const violations = this.guardrails.getViolations(results);
                    if (violations.length > 0) {
                        toolResult = { error: `Output guardrail violation: ${violations.map(v => v.message).join(', ')}` };
                        if (this.humanInTheLoop?.onViolation) {
                            for (const v of violations) {
                                await this.humanInTheLoop.onViolation(v, outputContext);
                            }
                        }
                    }
                }

                hooks?.onToolResult?.(tc.name, toolResult);

                const resultContent =
                    typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);

                messages.push({
                    role: 'tool',
                    content: resultContent,
                    toolCallId: tc.id,
                } as Message & { toolCallId: string });
            }

            if (steps >= maxSteps) {
                finishReason = 'max_steps';
            }

            // ── Checkpoint save (after each complete step) ─────────────────
            if (checkpointStore && runId && finishReason !== 'max_steps') {
                await checkpointStore.save(runId, steps, {
                    messages: [...messages],
                    step: steps,
                    agentName,
                    prompt: runConfig.prompt,
                    startedAt: new Date(startTime).toISOString(),
                    checkpointAt: new Date().toISOString(),
                });
            }
        }

        // Validate structured output if responseModel provided
        let structuredOutput: unknown;
        if (runConfig.responseModel && lastText) {
            const validationResult = validateStructuredOutput(lastText, {
                schema: runConfig.responseModel,
                strict: true,
            });
            if (validationResult.validated) {
                structuredOutput = validationResult.data;
            } else if (validationResult.errors.length > 0) {
                // Log validation errors but don't fail - return partial result
                console.warn('Structured output validation failed:', validationResult.errors);
            }
        }

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
            ...(runConfig.runId && { runId: runConfig.runId }),
            ...(runConfig.traceId && { traceId: runConfig.traceId }),
            ...(structuredOutput !== undefined && { structuredOutput }),
        } as AgenticRunResult;

        // ── afterRun hook ──────────────────────────────────────────────────
        if (lifecycle.afterRun) {
            finalResult = await lifecycle.afterRun(finalResult);
        }

        // ── Budget post-run check (user daily + monthly caps) ──────────────
        if (this.config.budgetEnforcer) {
            await this.config.budgetEnforcer.recordAndCheck(runConfig.userId);
        }

        // ── Checkpoint cleanup — delete on successful completion ────────────
        if (checkpointStore && runId && (finishReason === 'stop' || finishReason === 'max_steps')) {
            await checkpointStore.delete(runId).catch(() => {
                /* ignore cleanup errors */
            });
        }

        return finalResult;
    }
}
