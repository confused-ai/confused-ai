/**
 * Adapter interfaces for pluggable persistence layers.
 *
 * Concrete implementations ship in dedicated packages such as
 * `@confused-ai/adapter-redis`, `@confused-ai/adapter-postgres`, etc.
 *
 * @module
 */

export interface Message {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  readonly name?: string;
  readonly toolCallId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly messages: readonly Message[];
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SessionStore {
  create(userId: string, metadata?: Record<string, unknown>): Promise<string>;
  get(sessionId: string): Promise<Session | null>;
  append(sessionId: string, messages: readonly Message[]): Promise<void>;
  delete(sessionId: string): Promise<void>;
  listByUser(userId: string): Promise<readonly Session[]>;
  touch(sessionId: string, ttlSeconds: number): Promise<void>;
}

export interface GraphEvent {
  readonly executionId: string;
  readonly seq: number;
  readonly type: string;
  readonly payload: unknown;
  readonly timestamp: string;
}

export interface ExecutionSnapshot {
  readonly executionId: string;
  readonly state: unknown;
  readonly seq: number;
  readonly timestamp: string;
}

export interface EventStore {
  append(executionId: string, event: GraphEvent): Promise<void>;
  read(executionId: string, fromSeq?: number): AsyncIterable<GraphEvent>;
  snapshot(executionId: string): Promise<ExecutionSnapshot | null>;
  writeSnapshot(executionId: string, snap: ExecutionSnapshot): Promise<void>;
}

export interface AuditEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly action: string;
  readonly resource?: string;
  readonly outcome: 'success' | 'failure';
  readonly metadata: Record<string, unknown>;
}

export interface AuditFilter {
  readonly tenantId?: string;
  readonly userId?: string;
  readonly action?: string;
  readonly from?: Date;
  readonly to?: Date;
}

export interface AuditStore {
  record(entry: AuditEntry): Promise<void>;
  query(filter: AuditFilter): AsyncIterable<AuditEntry>;
  archive(before: Date, destination: string): Promise<number>;
}

export interface CacheStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  flush(pattern: string): Promise<number>;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: Date;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitDecision>;
}

export interface SecretProvider {
  get(key: string): Promise<string>;
}
