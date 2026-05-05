/**
 * @confused-ai/session — package barrel.
 */

export { InMemorySessionStore, createInMemoryStore } from './in-memory.js';
export { createSqliteStore }                         from './sqlite.js';
export { createRedisStore }                          from './redis-store.js';
export type { RedisClient }                          from './redis-store.js';
export { FallbackSessionStore, createFallbackSessionStore } from './fallback-store.js';
export type { FallbackSessionStoreOptions }          from './fallback-store.js';
export type {
  SessionStore,
  SessionData,
  SessionMessage,
  SessionId,
  Session,
  SessionRun,
  SessionQuery,
  SessionMetadata,
} from './types.js';
export { SessionState } from './types.js';

// ── AgentDb-backed store ────────────────────────────────────────────────────
export { DbSessionStore, createDbSessionStore } from './db-store.js';
