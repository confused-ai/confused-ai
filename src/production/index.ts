/**
 * Production module: runtime, control plane, resilience.
 */

// Canonical implementation
export * from '@confused-ai/production';

// ── Deferred: depends on agentic runner ────────────────────────────────────
export { ResilientAgent, withResilience } from './resilient-agent.js';
export type { ResilienceConfig as AgentResilienceConfig, HealthReport } from './resilient-agent.js';

// ── Deferred: needs full SessionStore API ──────────────────────────────────
export {
    TenantScopedSessionStore,
    TenantRegistry,
    createTenantContext,
} from './tenant.js';
export type { TenantConfig, TenantContext, TenantContextOptions } from './tenant.js';
