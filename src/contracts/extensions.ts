/**
 * Extension Points — every pluggable interface in the framework, in one place.
 *
 * This is the "bring your own implementation" contract surface.
 * Implement any of these interfaces and plug them in — the framework never
 * forces you to use its built-in classes.
 *
 * @example
 * ```ts
 * // Your own Postgres-backed budget store:
 * import type { BudgetStore } from 'confused-ai/contracts/extensions';
 *
 * class PostgresBudgetStore implements BudgetStore {
 *   async getTotal(userId: string) { ... }
 *   async record(userId: string, costUsd: number) { ... }
 *   async reset(userId: string) { ... }
 * }
 *
 * const agent = createAgent({
 *   name: 'MyAgent',
 *   budget: { maxUsdPerUserPerDay: 1.0, store: new PostgresBudgetStore() },
 * });
 * ```
 *
 * Pattern: one interface per concern. Every built-in implementation (`InMemory*`,
 * `Sqlite*`, `Redis*`) satisfies the interface — and so can yours.
 */

// ── Storage & Persistence ──────────────────────────────────────────────────

/** Pluggable session persistence (conversation history + context). */
export type { SessionStore, Session, SessionId, SessionQuery, SessionRun } from '../session/types.js';

/** Pluggable key-value storage. */
export type { StorageAdapter } from '../storage/index.js';

// ── Memory & Learning ──────────────────────────────────────────────────────

/** Pluggable user profile persistence (long-term user facts). */
export type { UserProfileStore, UserProfile, UserProfileQuery } from '../learning/types.js';

/** Pluggable agent memory store (short + long-term facts the agent remembers). */
export type { MemoryStore, MemoryEntry, MemoryQuery, MemoryType } from '../memory/types.js';

// ── Production Safety ──────────────────────────────────────────────────────

/** Pluggable budget store (track & cap USD spend per user / per month). */
export type { BudgetStore, BudgetConfig } from '../production/budget.js';

/** Pluggable checkpoint store (durable step-level execution state). */
export type { AgentCheckpointStore } from '../production/checkpoint.js';

/** Pluggable idempotency store (deduplicate retried requests). */
export type { IdempotencyStore, IdempotencyOptions } from '../production/idempotency.js';

/** Pluggable audit log (structured, queryable audit trail). */
export type { AuditStore, AuditEntry, AuditFilter } from '../production/audit-store.js';

/** Pluggable HITL approval store (durable human-in-the-loop queue). */
export type { ApprovalStore, HitlRequest, ApprovalDecision, ApprovalStatus } from '../production/approval-store.js';

// ── Multi-Tenancy ──────────────────────────────────────────────────────────

/** Per-tenant isolation context (session + rate-limit scoping). */
export type { TenantContext, TenantConfig, TenantContextOptions } from '../production/tenant.js';

// ── Resilience ────────────────────────────────────────────────────────────

/** Pluggable rate limiter. */
export type { RateLimiterConfig } from '../production/rate-limiter.js';

/** Pluggable circuit breaker config. */
export type { CircuitBreakerConfig, CircuitBreakerResult } from '../production/circuit-breaker.js';

// ── Observability ──────────────────────────────────────────────────────────

/** Pluggable tracer (spans, traces). */
export type { Tracer, TraceSpan } from '../observability/types.js';

/** Pluggable metrics collector. */
export type { MetricsCollector } from '../observability/types.js';

/** W3C Trace Context (distributed tracing propagation). */
export type { TraceContext } from '../observability/trace-context.js';

// ── Auth ──────────────────────────────────────────────────────────────────

/**
 * Pluggable auth middleware — implement your own `validate` strategy.
 * @example
 * ```ts
 * import type { AuthMiddlewareOptions } from 'confused-ai/contracts/extensions';
 * const auth: AuthMiddlewareOptions = {
 *   strategy: 'custom',
 *   validate: async (req) => {
 *     // your auth logic
 *     return { authenticated: true, identity: 'user-123' };
 *   },
 * };
 * ```
 */
export type {
    AuthMiddlewareOptions,
    AuthResult,
    AuthContext,
    ApiKeyStrategyOptions,
    BearerStrategyOptions,
    BasicStrategyOptions,
    CustomStrategyOptions,
} from '../runtime/auth.js';

// ── Tools ─────────────────────────────────────────────────────────────────

/** Pluggable tool definition. Implement this to add any capability to an agent. */
export type { Tool, ToolResult, ToolContext } from '../tools/core/types.js';

// ── Knowledge / RAG ───────────────────────────────────────────────────────

/** Pluggable RAG / knowledge engine — bring your own retrieval. */
export type { RAGEngine, RAGChunk, RAGQueryOptions, RAGQueryResult } from '../knowledge/types.js';

// ── LLM ──────────────────────────────────────────────────────────────────

/** Pluggable LLM provider — bring any model/vendor. */
export type { LLMProvider, Message, GenerateResult, GenerateOptions, StreamOptions } from '../providers/types.js';
