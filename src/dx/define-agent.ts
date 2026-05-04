/**
 * Fluent agent builder — best DX: discoverable, chainable, typed.
 *
 * defineAgent()
 *   .name('Assistant')
 *   .instructions('You are helpful.')
 *   .model('openai:gpt-4o')
 *   .tools([new HttpClientTool()])
 *   .withSession()
 *   .hooks({ beforeRun: async (p) => `Today is Monday\n\n${p}` })
 *   .use(loggingMiddleware)
 *   .dev()
 *   .build()
 */

import type { CreateAgentOptions, CreateAgentResult } from '../create-agent.js';
import type { SessionStore } from '@confused-ai/session';
import type { GuardrailEngine } from '@confused-ai/guardrails';
import type { ToolMiddleware } from '@confused-ai/tools';
import type { AgenticLifecycleHooks } from '@confused-ai/agentic';
import type { z } from 'zod';
import { createAgent } from '../create-agent.js';
import { InMemorySessionStore } from '@confused-ai/session';
import { createDevLogger } from './dev-logger.js';
import { createDevToolMiddleware } from './dev-logger.js';

export interface DefineAgentOptions
    extends Pick<
        CreateAgentOptions,
        | 'name'
        | 'instructions'
        | 'model'
        | 'apiKey'
        | 'baseURL'
        | 'openRouter'
        | 'tools'
        | 'toolMiddleware'
        | 'sessionStore'
        | 'guardrails'
        | 'maxSteps'
        | 'timeoutMs'
        | 'retry'
        | 'logger'
        | 'learningMode'
        | 'userProfileStore'
        | 'memoryStore'
        | 'knowledgebase'
        | 'inputSchema'
        | 'outputSchema'
        | 'hooks'
        | 'budget'
        | 'checkpointStore'
        | 'adapters'
    > {
    /** Enable dev mode: console logger + tool call logging */
    dev?: boolean;
    /** When true, build() skips ALL framework defaults (no tools, no session, no guardrails). */
    _noDefaults?: boolean;
}

/**
 * Fluent builder for creating agents with best DX.
 * Chain methods and call .build() to get a runnable agent.
 */
export function defineAgent(): AgentBuilder {
    return new AgentBuilder({});
}

class AgentBuilder {
    private options: Partial<DefineAgentOptions> = {};

    constructor(options: Partial<DefineAgentOptions>) {
        this.options = { ...options };
    }

    /** Set agent name */
    name(name: string): AgentBuilder {
        return new AgentBuilder({ ...this.options, name });
    }

    /** Set system instructions (required before build) */
    instructions(instructions: string): AgentBuilder {
        return new AgentBuilder({ ...this.options, instructions });
    }

    /** Set model: id or "provider:model_id" (e.g. openai:gpt-4o, ollama:llama3.2) */
    model(model: string): AgentBuilder {
        return new AgentBuilder({ ...this.options, model });
    }

    /** Set API key (overrides env) */
    apiKey(apiKey: string): AgentBuilder {
        return new AgentBuilder({ ...this.options, apiKey });
    }

    /** Set base URL (e.g. Ollama) */
    baseURL(baseURL: string): AgentBuilder {
        return new AgentBuilder({ ...this.options, baseURL });
    }

    /** Set OpenRouter config */
    openRouter(config: { apiKey?: string; model?: string }): AgentBuilder {
        return new AgentBuilder({ ...this.options, openRouter: config });
    }

    /**
     * Set tools.
     * - Pass an array / registry to use those tools.
     * - Pass `false` or `[]` for a tool-free agent.
     * - Omit to use the framework defaults (HttpClientTool + BrowserTool).
     */
    tools(tools: CreateAgentOptions['tools']): AgentBuilder {
        return new AgentBuilder({ ...this.options, tools });
    }

    /** Set session store. Call with no args for in-memory; pass store for DB; pass false for stateless. */
    withSession(store?: SessionStore | false): AgentBuilder {
        const sessionStore = store === false ? false : (store ?? new InMemorySessionStore()) as any;
        return new AgentBuilder({ ...this.options, sessionStore });
    }

    /** Set guardrails. Pass false to disable. */
    withGuardrails(guardrails: GuardrailEngine | false): AgentBuilder {
        return new AgentBuilder({ ...this.options, guardrails });
    }

    /** Max agentic steps */
    maxSteps(n: number): AgentBuilder {
        return new AgentBuilder({ ...this.options, maxSteps: n });
    }

    /** Run timeout in ms */
    timeoutMs(ms: number): AgentBuilder {
        return new AgentBuilder({ ...this.options, timeoutMs: ms });
    }

    /** Retry policy */
    retry(policy: CreateAgentOptions['retry']): AgentBuilder {
        return new AgentBuilder({ ...this.options, retry: policy });
    }

    /** Type-safe input schema (Zod) */
    inputSchema<T>(schema: z.ZodType<T>): AgentBuilder {
        return new AgentBuilder({ ...this.options, inputSchema: schema });
    }

    /** Type-safe output schema (Zod) */
    outputSchema<T>(schema: z.ZodType<T>): AgentBuilder {
        return new AgentBuilder({ ...this.options, outputSchema: schema });
    }

    /**
     * Add a tool middleware to the chain.
     * Middleware runs before/after every tool call in the order `.use()` was called.
     *
     * @example
     * ```ts
     * defineAgent()
     *   .instructions('...')
     *   .use(createLoggingToolMiddleware())
     *   .use(myRateLimiter)
     *   .build()
     * ```
     */
    use(middleware: ToolMiddleware): AgentBuilder {
        const existing = this.options.toolMiddleware ?? [];
        return new AgentBuilder({ ...this.options, toolMiddleware: [...existing, middleware] });
    }

    /**
     * Set full lifecycle hooks — intercept every stage of the agentic loop.
     * Can be called multiple times; later calls REPLACE the previous hook set.
     *
     * @example
     * ```ts
     * defineAgent()
     *   .instructions('You are a code reviewer.')
     *   .hooks({
     *     beforeRun:      async (p)    => `Context: ${getContext()}\n\n${p}`,
     *     afterRun:       async (r)    => { telemetry.record(r); return r; },
     *     beforeStep:     async (s, m) => { console.log('Step', s); return m; },
     *     beforeToolCall: async (n, a) => { console.log(n, a); return a; },
     *     buildSystemPrompt: async (inst) => `[Custom]\n${inst}`,
     *     onError:        async (e, s) => console.error(e),
     *   })
     *   .build()
     * ```
     */
    hooks(hooks: AgenticLifecycleHooks): AgentBuilder {
        return new AgentBuilder({ ...this.options, hooks });
    }

    /**
     * Set a USD spend budget — enforced per-run, per-user, and/or per-month.
     * Throws `BudgetExceededError` (or warns) when a cap is crossed.
     *
     * @example
     * ```ts
     * defineAgent()
     *   .instructions('...')
     *   .budget({ maxUsdPerRun: 0.50, maxUsdPerUser: 10, onExceeded: 'throw' })
     *   .build()
     * ```
     */
    budget(config: NonNullable<CreateAgentOptions['budget']>): AgentBuilder {
        return new AgentBuilder({ ...this.options, budget: config });
    }

    /**
     * Set a durable checkpoint store — enables resume after process crash.
     * Pair with a stable `runId` in `run({ runId: '...' })`.
     *
     * @example
     * ```ts
     * import { createSqliteCheckpointStore } from 'confused-ai/production';
     * defineAgent()
     *   .instructions('...')
     *   .checkpoint(createSqliteCheckpointStore('./agent.db'))
     *   .build()
     * ```
     */
    checkpoint(store: NonNullable<CreateAgentOptions['checkpointStore']>): AgentBuilder {
        return new AgentBuilder({ ...this.options, checkpointStore: store });
    }

    /**
     * Plug in an adapter registry or explicit adapter bindings.
     * Lets you swap storage, vector DB, rate-limiting, auth, etc. without changing agent code.
     *
     * @example
     * ```ts
     * import { createAdapterRegistry } from 'confused-ai/adapters';
     * defineAgent()
     *   .instructions('...')
     *   .adapters(createAdapterRegistry().register(new RedisAdapter(opts)))
     *   .build()
     * ```
     */
    adapters(adapters: NonNullable<CreateAgentOptions['adapters']>): AgentBuilder {
        return new AgentBuilder({ ...this.options, adapters });
    }

    /**
     * Opt out of ALL framework defaults.
     * After calling this, build() will not inject any tools, session, or guardrails
     * unless you explicitly set them via .tools(), .withSession(), .withGuardrails().
     *
     * Equivalent to bare() but with the fluent builder interface.
     */
    noDefaults(): AgentBuilder {
        return new AgentBuilder({ ...this.options, _noDefaults: true });
    }

    /** Enable dev mode: console logger + tool call logging */
    dev(): AgentBuilder {
        return new AgentBuilder({ ...this.options, dev: true });
    }

    /** Build and return a runnable agent */
    build(): CreateAgentResult {
        const opts = this.options;
        if (!opts.instructions?.trim()) {
            throw new Error('defineAgent().build() requires instructions. Call .instructions("...") first.');
        }

        const noDefaults = opts._noDefaults === true;

        const createOpts: CreateAgentOptions = {
            name: opts.name ?? 'Agent',
            instructions: opts.instructions,
            model: opts.model,
            apiKey: opts.apiKey,
            baseURL: opts.baseURL,
            openRouter: opts.openRouter,
            // noDefaults: pass tools as-is (undefined → no injection in createAgent with noDefaults path)
            tools: noDefaults ? (opts.tools ?? false) : opts.tools,
            toolMiddleware: opts.toolMiddleware,
            sessionStore: noDefaults ? (opts.sessionStore ?? false) : opts.sessionStore,
            guardrails: noDefaults ? (opts.guardrails ?? false) : opts.guardrails,
            maxSteps: opts.maxSteps,
            timeoutMs: opts.timeoutMs,
            retry: opts.retry,
            logger: opts.logger,
            learningMode: opts.learningMode,
            userProfileStore: opts.userProfileStore,
            memoryStore: opts.memoryStore,
            knowledgebase: opts.knowledgebase,
            inputSchema: opts.inputSchema,
            outputSchema: opts.outputSchema,
            hooks: opts.hooks,
            budget: opts.budget,
            checkpointStore: opts.checkpointStore,
            adapters: opts.adapters,
        };

        if (opts.dev) {
            createOpts.logger = createOpts.logger ?? createDevLogger();
            createOpts.toolMiddleware = [
                ...(createOpts.toolMiddleware ?? []),
                createDevToolMiddleware(),
            ];
        }

        return createAgent(createOpts);
    }
}
