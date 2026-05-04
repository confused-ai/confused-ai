/**
 * @confused-ai/session — InMemorySessionStore.
 *
 * SRP  — owns only in-memory session lifecycle.
 * DIP  — implements SessionStore interface.
 * DS   — Map<string, SessionData> for O(1) get/set/delete.
 *         Session IDs generated with crypto.randomUUID() (no uuid dep needed).
 *
 * Note: All methods return Promise.resolve() to satisfy the async interface contract
 *       without triggering require-await. The store is synchronous by nature.
 */

import type { SessionStore, SessionData, SessionMessage } from './types.js';

export class InMemorySessionStore implements SessionStore {
  /** O(1) average for all operations. */
  private readonly _store = new Map<string, SessionData>();

  get(id: string): Promise<SessionData | undefined> {
    return Promise.resolve(this._store.get(id));
  }

  create(data: { agentId: string; userId?: string; messages?: SessionMessage[] }): Promise<SessionData> {
    const id  = crypto.randomUUID();
    const now = Date.now();
    const session: SessionData = {
      id,
      agentId:   data.agentId,
      messages:  data.messages ?? [],
      createdAt: now,
      updatedAt: now,
      ...(data.userId !== undefined && { userId: data.userId }),
    };
    this._store.set(id, session);
    return Promise.resolve(session);
  }

  update(id: string, data: { messages: SessionMessage[] }): Promise<void> {
    const existing = this._store.get(id);
    if (existing) {
      this._store.set(id, { ...existing, messages: data.messages, updatedAt: Date.now() });
    }
    return Promise.resolve();
  }

  getMessages(id: string): Promise<SessionMessage[]> {
    return Promise.resolve([...(this._store.get(id)?.messages ?? [])]);
  }

  delete(id: string): Promise<void> {
    this._store.delete(id);
    return Promise.resolve();
  }

  /** O(1) — Map.size is a property. */
  get size(): number { return this._store.size; }
}

/** Factory function. */
export function createInMemoryStore(): InMemorySessionStore {
  return new InMemorySessionStore();
}
