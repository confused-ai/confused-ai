import type { Message } from '../providers/types.js';
import type { AgenticStreamHooks, AgenticLifecycleHooks } from '../agentic/types.js';
import type { ToolProvider } from '../tools/core/registry.js';
import { createAgenticAgent } from '../agentic/index.js';
import { HttpClientTool } from '../tools/utils/http.js';
import { BrowserTool } from '../tools/utils/browser.js';
import { InMemorySessionStore } from '../session/index.js';
import { SessionState } from '../session/types.js';
import { ConfigError } from '../shared/errors.js';
import { toToolRegistry } from '../tools/core/registry.js';
import { isLightweightTool } from '../tools/core/tool-helper.js';
import { createDevLogger, createDevToolMiddleware } from '../dx/dev-logger.js';
import { BudgetEnforcer } from '../production/budget.js';
import type { CreateAgentOptions, CreateAgentResult, AgentRunOptions } from './types.js';
import type { AdapterRegistry, AdapterBindings } from '../adapters/index.js';
import type { AppConfig } from '../config/types.js';
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

/**
 * Merges two lifecycle hook objects. Per-run hooks run AFTER agent-level hooks.
 * For `beforeRun`/`buildSystemPrompt`/`beforeStep`/`beforeToolCall` the per-run
 * hook receives the (potentially modified) output of the agent-level hook.
 */
function mergeLifecycleHooks(
    agentLevel?: AgenticLifecycleHooks,
    perRun?: AgenticLifecycleHooks,
): AgenticLifecycleHooks | undefined {
    if (!agentLevel && !perRun) return undefined;
    if (!agentLevel) return perRun;
    if (!perRun) return agentLevel;

    return {
        beforeRun: async (prompt, config) => {
            let p = agentLevel.beforeRun ? await agentLevel.beforeRun(prompt, config) : prompt;
            if (perRun.beforeRun) p = await perRun.beforeRun(p, config);
            return p;
        },
        afterRun: async (result) => {
            let r = agentLevel.afterRun ? await agentLevel.afterRun(result) : result;
            if (perRun.afterRun) r = await perRun.afterRun(r);
            return r;
        },
        beforeStep: async (step, messages) => {
            let m = agentLevel.beforeStep ? await agentLevel.beforeStep(step, messages) : messages;
            if (perRun.beforeStep) m = await perRun.beforeStep(step, m);
            return m;
        },
        afterStep: async (step, messages, text) => {
            if (agentLevel.afterStep) await agentLevel.afterStep(step, messages, text);
            if (perRun.afterStep) await perRun.afterStep(step, messages, text);
        },
        beforeToolCall: async (name, args, step) => {
            let a = agentLevel.beforeToolCall ? await agentLevel.beforeToolCall(name, args, step) : args;
            if (perRun.beforeToolCall) a = await perRun.beforeToolCall(name, a, step);
            return a;
        },
        afterToolCall: async (name, result, args, step) => {
            let r = agentLevel.afterToolCall ? await agentLevel.afterToolCall(name, result, args, step) : result;
            if (perRun.afterToolCall) r = await perRun.afterToolCall(name, r, args, step);
            return r;
        },
        buildSystemPrompt: agentLevel.buildSystemPrompt ?? perRun.buildSystemPrompt,
        onError: async (err, step) => {
            if (agentLevel.onError) await agentLevel.onError(err, step);
            if (perRun.onError) await perRun.onError(err, step);
        },
    };
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
            const { loadConfig } = require('../config/loader.js') as typeof import('../config/loader.js');
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
              : (adapterBindings?.session as unknown as import('../session/types.js').SessionStore | undefined)
                ?? (agentDbPath
                    ? (() => {
                          try {
                              const { createSqliteSessionStoreSync } = require('../session/sqlite-store.js') as typeof import('../session/sqlite-store.js');
                              return createSqliteSessionStoreSync(agentDbPath);
                          } catch {
                              return new InMemorySessionStore();
                          }
                      })()
                    : new InMemorySessionStore());

    const llm = resolveLlmForCreateAgent(options, { model, apiKey, baseURL });

    const guardrails =
        !guardrailsOption
            ? undefined
            : (guardrailsOption as import('../guardrails/types.js').GuardrailEngine);

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
        llm,
        tools,
        toolMiddleware: effectiveToolMiddleware.length ? effectiveToolMiddleware : undefined,
        maxSteps,
        timeoutMs,
        retry,
        guardrails,
        hooks: agentHooks,
        checkpointStore: options.checkpointStore,
        knowledgebase: options.knowledgebase,
        budgetEnforcer,
        budgetModelId: model,
    });

    return {
        name,
        instructions,
        adapters: adapterBindings,
        async run(prompt: string | import('../providers/vision.js').MultiModalInput, runOptions?: AgentRunOptions) {
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

            // Merge per-run hooks with agent-level hooks (agent-level run first)
            const mergedHooks = mergeLifecycleHooks(agentHooks, runOptions?.hooks);

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

            // Temporarily override runner hooks with merged hooks for this run
            const runnerHooksBefore = (agent as unknown as { config: { hooks?: AgenticLifecycleHooks } }).config?.hooks;
            const agentInternal = agent as unknown as { config: { hooks?: AgenticLifecycleHooks } };
            if (mergedHooks !== agentHooks && agentInternal.config) {
                agentInternal.config.hooks = mergedHooks;
            }

            // Reset per-run budget accumulator
            budgetEnforcer?.resetRun();

            let result;
            try {
                const ragContext = (options.knowledgebase && options.knowledgebase.buildContext) ? await options.knowledgebase.buildContext(promptText) : undefined;
                result = await agent.run(
                    {
                        prompt: messages ? '' : promptText,
                        instructions,
                        messages,
                        maxSteps,
                        timeoutMs,
                        ragContext,
                        ...(runOptions?.runId && { runId: runOptions.runId }),
                        ...(runOptions?.userId && { userId: runOptions.userId }),
                    },
                    streamHooks
                );
            } finally {
                // Restore original hooks
                if (agentInternal.config) {
                    agentInternal.config.hooks = runnerHooksBefore;
                }
            }

            if (sessionId && sessionStore && result.messages?.length) {
                const persistMessages = result.messages.filter((m: Message) => m.role !== 'system');
                await sessionStore.update(sessionId, {
                    messages: persistMessages,
                    state: SessionState.ACTIVE,
                });
            }

            return result;
        },
        async createSession(userId?: string) {
            if (!sessionStore) {
                throw new ConfigError('createSession: sessionStore is disabled (sessionStore: false). Enable it or pass a store.', {});
            }
            const session = await sessionStore.create({
                agentId: name,
                userId,
                state: SessionState.ACTIVE,
                messages: [],
                metadata: {},
                context: {},
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
    };
}
