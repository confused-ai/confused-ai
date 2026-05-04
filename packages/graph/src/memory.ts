/**
 * Memory System — Short-term + Long-term + Vector memory
 *
 * Three tiers:
 * 1. Session memory: In-process, per-execution. Fast, ephemeral.
 * 2. Persistent memory: Pluggable KV store (Redis, Postgres, SQLite).
 * 3. Vector memory: Semantic search for RAG and context retrieval.
 *
 * Design:
 * - All stores implement the MemoryStore interface for KV operations
 * - VectorMemory is a separate interface for semantic search
 * - ContextWindow manages what goes into the LLM prompt (compression)
 * - MemoryManager orchestrates all three tiers
 */

import {
  type MemoryStore,
  type VectorMemory,
  type VectorSearchResult,
  type LLMMessage,
} from './types.js';

// ── In-Memory Store ─────────────────────────────────────────────────────────

/**
 * Simple in-process key-value store with optional TTL.
 * Use for session-scoped memory that doesn't survive restarts.
 */
export class InMemoryStore implements MemoryStore {
  private data: Map<string, { value: unknown; expiresAt?: number }> = new Map();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.data.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.data.get(key);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return false;
    }
    return true;
  }

  async keys(prefix?: string): Promise<string[]> {
    const allKeys = Array.from(this.data.keys());
    if (!prefix) return allKeys;
    return allKeys.filter(k => k.startsWith(prefix));
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

// ── In-Memory Vector Store ──────────────────────────────────────────────────

/**
 * Simple cosine-similarity vector store.
 * For production, use Pinecone/Weaviate/pgvector adapters.
 */
export class InMemoryVectorMemory implements VectorMemory {
  private vectors: Map<string, { vector: number[]; metadata?: Record<string, unknown> }> = new Map();

  async store(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    this.vectors.set(id, { vector, metadata });
  }

  async search(query: number[], topK = 5, filter?: Record<string, unknown>): Promise<VectorSearchResult[]> {
    const results: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> = [];

    for (const [id, entry] of this.vectors) {
      // Apply filter if provided
      if (filter) {
        const matches = Object.entries(filter).every(([k, v]) => entry.metadata?.[k] === v);
        if (!matches) continue;
      }

      const score = cosineSimilarity(query, entry.vector);
      results.push({ id, score, metadata: entry.metadata });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async delete(id: string): Promise<void> {
    this.vectors.delete(id);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Context Window Manager ──────────────────────────────────────────────────

/**
 * Manages what fits in the LLM's context window.
 * Implements token counting (approximate) and compression strategies.
 */
export class ContextWindowManager {
  private maxTokens: number;
  private reservedForOutput: number;

  constructor(options?: {
    maxTokens?: number;
    reservedForOutput?: number;
  }) {
    this.maxTokens = options?.maxTokens ?? 128000;
    this.reservedForOutput = options?.reservedForOutput ?? 4096;
  }

  /**
   * Trim messages to fit within token budget.
   * Strategy: Keep system message + recent messages, drop oldest user/assistant pairs.
   */
  trimMessages(messages: LLMMessage[]): LLMMessage[] {
    const budget = this.maxTokens - this.reservedForOutput;
    let totalTokens = 0;
    const result: LLMMessage[] = [];

    // Always keep system message
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg) {
      totalTokens += this._estimateTokens(systemMsg.content);
      result.push(systemMsg);
    }

    // Add messages from most recent, stop when budget exceeded
    const nonSystem = messages.filter(m => m.role !== 'system');
    const reversed = [...nonSystem].reverse();

    for (const msg of reversed) {
      const tokens = this._estimateTokens(msg.content);
      if (totalTokens + tokens > budget) break;
      totalTokens += tokens;
      result.push(msg);
    }

    // Restore original order (system first, then chronological)
    const systemMsgs = result.filter(m => m.role === 'system');
    const others = result.filter(m => m.role !== 'system').reverse();
    return [...systemMsgs, ...others];
  }

  /**
   * Summarize older messages to free up context space.
   */
  compress(messages: LLMMessage[], keepLast: number = 4): {
    summary: string;
    recent: LLMMessage[];
  } {
    if (messages.length <= keepLast + 1) {
      return { summary: '', recent: messages };
    }

    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    const older = nonSystem.slice(0, -keepLast);
    const recent = nonSystem.slice(-keepLast);

    // Create a summary of older messages
    const summaryParts: string[] = [];
    for (const msg of older) {
      const prefix = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'Tool';
      const content = msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content;
      summaryParts.push(`${prefix}: ${content}`);
    }

    const summary = `[Previous conversation summary: ${summaryParts.join(' | ')}]`;

    return {
      summary,
      recent: systemMsg ? [systemMsg, ...recent] : recent,
    };
  }

  /** Approximate token count (4 chars ≈ 1 token for English) */
  private _estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// ── Memory Manager ──────────────────────────────────────────────────────────

/**
 * Unified memory interface that orchestrates short-term, long-term, and vector memory.
 */
export class MemoryManager {
  readonly shortTerm: MemoryStore;
  readonly longTerm: MemoryStore;
  readonly vector?: VectorMemory;
  readonly contextWindow: ContextWindowManager;

  constructor(options?: {
    shortTerm?: MemoryStore;
    longTerm?: MemoryStore;
    vector?: VectorMemory;
    contextWindow?: ContextWindowManager;
  }) {
    this.shortTerm = options?.shortTerm ?? new InMemoryStore();
    this.longTerm = options?.longTerm ?? new InMemoryStore();
    this.vector = options?.vector;
    this.contextWindow = options?.contextWindow ?? new ContextWindowManager();
  }

  /**
   * Store a conversation turn in short-term memory.
   */
  async addToSession(sessionId: string, message: LLMMessage): Promise<void> {
    const key = `session:${sessionId}:messages`;
    const existing = await this.shortTerm.get<LLMMessage[]>(key) ?? [];
    existing.push(message);
    await this.shortTerm.set(key, existing);
  }

  /**
   * Get session messages, trimmed to fit context window.
   */
  async getSessionMessages(sessionId: string): Promise<LLMMessage[]> {
    const key = `session:${sessionId}:messages`;
    const messages = await this.shortTerm.get<LLMMessage[]>(key) ?? [];
    return this.contextWindow.trimMessages(messages);
  }

  /**
   * Store a fact/knowledge in long-term memory.
   */
  async remember(namespace: string, key: string, value: unknown): Promise<void> {
    await this.longTerm.set(`${namespace}:${key}`, value);
  }

  /**
   * Recall from long-term memory.
   */
  async recall<T = unknown>(namespace: string, key: string): Promise<T | undefined> {
    return this.longTerm.get<T>(`${namespace}:${key}`);
  }

  /**
   * Semantic search over vector memory.
   */
  async search(query: number[], topK?: number): Promise<VectorSearchResult[]> {
    if (!this.vector) return [];
    return this.vector.search(query, topK);
  }

  /**
   * Store embedding in vector memory.
   */
  async embed(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    if (!this.vector) throw new Error('Vector memory not configured');
    await this.vector.store(id, vector, metadata);
  }

  /**
   * Clear session memory.
   */
  async clearSession(sessionId: string): Promise<void> {
    const keys = await this.shortTerm.keys(`session:${sessionId}:`);
    for (const key of keys) {
      await this.shortTerm.delete(key);
    }
  }
}
