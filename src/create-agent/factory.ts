import type { Message } from '../providers/types.js';
import type { AgenticStreamHooks } from '@confused-ai/agentic';
import { withSpan } from '@confused-ai/observe';
import type { ToolProvider } from '@confused-ai/tools';
import { createAgenticAgent } from '@confused-ai/agentic';
import { HttpClientTool } from '@confused-ai/tools';
import { BrowserTool } from '@confused-ai/tools';
import { InMemorySessionStore } from '@confused-ai/session';
import { ConfigError } from '@confused-ai/shared';
import { toToolRegistry } from '@confused-ai/tools';
import { isLightweightTool } from '@confused-ai/tools';
import { createDevLogger, createDevToolMiddleware } from '../dx/dev-logger.js';
import { BudgetEnforcer } from '../production/budget.js';
import type { CreateAgentOptions, CreateAgentResult, AgentRunOptions, StreamChunk } from './types.js';
import type { AdapterRegistry, AdapterBindings } from '../adapters/index.js';
import type { AppConfig } from '@confused-ai/config';
import {
    resolveLlmForCreateAgent,
    ENV_API_KEY,
    ENV_MODEL,
    ENV_BASE_URL,
} from './resolve-llm.js';
import { isMultiModalInput, multiModalToMessage } from '../providers/vision.js';

/**
 * Resolves the tools option to a ToolRegistry.
 * - `false` → empty registry (pure text reasoning)
 * - `[]`    → empty registry
 * - omitted (`undefined`) → default [HttpClientTool, BrowserTool]
 * - array / registry → use as-is; LightweightTool instances are auto-converted
 */
function resolveTools(toolsOption: CreateAgentOptions['tools']): ReturnType<typeof toToolRegistry> {
    if (toolsOption === false) {
        return toToolRegistry([]);
    }
    if (toolsOption === undefined) {
        return toToolRegistry([new HttpClientTool(), new BrowserTool()] as ToolProvider);
    }
    // Auto-convert any LightweightTool (tool() / defineTool()) in the array
    if (Array.isArray(toolsOption)) {
        const normalized = toolsOption.map((t) =>
            isLightweightTool(t) ? t.toFrameworkTool() : t,
        );
        return toToolRegistry(normalized as ToolProvider);
    }
    return toToolRegistry(toolsOption as ToolProvider);
}

/**
 * Determines if `adapters` is an `AdapterRegistry` (has typed resolver methods)
 * or plain `AdapterBindings`.
 */
function isAdapterRegistry(v: AdapterRegistry | AdapterBindings | undefined): v is AdapterRegistry {
    return !!v && typeof (v as AdapterRegistry).resolve === 'function';
}

/**
 * Resolves adapter bindings from either a registry or explicit bindings object,
 * then merges in any convenience adapter fields from `CreateAgentOptions`.
 * Returns `undefined` when nothing is provided (framework uses built-in defaults).
 */
function resolveAdapterBindings(options: CreateAgentOptions): AdapterBindings | undefined {
    const base: AdapterBindings = options.adapters
        ? isAdapterRegistry(options.adapters)
            ? options.adapters.toBindings()
            : (options.adapters as AdapterBindings)
        : {};

    // Merge convenience passthrough fields (explicit fields win over registry auto-select)
    const merged: AdapterBindings = {
        ...base,
        ...(options.sessionStoreAdapter && { sessionStore: options.sessionStoreAdapter }),
        ...(options.memoryStoreAdapter && { memoryStore: options.memoryStoreAdapter }),
        ...(options.guardrailAdapter && { guardrail: options.guardrailAdapter }),
        ...(options.ragAdapter && { rag: options.ragAdapter }),
        ...(options.toolRegistryAdapter && { toolRegistry: options.toolRegistryAdapter }),
        ...(options.authAdapter && { auth: options.authAdapter }),
        ...(options.rateLimitAdapter && { rateLimit: options.rateLimitAdapter }),
        ...(options.auditLogAdapter && { auditLog: options.auditLogAdapter }),
    };

    // Return undefined only if truly empty (nothing configured)
    const isEmpty = Object.values(merged).every((v) => v == null);
    return isEmpty ? undefined : merged;
}

// ── Lazy config singleton ──────────────────────────────────────────────────
// Loaded once on first createAgent call; provides validated fallback defaults.
// Never throws — returns null if config loading fails (e.g. missing env vars).
let _cachedConfig: AppConfig | null | undefined;
function getFrameworkConfig(): AppConfig | null {
    if (_cachedConfig === undefined) {
        try {
            // Dynamic import to avoid circular dependency at module load time
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { loadConfig } = require('@confused-ai/config') as typeof import('@confused-ai/config');
            _cachedConfig = loadConfig();
        } catch {
            _cachedConfig = null;
        }
    }
    return _cachedConfig;
}

/**
 * One-line production agent. Wires LLM (from env or options), tools, session store, and optional guardrails.
 *
 * All defaults are explicitly escapable:
 * - `tools: false`        → pure text reasoning (no tools)
 * - `sessionStore: false` → stateless (no session tracking)
 * - `guardrails: false`   → no guardrails
 * - `hooks`               → intercept every stage of the agentic loop
 */
export function createAgent(options: CreateAgentOptions): CreateAgentResult {
    // Load framework config as fallback (explicit options > env vars > config)
    const cfg = getFrameworkConfig();
    const {
        name,
        instructions,
        model = typeof process !== 'undefined' && process.env?.[ENV_MODEL]
            ? process.env[ENV_MODEL]!
            : (cfg?.llm.model || 'gpt-4o'),
        apiKey = typeof process !== 'undefined' && process.env?.[ENV_API_KEY]
            ? process.env[ENV_API_KEY]
            : (cfg?.llm.apiKey || undefined),
        baseURL = typeof process !== 'undefined' && process.env?.[ENV_BASE_URL]
            ? process.env[ENV_BASE_URL]
            : (cfg?.llm.baseUrl || undefined),
        toolMiddleware,
        guardrails: guardrailsOption = false,
        maxSteps = 10,
        timeoutMs = 60_000,
        retry,
        logger,
        dev,
        hooks: agentHooks,
    } = options;

    if (!name || typeof name !== 'string' || name.trim() === '') {
        throw new ConfigError('createAgent: name is required and must be a non-empty string', {
            context: { options: { name } },
        });
    }
    if (!instructions || typeof instructions !== 'string' || instructions.trim() === '') {
        throw new ConfigError('createAgent: instructions is required and must be a non-empty string', {
            context: { options: { name } },
        });
    }

    const tools = resolveTools(options.tools);

    // Resolve adapter bindings — merges registry / explicit bindings + convenience fields
    const adapterBindings = resolveAdapterBindings(options);

    // sessionStore resolution order:
    //   1. Explicit sessionStore option
    //   2. Adapter binding (cache → session store shim; sql/nosql → future)
    //   3. Auto-SQLite when AGENT_DB_PATH env var is set (durable-default behavior)
    //   4. In-memory default
    const agentDbPath = typeof process !== 'undefined' ? process.env?.['AGENT_DB_PATH'] : undefined;
    const sessionStore =
        options.sessionStore === false
            ? null
            : options.sessionStore
              ? options.sessionStore
              : (adapterBindings?.session as unknown as import('@confused-ai/session').SessionStore | undefined)
                ?? (agentDbPath
                    ? (() => {
                          try {
                              const { createSqliteStore } = require('@confused-ai/session') as typeof import('@confused-ai/session');
                              return createSqliteStore({ path: agentDbPath });
                          } catch {
                              return new InMemorySessionStore();
                          }
                      })()
                    : new InMemorySessionStore());

    const llm = resolveLlmForCreateAgent(options, { model, apiKey, baseURL });

    const guardrails =
        !guardrailsOption
            ? undefined
            : (guardrailsOption as import('@confused-ai/guardrails').GuardrailEngine);

    // Budget enforcer — instantiated once per agent, reset on each run
    const budgetEnforcer = options.budget ? new BudgetEnforcer(options.budget) : undefined;

    const effectiveLogger = logger ?? (dev ? createDevLogger() : undefined);
    const effectiveToolMiddleware = [...(toolMiddleware ?? []), ...(dev ? [createDevToolMiddleware()] : [])];

    if (effectiveLogger?.debug) {
        effectiveLogger.debug('createAgent: initializing', { agentId: name }, { toolsCount: tools.list().length });
    }

    const agent = createAgenticAgent({
        name,
        instructions,
        llm: llm as any,
        tools: tools as any,
        toolMiddleware: effectiveToolMiddleware.length ? effectiveToolMiddleware as any : undefined,
        maxSteps,
        timeoutMs,
        retry,
        guardrails,
        hooks: agentHooks as any,
        checkpointStore: options.checkpointStore,
        knowledgebase: options.knowledgebase as any,
        budgetEnforcer: budgetEnforcer as any,
        budgetModelId: model,
    });

    return {
        name,
        instructions,
        adapters: adapterBindings,
        async run(prompt: string | import('../providers/vision.js').MultiModalInput, runOptions?: AgentRunOptions) {
            return withSpan(
                'agent.run',
                {
                    'agent.name': name,
                    'session.id': runOptions?.sessionId ?? 'unknown',
                    'prompt.length': typeof prompt === 'string' ? prompt.length : prompt.text.length,
                },
                async (runSpan) => {
            // Resolve multi-modal input → text + Message
            const isMMI = isMultiModalInput(prompt);
            const promptText: string = isMMI ? prompt.text : prompt;
            const userMessage: Message = isMMI
                ? multiModalToMessage(prompt)
                : { role: 'user', content: promptText };

            const sessionId = runOptions?.sessionId;
            const streamHooks: AgenticStreamHooks = {
                onChunk: runOptions?.onChunk,
                onToolCall: runOptions?.onToolCall,
                onToolResult: runOptions?.onToolResult,
                onStep: runOptions?.onStep,
            };

            let messages: Message[] | undefined;
            if (runOptions?.messages?.length) {
                messages = [
                    { role: 'system', content: instructions },
                    ...runOptions.messages,
                    userMessage,
                ];
            } else if (sessionId && sessionStore) {
                const session = await sessionStore.get(sessionId);
                const history = session?.messages ?? [];
                messages = [
                    { role: 'system', content: instructions },
                    ...history,
                    userMessage,
                ];
            } else if (isMMI) {
                // Multi-modal without session: build messages array directly
                messages = [
                    { role: 'system', content: instructions },
                    userMessage,
                ];
            }

            // Reset per-run budget accumulator
            budgetEnforcer?.resetRun();

            const ragContext = (options.knowledgebase && options.knowledgebase.buildContext)
                ? await options.knowledgebase.buildContext(promptText)
                : undefined;

            // Per-run hooks are passed via runConfig.hooks — the runner merges them with
            // agent-level hooks locally. No shared config mutation; concurrent runs are isolated.
            const result = await agent.run(
                {
                    prompt: messages ? '' : promptText,
                    instructions,
                    messages,
                    maxSteps,
                    timeoutMs,
                    ragContext,
                    ...(runOptions?.hooks   && { hooks:  runOptions.hooks }),
                    ...(runOptions?.runId   && { runId:  runOptions.runId }),
                    ...(runOptions?.userId  && { userId: runOptions.userId }),
                },
                streamHooks
            );

            if (sessionId && sessionStore && result.messages?.length) {
                const persistMessages = result.messages.filter((m: Message) => m.role !== 'system');
                await sessionStore.update(sessionId, {
                    messages: persistMessages as any,
                });
            }

            if (result.usage?.totalTokens !== undefined) {
                runSpan.setAttribute('llm.usage.total_tokens', result.usage.totalTokens);
            }
            runSpan.setAttribute('agent.finish_reason', result.finishReason ?? 'stop');
            return result;
                }, // end withSpan callback
            ); // end withSpan
        },
        async createSession(userId?: string) {
            if (!sessionStore) {
                throw new ConfigError('createSession: sessionStore is disabled (sessionStore: false). Enable it or pass a store.', {});
            }
            const session = await sessionStore.create({
                agentId: name,
                userId,
                messages: [],
            });
            return session.id;
        },
        getSessionMessages(sessionId: string) {
            if (!sessionStore) {
                throw new ConfigError('getSessionMessages: sessionStore is disabled.', {});
            }
            return sessionStore.getMessages(sessionId);
        },
        stream(prompt: string | import('../providers/vision.js').MultiModalInput, runOptions?: Omit<AgentRunOptions, 'onChunk'>) {
            // `this` is the CreateAgentResult object — bound at call time via method shorthand
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const self = this as import('./types.js').CreateAgentResult;

            async function* generate(): AsyncGenerator<string> {
                const queue: string[] = [];
                let notify: (() => void) | null = null;
                let finished = false;
                let runError: unknown;

                const runPromise = self.run(prompt, {
                    ...runOptions,
                    onChunk: (chunk: string) => {
                        queue.push(chunk);
                        notify?.();
                        notify = null;
                    },
                }).catch((e: unknown) => { runError = e; }).finally(() => {
                    finished = true;
                    notify?.();
                    notify = null;
                });

                while (true) {
                    // Drain any queued chunks first
                    while (queue.length > 0) {
                        yield queue.shift()!;
                    }
                    if (finished) {
                        // Drain again for chunks that arrived concurrently with completion
                        while (queue.length > 0) yield queue.shift()!;
                        await runPromise; // re-throws if run failed
                        if (runError) throw runError;
                        return;
                    }
                    // Wait for the next chunk or completion signal
                    await new Promise<void>((r) => { notify = r; });
                }
            }

            const iter = generate();
            return {
                [Symbol.asyncIterator]() {
                    return iter;
                },
            };
        },
        streamEvents(prompt: string | import('../providers/vision.js').MultiModalInput, runOptions?: Omit<AgentRunOptions, 'onChunk'>) {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const self = this as import('./types.js').CreateAgentResult;

            async function* generate(): AsyncGenerator<StreamChunk> {
                const queue: StreamChunk[] = [];
                let notify: (() => void) | null = null;
                let finished = false;
                let runError: unknown;
                let runResult: import('@confused-ai/agentic').AgenticRunResult | undefined;

                const runPromise = self.run(prompt, {
                    ...runOptions,
                    onChunk: (chunk: string) => {
                        queue.push({ type: 'text-delta', delta: chunk });
                        notify?.();
                        notify = null;
                    },
                    onToolCall: (toolName: string, input: Record<string, unknown>) => {
                        queue.push({ type: 'tool-call', tool: { name: toolName, input } });
                        notify?.();
                        notify = null;
                    },
                    onToolResult: (toolName: string, output: unknown) => {
                        queue.push({ type: 'tool-result', tool: { name: toolName, input: undefined, output } });
                        notify?.();
                        notify = null;
                    },
                    onStep: (stepNumber: number) => {
                        queue.push({ type: 'step-finish', stepNumber });
                        notify?.();
                        notify = null;
                    },
                }).then((r) => { runResult = r; })
                  .catch((e: unknown) => { runError = e; })
                  .finally(() => {
                    finished = true;
                    notify?.();
                    notify = null;
                });

                while (true) {
                    while (queue.length > 0) {
                        yield queue.shift()!;
                    }
                    if (finished) {
                        while (queue.length > 0) yield queue.shift()!;
                        await runPromise;
                        if (runError) {
                            yield { type: 'error', error: runError instanceof Error ? runError : new Error(String(runError)) };
                            return;
                        }
                        if (runResult) {
                            yield { type: 'run-finish', run: runResult };
                        }
                        return;
                    }
                    await new Promise<void>((r) => { notify = r; });
                }
            }

            const iter = generate();
            return {
                [Symbol.asyncIterator]() {
                    return iter;
                },
            };
        },
    };
}
