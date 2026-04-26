/**
 * Production module: runtime, control plane, evals, resilience.
 */

export * from './types.js';
export { createLatencyEval } from './latency-eval.js';
export type { LatencyEvalConfig } from './latency-eval.js';

// Resilience patterns
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

export {
    GracefulShutdown,
    createGracefulShutdown,
    withShutdownGuard,
} from './graceful-shutdown.js';
export type { GracefulShutdownConfig, CleanupHandler, ShutdownEvent } from './graceful-shutdown.js';

// Resumable Streaming
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

// Resilient Agent — one-line production hardening wrapper
export { ResilientAgent, withResilience } from './resilient-agent.js';
export type { ResilienceConfig as AgentResilienceConfig, HealthReport } from './resilient-agent.js';

// Budget enforcement — hard USD caps per run / user / month
export {
    BudgetEnforcer,
    BudgetExceededError,
    InMemoryBudgetStore,
    estimateCostUsd as estimateCostUsdFromBudget,
} from './budget.js';
export type { BudgetConfig, BudgetStore } from './budget.js';

// Checkpointing — durable step-level execution state
export {
    InMemoryCheckpointStore,
    SqliteCheckpointStore,
    createSqliteCheckpointStore,
} from './checkpoint.js';
export type { AgentCheckpointStore } from './checkpoint.js';

// Idempotency — deduplicate retried requests via X-Idempotency-Key
export {
    InMemoryIdempotencyStore,
    SqliteIdempotencyStore,
    createSqliteIdempotencyStore,
} from './idempotency.js';
export type { IdempotencyStore, IdempotencyOptions } from './idempotency.js';

// Audit store — persistent, queryable audit log
export {
    InMemoryAuditStore,
    SqliteAuditStore,
    createSqliteAuditStore,
} from './audit-store.js';
export type { AuditStore, AuditEntry, AuditFilter } from './audit-store.js';

// Approval store — durable HITL approval queue
export {
    InMemoryApprovalStore,
    SqliteApprovalStore,
    createSqliteApprovalStore,
    waitForApproval,
    ApprovalRejectedError,
} from './approval-store.js';
export type { ApprovalStore, HitlRequest, ApprovalDecision, ApprovalStatus } from './approval-store.js';

// Per-tenant isolation
export {
    TenantScopedSessionStore,
    TenantRegistry,
    createTenantContext,
} from './tenant.js';
export type { TenantConfig, TenantContext, TenantContextOptions } from './tenant.js';
