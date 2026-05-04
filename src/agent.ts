/**
 * Class-based agent entrypoint: one-line setup with a consistent run lifecycle.
 *
 * Composes the default model (from environment), a session store, optional long-lived memory, and default tools.
 */

import type { SessionStore } from '@confused-ai/session';
import type { Tool, ToolRegistry } from '@confused-ai/tools';
import type { CreateAgentOptions, CreateAgentResult, AgentRunOptions } from './create-agent.js';
import { createAgent } from './create-agent.js';
import { InMemorySessionStore } from '@confused-ai/session';
import { HttpClientTool } from '@confused-ai/tools';
import { BrowserTool } from '@confused-ai/tools';
import type { AgenticRunResult } from '@confused-ai/agentic';

/**
 * Options for the {@link Agent} class.
 * @deprecated Use `CreateAgentOptions` with `createAgent()` instead. Will be removed in v2.0.
 */
export interface AgentOptions {
    /** Agent name (default: 'Agent') */
    name?: string;
    /** System instructions / prompt */
    instructions: string;
    /**
     * Model: id (e.g. gpt-4o) or "provider:model_id" (e.g. openai:gpt-4o, openrouter:anthropic/claude-3.5-sonnet, ollama:llama3.2).
     * Omitted: uses OPENAI_API_KEY + OPENAI_MODEL from env.
     */
    model?: string;
    /** API key (optional; falls back to OPENAI_API_KEY / OPENROUTER_API_KEY) */
    apiKey?: string;
    /** Base URL for API (e.g. Ollama). Falls back to OPENAI_BASE_URL. */
    baseURL?: string;
    /** Use OpenRouter (set apiKey/model here or via env) */
    openRouter?: { apiKey?: string; model?: string };
    /**
     * Session store for conversation persistence.
     * Default: InMemorySessionStore(). Use a persistent store (e.g. SQLite) for production.
     */
    db?: SessionStore;
    /**
     * When true, agent uses session memory: pass sessionId to run() to continue conversations.
     * Default: true. Set false for stateless single-turn runs only.
     */
    learning?: boolean;
    /** Tools: array or registry. Default: [HttpClientTool, BrowserTool]. Plug any tools by implementing Tool[] or ToolRegistry. */
    tools?: Tool[] | ToolRegistry;
    /** Max agentic steps (default: 10) */
    maxSteps?: number;
    /** Run timeout ms (default: 60000) */
    timeoutMs?: number;
    /** Guardrails. Default: true (sensitive-data rule). Set false to disable. */
    guardrails?: CreateAgentOptions['guardrails'];
    /** Retry policy for LLM/tool calls */
    retry?: CreateAgentOptions['retry'];
    /** Cross-tool middleware (logging, rate limit, etc.). */
    toolMiddleware?: CreateAgentOptions['toolMiddleware'];
    /** Optional logger for production observability */
    logger?: CreateAgentOptions['logger'];
    /** Learning mode: always vs agentic */
    learningMode?: CreateAgentOptions['learningMode'];
    /** User profile store (profiles that persist across sessions) */
    userProfileStore?: CreateAgentOptions['userProfileStore'];
    /** Memory store (memories that accumulate, knowledge that transfers) */
    memoryStore?: CreateAgentOptions['memoryStore'];
    /** Knowledgebase (agentic RAG, hybrid search, reranking) */
    knowledgebase?: CreateAgentOptions['knowledgebase'];
    /** Type-safe input/output schemas (Zod) */
    inputSchema?: CreateAgentOptions['inputSchema'];
    outputSchema?: CreateAgentOptions['outputSchema'];
}

/**
 * `Agent` — create once, then call `run()` for each turn. Sessions carry conversation state when enabled.
 *
 * @deprecated Use `createAgent()` instead — it provides the same functionality with consistent naming
 * (`sessionStore` instead of `db`, no `learning` flag). The Agent class will be removed in v2.0.
 *
 * Migration:
 * ```ts
 * // Before:
 * const agent = new Agent({ instructions: '...', db: myStore, learning: true });
 *
 * // After:
 * const agent = createAgent({ name: 'Agent', instructions: '...', sessionStore: myStore });
 * ```
 */
export class Agent {
    readonly name: string;
    readonly instructions: string;
    readonly learning: boolean;
    private readonly delegate: CreateAgentResult;

    constructor(options: AgentOptions) {
        const {
            name = 'Agent',
            instructions,
            model,
            apiKey,
            baseURL,
            openRouter,
            db,
            learning = true,
            tools = [new HttpClientTool(), new BrowserTool()],
            maxSteps,
            timeoutMs,
            guardrails,
            retry,
            toolMiddleware,
            logger,
            learningMode,
            userProfileStore,
            memoryStore,
            knowledgebase,
            inputSchema,
            outputSchema,
        } = options;

        const createOpts: CreateAgentOptions = {
            name,
            instructions,
            model,
            apiKey,
            baseURL,
            openRouter,
            tools,
            toolMiddleware,
            sessionStore: (db ?? new InMemorySessionStore()) as any,
            guardrails,
            maxSteps,
            timeoutMs,
            retry,
            logger,
            learningMode,
            userProfileStore,
            memoryStore,
            knowledgebase,
            inputSchema,
            outputSchema,
        };

        this.delegate = createAgent(createOpts);
        this.name = this.delegate.name;
        this.instructions = this.delegate.instructions;
        this.learning = learning;
    }

    /**
     * Run the agent with a prompt. Pass sessionId for conversation memory (when learning is true).
     */
    async run(prompt: string, options?: AgentRunOptions): Promise<AgenticRunResult> {
        return this.delegate.run(prompt, options);
    }

    /**
     * Create a new session (returns sessionId to pass to run() for multi-turn memory).
     */
    async createSession(userId?: string): Promise<string> {
        return this.delegate.createSession(userId);
    }

    /**
     * Get messages for a session (if using a session store).
     */
    async getSessionMessages(sessionId: string) {
        return this.delegate.getSessionMessages(sessionId);
    }
}
