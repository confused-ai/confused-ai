import type { LLMProvider } from '../providers/types.js';
import type { Message } from '../providers/types.js';
import type { MultiModalInput } from '../providers/vision.js';
import type { Tool, ToolRegistry, ToolMiddleware } from '../tools/core/types.js';
import type { LightweightTool } from '../tools/core/tool-helper.js';
import type { SessionStore } from '../session/types.js';
import type {
    AdapterBindings,
    AdapterRegistry,
    GuardrailAdapter,
    RagAdapter,
    SessionStoreAdapter,
    MemoryStoreAdapter,
    ToolRegistryAdapter,
    AuthAdapter,
    RateLimitAdapter,
    AuditLogAdapter,
} from '../adapters/index.js';
import type { GuardrailEngine } from '../guardrails/types.js';
import type { UserProfileStore } from '../learning/types.js';
import type { LearningMode } from '../learning/types.js';
import type { MemoryStore } from '../memory/types.js';
import type { RAGEngine } from '../knowledge/types.js';
import type { z } from 'zod';
import type { AgenticRunResult, AgenticLifecycleHooks } from '../agentic/types.js';
import type { Logger } from '../observability/types.js';

export interface CreateAgentOptions {
    name: string;
    instructions: string;
    llm?: LLMProvider;
    /**
     * Model: plain id (e.g. gpt-4o) or `provider:model_id`.
     * Ignored if `llm` is provided.
     */
    model?: string;
    apiKey?: string;
    baseURL?: string;
    openRouter?: { apiKey?: string; model?: string };
    /**
     * Tools to give the agent.
     * - Pass an array of `tool()` / `defineTool()` results **directly** — no `.toFrameworkTool()` needed.
     * - Mix `LightweightTool` and full `Tool` instances freely in the same array.
     * - Pass a `ToolRegistry` for advanced use.
     * - Pass `[]` or `false` for a tool-free agent (pure text reasoning).
     * - Omit to use the framework default tools (HttpClientTool + BrowserTool).
     */
    tools?: (Tool | LightweightTool)[] | ToolRegistry | false;
    toolMiddleware?: ToolMiddleware[];
    /**
     * Session store. Pass `false` to run stateless (no session tracking).
     * Omit to use an in-memory store.
     */
    sessionStore?: SessionStore | false;
    /**
     * Guardrails. Pass `false` to disable completely.
     * Omit to use the default sensitive-data guardrail.
     */
    guardrails?: GuardrailEngine | false;
    maxSteps?: number;
    timeoutMs?: number;
    retry?: { maxRetries?: number; backoffMs?: number; maxBackoffMs?: number };
    logger?: Logger;
    learningMode?: LearningMode;
    userProfileStore?: UserProfileStore;
    memoryStore?: MemoryStore;
    ragEngine?: RAGEngine;
    inputSchema?: z.ZodType;
    outputSchema?: z.ZodType;
    dev?: boolean;
    /**
     * Adapter registry or explicit per-module bindings.
     *
     * Pass an `AdapterRegistry` to let every module auto-pick the best available
     * adapter for its category, or use explicit `AdapterBindings` to wire
     * specific adapters to specific modules.
     *
     * @example
     * ```ts
     * // Option A — registry (auto-selects first adapter per category)
     * import { createAdapterRegistry, InMemoryCacheAdapter } from 'fluxion/adapters';
     * const registry = createAdapterRegistry();
     * registry.register(new RedisAdapter({ url: process.env.REDIS_URL! }));
     * registry.register(new PineconeAdapter({ apiKey: process.env.PINECONE_API_KEY! }));
     * createAgent({ adapters: registry });
     *
     * // Option B — explicit bindings
     * createAgent({
     *   adapters: {
     *     session:     redisAdapter,
     *     memory:      pineconeAdapter,
     *     storage:     s3Adapter,
     *     analytics:   duckdbAdapter,
     *     observability: otelAdapter,
     *   },
     * });
     * ```
     */
    adapters?: AdapterRegistry | AdapterBindings;
    /**
     * Convenience: plug in a guardrail adapter without using the full adapter registry.
     * Coexists with `guardrails` — adapter-based check runs after the GuardrailEngine check.
     */
    guardrailAdapter?: GuardrailAdapter;
    /** Convenience: plug in a RAG adapter (overrides `ragEngine`). */
    ragAdapter?: RagAdapter;
    /** Convenience: plug in a session-store adapter (overrides `sessionStore`). */
    sessionStoreAdapter?: SessionStoreAdapter;
    /** Convenience: plug in a memory-store adapter (overrides `memoryStore`). */
    memoryStoreAdapter?: MemoryStoreAdapter;
    /** Convenience: plug in a remote tool-registry adapter. */
    toolRegistryAdapter?: ToolRegistryAdapter;
    /** Convenience: plug in an auth adapter for per-run credential validation. */
    authAdapter?: AuthAdapter;
    /** Convenience: plug in a rate-limit adapter. */
    rateLimitAdapter?: RateLimitAdapter;
    /** Convenience: plug in an audit-log adapter. */
    auditLogAdapter?: AuditLogAdapter;
    /**
     * Durable checkpoint store — saves loop state after each step so the agent
     * can resume from the last step after a process restart.
     * Pair with a stable `runId` in `AgentRunOptions` for full durable execution.
     *
     * @example
     * ```ts
     * import { createSqliteCheckpointStore } from 'fluxion/production';
     * createAgent({
     *   checkpointStore: createSqliteCheckpointStore('./agent.db'),
     * });
     * await agent.run('Analyse 500 documents', { runId: 'batch-2024-001' });
     * ```
     */
    checkpointStore?: import('../production/checkpoint.js').AgentCheckpointStore;
    /**
     * Budget enforcement — hard USD caps per run, per user (daily), and per month.
     * Throws `BudgetExceededError` (or warns / truncates) when a cap is crossed.
     *
     * @example
     * ```ts
     * import { createSqliteIdempotencyStore } from 'fluxion/production';
     *
     * const agent = createAgent({
     *   name: 'Safe',
     *   budget: {
     *     maxUsdPerRun: 0.50,
     *     maxUsdPerUser: 10.00,
     *     maxUsdPerMonth: 500.00,
     *     onExceeded: 'throw',
     *   },
     * });
     * ```
     */
    budget?: import('../production/budget.js').BudgetConfig;
    /**
     * Full lifecycle hooks — intercept every stage of the agentic loop.
     * Zero-cost when omitted (no overhead).
     *
     * @example
     * ```ts
     * hooks: {
     *   beforeRun: async (prompt) => `Context: today is Monday\n\n${prompt}`,
     *   afterRun:  async (result) => { myMetrics.record(result.steps); return result; },
     *   beforeToolCall: async (name, args) => { console.log(name, args); return args; },
     *   afterToolCall:  async (name, result) => result,
     *   buildSystemPrompt: async (instructions, rag) => `${instructions}\n\n${rag ?? ''}`,
     *   onError: async (err, step) => console.error(`Step ${step}:`, err),
     * }
     * ```
     */
    hooks?: AgenticLifecycleHooks;
}

export interface AgentRunOptions {
    sessionId?: string;
    userId?: string;
    messages?: Message[];
    onChunk?: (text: string) => void;
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
    onToolResult?: (name: string, result: unknown) => void;
    onStep?: (step: number) => void;
    /** Per-run lifecycle hooks (merged with agent-level hooks). */
    hooks?: AgenticLifecycleHooks;
    /**
     * Stable run ID for durable execution — enables checkpoint resume.
     * When provided and a `checkpointStore` is configured, the runner saves
     * state after each step and resumes from the last checkpoint on retry.
     */
    runId?: string;
}

export interface CreateAgentResult {
    name: string;
    instructions: string;
    /**
     * Run the agent with a text prompt or a multi-modal input.
     *
     * @example
     * // Text only
     * await agent.run('What is TypeScript?');
     *
     * // With an image (vision)
     * import { multiModal, imageUrl } from 'fluxion';
     * await agent.run(await multiModal('Describe this image', imageUrl('https://...')));
     */
    run(prompt: string | MultiModalInput, options?: AgentRunOptions): Promise<AgenticRunResult>;
    createSession(userId?: string): Promise<string>;
    getSessionMessages(sessionId: string): Promise<Message[]>;
    /** All resolved adapter bindings (merged from `adapters` + convenience fields). */
    readonly adapters?: AdapterBindings;
}
