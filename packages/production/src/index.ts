/**
 * @confused-ai/production — Production-grade runtime, resilience, and control-plane
 * utilities for confused-ai agents.
 *
 * Does NOT export resilient-agent (depends on agentic runner — Wave 6)
 * or latency-eval (depends on extensions — Wave 9).
 * Those remain in src/production/ until their deps are migrated.
 */

// ── Primitive types ──────────────────────────────────────────────────────────
export * from './types.js';

// ── Resilience patterns ──────────────────────────────────────────────────────
export {
    CircuitBreaker,
    CircuitState,
    CircuitOpenError,
    createLLMCircuitBreaker,
} from './circuit-breaker.js';
export type { CircuitBreakerConfig, CircuitBreakerResult } from './circuit-breaker.js';

export {
    RateLimiter,
    RateLimitError,
    createOpenAIRateLimiter,
} from './rate-limiter.js';
export type { RateLimiterConfig } from './rate-limiter.js';

export { RedisRateLimiter } from './redis-rate-limiter.js';
export type { RedisRateLimiterConfig } from './redis-rate-limiter.js';

// ── Health checks ────────────────────────────────────────────────────────────
export {
    HealthCheckManager,
    HealthStatus,
    createLLMHealthCheck,
    createSessionStoreHealthCheck,
    createCustomHealthCheck,
    createHttpHealthCheck,
} from './health.js';
export type {
    HealthCheckConfig,
    HealthCheckResult,
    HealthComponent,
    ComponentHealth,
} from './health.js';

// ── Graceful shutdown ────────────────────────────────────────────────────────
export {
    GracefulShutdown,
    createGracefulShutdown,
    withShutdownGuard,
} from './graceful-shutdown.js';
export type { GracefulShutdownConfig, CleanupHandler, ShutdownEvent } from './graceful-shutdown.js';

// ── Resumable streaming ──────────────────────────────────────────────────────
export {
    ResumableStreamManager,
    formatSSE,
    createResumableStream,
} from './resumable-stream.js';
export type {
    StreamCheckpoint,
    ResumableStreamConfig,
    StreamChunkSSE,
} from './resumable-stream.js';

// ── Budget enforcement ───────────────────────────────────────────────────────
export {
    BudgetEnforcer,
    BudgetExceededError,
    InMemoryBudgetStore,
    estimateCostUsd,
} from './budget.js';
export type { BudgetConfig, BudgetStore } from './budget.js';

// ── Checkpointing ────────────────────────────────────────────────────────────
export {
    InMemoryCheckpointStore,
    SqliteCheckpointStore,
    createSqliteCheckpointStore,
} from './checkpoint.js';
export type { AgentCheckpointStore } from './checkpoint.js';

// ── Idempotency ──────────────────────────────────────────────────────────────
export {
    InMemoryIdempotencyStore,
    SqliteIdempotencyStore,
    createSqliteIdempotencyStore,
} from './idempotency.js';
export type { IdempotencyStore, IdempotencyOptions } from './idempotency.js';

// ── Audit store ──────────────────────────────────────────────────────────────
export {
    InMemoryAuditStore,
    SqliteAuditStore,
    createSqliteAuditStore,
} from './audit-store.js';
export type { AuditStore, AuditEntry, AuditFilter } from './audit-store.js';

// ── Feedback store ───────────────────────────────────────────────────────────
export {
    InMemoryFeedbackStore,
    FeedbackEntrySchema,
} from './feedback-store.js';
export type { FeedbackEntry, FeedbackFilter, FeedbackStore } from './feedback-store.js';

// ── Postgres stores ──────────────────────────────────────────────────────────
export {
    PostgresAuditStore,
    PostgresCheckpointStore,
    createPostgresAuditStore,
    createPostgresCheckpointStore,
} from './postgres-stores.js';
export type { PgQueryable } from './postgres-stores.js';

// ── Cascade delete ───────────────────────────────────────────────────────────
export { deleteSession } from './cascade-delete.js';
export type { CascadeDeleteDeps, CascadeDeleteResult } from './cascade-delete.js';

// ── Approval store ───────────────────────────────────────────────────────────
export {
    InMemoryApprovalStore,
    SqliteApprovalStore,
    createSqliteApprovalStore,
    waitForApproval,
    ApprovalRejectedError,
} from './approval-store.js';
export type { ApprovalStore, HitlRequest, ApprovalDecision, ApprovalStatus } from './approval-store.js';

// ── Per-tenant isolation ─────────────────────────────────────────────────────
// NOTE: tenant.ts is deferred — TenantScopedSessionStore implements the full
// src/session SessionStore API which differs from packages/session's minimal
// SessionStore. Will migrate in a later wave when packages/session is unified.
// export { TenantScopedSessionStore, TenantRegistry, createTenantContext } from './tenant.js';
