/**
 * Contracts — Shared interfaces, types, and enums used across modules.
 *
 * This is the dependency-free foundation layer. All modules import types from here
 * instead of cross-importing from each other. This eliminates circular dependencies
 * and creates a clean dependency graph.
 */

// ── Identity ───────────────────────────────────────────────────────────────

/** Unique identifier for agents, tasks, sessions, tools, and other entities. */
export type EntityId = string;

/** Generate a unique identifier (non-cryptographic, suitable for entity IDs). */
export function generateEntityId(): EntityId {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ── Agent Contracts ────────────────────────────────────────────────────────

/** Agent execution state machine. */
export enum AgentState {
    IDLE = 'idle',
    PLANNING = 'planning',
    EXECUTING = 'executing',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

/** Minimal agent identity — shared across all agent implementations. */
export interface AgentIdentity {
    readonly id: EntityId;
    readonly name: string;
    readonly description?: string;
}

/** Input to an agent execution. */
export interface AgentInput {
    readonly prompt: string;
    readonly context?: Record<string, unknown>;
    readonly attachments?: Attachment[];
}

/** Output from an agent execution. */
export interface AgentOutput {
    readonly result: unknown;
    readonly state: AgentState;
    readonly metadata: ExecutionMetadata;
}

/** Attachment for agent input/output (files, images, audio, etc.). */
export interface Attachment {
    readonly id: EntityId;
    readonly type: string;
    readonly content: unknown;
    readonly metadata?: Record<string, unknown>;
}

/** Execution metadata (timing, token usage, cost). */
export interface ExecutionMetadata {
    readonly startTime: Date;
    readonly endTime?: Date;
    readonly durationMs?: number;
    readonly iterations: number;
    readonly tokensUsed?: number;
    readonly cost?: number;
}

/** Hook for agent lifecycle events. */
export interface AgentHooks {
    beforeExecution?: (input: AgentInput, ctx: AgentContext) => Promise<void> | void;
    afterExecution?: (output: AgentOutput, ctx: AgentContext) => Promise<void> | void;
    onError?: (error: Error, ctx: AgentContext) => Promise<void> | void;
    onStateChange?: (oldState: AgentState, newState: AgentState, ctx: AgentContext) => Promise<void> | void;
}

/** Context provided to agents during execution. */
export interface AgentContext {
    readonly agentId: EntityId;
    readonly memory: MemoryStore;
    readonly tools: ToolRegistry;
    readonly planner: Planner;
    readonly metadata: Record<string, unknown>;
}

/** Agent configuration for construction. */
export interface AgentConfig {
    readonly id?: EntityId;
    readonly name: string;
    readonly description?: string;
    readonly persona?: string;
    readonly maxIterations?: number;
    readonly timeoutMs?: number;
    readonly debug?: boolean;
}

// ── LLM Contracts ──────────────────────────────────────────────────────────

/** Role of a message in a conversation. */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Multimodal content part (OpenAI-style).
 * Discriminated union for type-safe content handling.
 */
export type ContentPart =
    | { readonly type: 'text'; readonly text: string }
    | { readonly type: 'image_url'; readonly image_url: { readonly url: string; readonly detail?: 'low' | 'high' | 'auto' } }
    | { readonly type: 'file'; readonly file: { readonly url: string; readonly filename?: string } }
    | { readonly type: 'audio'; readonly audio: { readonly url: string } }
    | { readonly type: 'video'; readonly video: { readonly url: string } };

/** A single message in a conversation. */
export interface Message {
    readonly role: MessageRole;
    readonly content: string | ContentPart[];
}

/** Message with optional toolCallId (for role 'tool'). */
export interface MessageWithToolId extends Message {
    readonly toolCallId?: string;
}

/** Tool call requested by the model. */
export interface ToolCall {
    readonly id: string;
    readonly name: string;
    readonly arguments: Record<string, unknown>;
}

/** Tool result to send back to the model. */
export interface ToolResultMessage {
    readonly toolCallId: string;
    readonly content: string;
}

/** Assistant message that may include tool calls. */
export interface AssistantMessage extends Message {
    role: 'assistant';
    content: string;
    toolCalls?: ToolCall[];
}

/** Tool definition for the LLM (name, description, parameters schema as JSON Schema). */
export interface LLMToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
}

/** Result of a single generation (no streaming). */
export interface GenerateResult {
    readonly text: string;
    readonly toolCalls?: ToolCall[];
    readonly finishReason?: string;
    readonly usage?: TokenUsage;
}

/** Token usage statistics. */
export interface TokenUsage {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly totalTokens?: number;
}

/** Options for generateText. */
export interface GenerateOptions {
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly tools?: LLMToolDefinition[];
    readonly toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
    readonly stop?: string[];
}

/** Chunk from streaming (text delta). */
export interface StreamChunk {
    readonly type: 'text';
    readonly text: string;
}

/** Tool call chunk from streaming. */
export interface StreamToolCallChunk {
    readonly type: 'tool_call';
    readonly id: string;
    readonly name: string;
    readonly argsDelta: string;
}

/** Union of stream deltas. */
export type StreamDelta = StreamChunk | StreamToolCallChunk;

/** Options for streamText. */
export interface StreamOptions extends GenerateOptions {
    readonly onChunk?: (delta: StreamDelta) => void;
}

/**
 * LLM provider interface.
 *
 * Implement for OpenAI, Anthropic, Google, local models, etc.
 */
export interface LLMProvider {
    /** Generate a single response (and optional tool calls) from messages. */
    generateText(messages: Message[], options?: GenerateOptions): Promise<GenerateResult>;
    /** Stream response tokens and optional tool calls. */
    streamText?(messages: Message[], options?: StreamOptions): Promise<GenerateResult>;
}

// ── Tool Contracts ─────────────────────────────────────────────────────────

import { z, type ZodObject, type ZodType } from 'zod';

/** Tool parameter schema using Zod. */
export type ToolParameters = ZodObject<Record<string, ZodType>>;

/** Tool execution context. */
export interface ToolContext {
    readonly toolId: EntityId;
    readonly agentId: EntityId;
    readonly sessionId: string;
    readonly timeoutMs?: number;
    readonly permissions: ToolPermissions;
}

/** Tool permissions for sandboxing. */
export interface ToolPermissions {
    readonly allowNetwork: boolean;
    readonly allowFileSystem: boolean;
    readonly allowedPaths?: string[];
    readonly allowedHosts?: string[];
    readonly maxExecutionTimeMs: number;
}

/** Tool execution result. */
export interface ToolResult<T = unknown> {
    readonly success: boolean;
    readonly data?: T;
    readonly error?: ToolError;
    readonly executionTimeMs: number;
    readonly metadata: ToolExecutionMetadata;
}

/** Tool error details. */
export interface ToolError {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
}

/** Tool execution metadata. */
export interface ToolExecutionMetadata {
    readonly startTime: Date;
    readonly endTime: Date;
    readonly retries: number;
    readonly tokensUsed?: number;
}

/**
 * Tool interface.
 *
 * Generic over parameters (Zod schema) and output type.
 */
export interface Tool<TParams extends ToolParameters = ToolParameters, TOutput = unknown> {
    readonly id: EntityId;
    readonly name: string;
    readonly description: string;
    readonly parameters: TParams;
    readonly permissions: ToolPermissions;
    readonly category: ToolCategory;
    readonly version: string;
    readonly author?: string;
    readonly tags?: string[];
    /** Execute the tool with validated parameters. */
    execute(params: z.infer<TParams>, context: ToolContext): Promise<ToolResult<TOutput>>;
    /** Validate parameters without executing. */
    validate(params: unknown): params is z.infer<TParams>;
}

/** Tool categories. */
export enum ToolCategory {
    WEB = 'web',
    DATABASE = 'database',
    FILE_SYSTEM = 'file_system',
    API = 'api',
    UTILITY = 'utility',
    AI = 'ai',
    CUSTOM = 'custom',
}

/** Tool registry for managing available tools. */
export interface ToolRegistry {
    register(tool: Tool): void;
    unregister(toolId: EntityId): boolean;
    get(toolId: EntityId): Tool | undefined;
    getByName(name: string): Tool | undefined;
    list(): Tool[];
    listByCategory(category: ToolCategory): Tool[];
    search(query: string): Tool[];
    has(toolId: EntityId): boolean;
    clear(): void;
}

/** Tool middleware for intercepting tool calls. */
export interface ToolMiddleware {
    beforeExecute?: (tool: Tool, params: unknown, context: ToolContext) => Promise<void> | void;
    afterExecute?: (tool: Tool, result: ToolResult, context: ToolContext) => Promise<void> | void;
    onError?: (tool: Tool, error: Error, context: ToolContext) => Promise<void> | void;
}

// ── Memory Contracts ───────────────────────────────────────────────────────
//
// NOTE: These are the *domain-model* memory types used by the planning/agent
// subsystem. For the *adapter-level* memory store (pluggable persistence
// backends), see `adapters/types.ts → MemoryStoreAdapter`.
//
// Summary of similarly-named interfaces:
//   contracts/index.ts  → MemoryStore     (domain: store/retrieve MemoryEntry with embeddings)
//   adapters/types.ts   → MemoryStoreAdapter (adapter: add/search/getByAgent persistence)
//   graph/types.ts      → MemoryStore     (graph: simple KV get/set for execution state)
//
// Use `contracts/extensions.ts` for the canonical import of each:
//   import type { MemoryStore, MemoryEntry } from 'confused-ai/contracts/extensions';

/** Types of memory supported. */
export enum MemoryType {
    SHORT_TERM = 'short_term',
    LONG_TERM = 'long_term',
    EPISODIC = 'episodic',
    SEMANTIC = 'semantic',
}

/** A memory entry. */
export interface MemoryEntry {
    readonly id: EntityId;
    readonly type: MemoryType;
    readonly content: string;
    readonly embedding?: number[];
    readonly metadata: MemoryMetadata;
    readonly createdAt: Date;
    readonly expiresAt?: Date;
}

/** Metadata for memory entries. */
export interface MemoryMetadata {
    readonly source?: string;
    readonly importance?: number;
    readonly tags?: string[];
    readonly agentId?: EntityId;
    readonly sessionId?: string;
    readonly custom?: Record<string, unknown>;
}

/** Query options for memory retrieval. */
export interface MemoryQuery {
    readonly query: string;
    readonly type?: MemoryType;
    readonly limit?: number;
    readonly threshold?: number;
    readonly filter?: MemoryFilter;
    readonly includeEmbeddings?: boolean;
}

/** Filter for memory queries. */
export interface MemoryFilter {
    readonly tags?: string[];
    readonly source?: string;
    readonly agentId?: EntityId;
    readonly sessionId?: string;
    readonly before?: Date;
    readonly after?: Date;
    readonly custom?: Record<string, unknown>;
}

/** Result from memory search. */
export interface MemorySearchResult {
    readonly entry: MemoryEntry;
    readonly score: number;
}

/** Abstract memory store interface. */
export interface MemoryStore {
    store(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry>;
    retrieve(query: MemoryQuery): Promise<MemorySearchResult[]>;
    get(id: EntityId): Promise<MemoryEntry | null>;
    update(id: EntityId, updates: Partial<Omit<MemoryEntry, 'id' | 'createdAt'>>): Promise<MemoryEntry>;
    delete(id: EntityId): Promise<boolean>;
    clear(type?: MemoryType): Promise<void>;
    getRecent(limit: number, type?: MemoryType): Promise<MemoryEntry[]>;
    snapshot(): Promise<MemoryEntry[]>;
}

/** Embedding provider interface for vector operations. */
export interface EmbeddingProvider {
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    getDimension(): number;
}

// ── Session Contracts ──────────────────────────────────────────────────────
//
// NOTE: These are the *domain-model* session types. For the *adapter-level*
// session store (pluggable persistence backends), see:
//   adapters/types.ts  → SessionStoreAdapter  (adapter: CRUD for StoredSession)
//   session/types.ts   → SessionStore         (runtime: addMessages/getMessages)
//
// The canonical pluggable interface is re-exported from:
//   import type { SessionStore } from 'confused-ai/contracts/extensions';

/** Session state. */
export enum SessionState {
    ACTIVE = 'active',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    EXPIRED = 'expired',
}

/** Session metadata. */
export interface SessionMetadata {
    readonly userId?: string;
    readonly agentId?: EntityId;
    readonly tags?: string[];
    readonly custom?: Record<string, unknown>;
}

/** A conversation session. */
export interface Session {
    readonly id: string;
    readonly state: SessionState;
    readonly metadata: SessionMetadata;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly expiresAt?: Date;
}

/** A single run within a session. */
export interface SessionRun {
    readonly id: string;
    readonly sessionId: string;
    readonly messages: Message[];
    readonly startedAt: Date;
    readonly completedAt?: Date;
    readonly metadata?: Record<string, unknown>;
}

/** Session store interface. */
export interface SessionStore {
    createSession(metadata?: SessionMetadata): Promise<Session>;
    getSession(sessionId: string): Promise<Session | null>;
    updateSession(sessionId: string, updates: Partial<Session>): Promise<Session>;
    deleteSession(sessionId: string): Promise<boolean>;
    addRun(sessionId: string, run: Omit<SessionRun, 'id'>): Promise<SessionRun>;
    getRuns(sessionId: string): Promise<SessionRun[]>;
    getMessages(sessionId: string): Promise<Message[]>;
    addMessages(sessionId: string, messages: Message[]): Promise<void>;
}

// ── Planner Contracts ──────────────────────────────────────────────────────

/** Task status in a plan. */
export enum TaskStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    SKIPPED = 'skipped',
}

/** A task in a plan. */
export interface PlanTask {
    readonly id: EntityId;
    readonly description: string;
    readonly dependencies: EntityId[];
    readonly status: TaskStatus;
    readonly assignedAgent?: EntityId;
    readonly result?: unknown;
    readonly metadata?: Record<string, unknown>;
}

/** A plan consisting of tasks. */
export interface Plan {
    readonly id: EntityId;
    readonly goal: string;
    readonly tasks: PlanTask[];
    readonly createdAt: Date;
    readonly confidence?: number;
}

/** Planner interface (LLM-based or classical). */
export interface Planner {
    createPlan(goal: string, context?: Record<string, unknown>): Promise<Plan>;
    refinePlan(plan: Plan, feedback: string): Promise<Plan>;
    validatePlan(plan: Plan): Promise<{ valid: boolean; issues: string[] }>;
}

// ── Guardrail Contracts ────────────────────────────────────────────────────

/** Guardrail rule for validating agent output. */
export interface GuardrailRule {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    validate(input: string, context?: GuardrailContext): Promise<GuardrailResult>;
}

/** Context for guardrail validation. */
export interface GuardrailContext {
    readonly agentId?: EntityId;
    readonly sessionId?: string;
    readonly metadata?: Record<string, unknown>;
}

/** Result of a guardrail check. */
export interface GuardrailResult {
    readonly passed: boolean;
    readonly violations: GuardrailViolation[];
}

/** A specific guardrail violation. */
export interface GuardrailViolation {
    readonly ruleId: string;
    readonly ruleName: string;
    readonly message: string;
    readonly severity: 'error' | 'warning' | 'info';
}

/** Guardrail engine interface. */
export interface GuardrailEngine {
    addRule(rule: GuardrailRule): void;
    validate(input: string, context?: GuardrailContext): Promise<GuardrailResult>;
    getRules(): GuardrailRule[];
}

// ── Observability Contracts ────────────────────────────────────────────────

/** Log levels. */
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    FATAL = 'fatal',
}

/** A log entry. */
export interface LogEntry {
    readonly level: LogLevel;
    readonly message: string;
    readonly timestamp: Date;
    readonly context?: Record<string, unknown>;
}

/** Logger interface. */
export interface Logger {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}

/** Tracer interface for distributed tracing. */
export interface Tracer {
    startSpan(name: string, attributes?: Record<string, unknown>): TracerSpan;
    getActiveSpan(): TracerSpan | undefined;
}

/** A single span in a trace. */
export interface TracerSpan {
    readonly spanId: string;
    readonly traceId: string;
    setAttribute(key: string, value: unknown): void;
    addEvent(name: string, attributes?: Record<string, unknown>): void;
    setStatus(status: 'ok' | 'error', message?: string): void;
    end(): void;
}

/** Metrics collector interface. */
export interface MetricsCollector {
    counter(name: string, value?: number, labels?: Record<string, string>): void;
    histogram(name: string, value: number, labels?: Record<string, string>): void;
    gauge(name: string, value: number, labels?: Record<string, string>): void;
}

// ── Orchestration Contracts ────────────────────────────────────────────────

/** Message types for inter-agent communication. */
export enum MessageType {
    TASK_REQUEST = 'task_request',
    TASK_RESPONSE = 'task_response',
    DELEGATION = 'delegation',
    NOTIFICATION = 'notification',
    QUERY = 'query',
    COMMAND = 'command',
    EVENT = 'event',
}

/** Message priority levels. */
export enum MessagePriority {
    CRITICAL = 0,
    HIGH = 1,
    NORMAL = 2,
    LOW = 3,
}

/** Inter-agent message. */
export interface AgentMessage {
    readonly id: EntityId;
    readonly from: EntityId;
    readonly to: EntityId | 'broadcast';
    readonly type: MessageType;
    readonly payload: unknown;
    readonly timestamp: Date;
    readonly correlationId?: EntityId;
    readonly priority: MessagePriority;
}

/** Coordination type for multi-agent tasks. */
export enum CoordinationType {
    SEQUENTIAL = 'sequential',
    PARALLEL = 'parallel',
    PIPELINE = 'pipeline',
    HIERARCHICAL = 'hierarchical',
    CONSENSUS = 'consensus',
}

// ── Knowledge / RAG Contracts ──────────────────────────────────────────────

/** A chunk of content for RAG. */
export interface RAGChunk {
    readonly id: string;
    readonly content: string;
    readonly metadata?: Record<string, unknown>;
    readonly score?: number;
    readonly embedding?: number[];
}

/** Result from a RAG query. */
export interface RAGQueryResult {
    readonly chunks: RAGChunk[];
    readonly query: string;
    readonly totalResults: number;
}

/** RAG engine interface. */
export interface RAGEngine {
    retrieve(query: string, options?: { limit?: number; threshold?: number }): Promise<RAGQueryResult>;
    index(chunks: Omit<RAGChunk, 'id' | 'score'>[]): Promise<void>;
}

// ── Plugin Contracts ───────────────────────────────────────────────────────

/**
 * Plugin interface for cross-cutting concerns.
 *
 * Plugins can hook into agent lifecycle, tool execution, and observability.
 */
export interface Plugin {
    readonly id: string;
    readonly name: string;
    readonly version?: string;

    /** Called when the plugin is registered. */
    onRegister?(context: PluginContext): Promise<void> | void;
    /** Called before each agent run. */
    beforeRun?(input: AgentInput, context: PluginContext): Promise<AgentInput> | AgentInput;
    /** Called after each agent run. */
    afterRun?(output: AgentOutput, context: PluginContext): Promise<AgentOutput> | AgentOutput;
    /** Tool middleware provided by this plugin. */
    toolMiddleware?: ToolMiddleware;
    /** Called on agent errors. */
    onError?(error: Error, context: PluginContext): Promise<void> | void;
}

/** Context available to plugins. */
export interface PluginContext {
    readonly agentId?: EntityId;
    readonly sessionId?: string;
    readonly logger: Logger;
    readonly metadata: Record<string, unknown>;
}

// ── Workflow Contracts ──────────────────────────────────────────────────────

/** Status of a workflow step. */
export enum StepStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    SUCCESS = 'success',
    FAILED = 'failed',
    SUSPENDED = 'suspended',
    SKIPPED = 'skipped',
}

/** Result from a workflow execution. */
export interface WorkflowResult<T = unknown> {
    readonly status: 'success' | 'failed' | 'suspended' | 'paused';
    readonly result?: T;
    readonly error?: Error;
    readonly steps: Record<string, WorkflowStepResult>;
    readonly input: unknown;
    readonly state?: Record<string, unknown>;
    readonly executionTimeMs: number;
}

/** Result from a single workflow step. */
export interface WorkflowStepResult {
    readonly status: StepStatus;
    readonly payload?: unknown;
    readonly output?: unknown;
    readonly error?: Error;
    readonly executionTimeMs?: number;
}

// ── Extension Points ───────────────────────────────────────────────────────
// All pluggable interfaces — implement these to bring your own store, adapter,
// or provider. See `contracts/extensions.ts` for the full list with docs.
export * from './extensions.js';
