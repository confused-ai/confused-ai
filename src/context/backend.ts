/**
 * ContextBackend — Abstract
 * =========================
 * A backend is a low-level data source adapter (database, filesystem,
 * Google Drive, MCP, Slack, web crawler…).
 *
 * ContextProvider (provider.ts) composes one or more backends and exposes
 * the unified query/update API to the agent.
 *
 * Implementors must override:
 *   status()   — health probe
 *   getTools() — tools to register if ContextMode.TOOLS is used
 *
 * Optional lifecycle hooks:
 *   setup()   — called once before first query (open connections etc.)
 *   close()   — called on shutdown (close connections, flush buffers etc.)
 */

import type { Status } from './types.js';

export interface BackendTool {
    name: string;
    description: string;
    /** Callable handler */
    fn: (...args: unknown[]) => Promise<unknown>;
}

// ── ContextBackend ────────────────────────────────────────────────────────────

export abstract class ContextBackend {
    /** Human-readable backend identifier */
    abstract readonly name: string;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /** Initialise connections, load indexes, etc. Idempotent. */
    async setup(): Promise<void> {}

    /** Release resources gracefully. */
    async close(): Promise<void> {}

    // ── Health ────────────────────────────────────────────────────────────────

    /** Synchronous health check where possible */
    status(): Status {
        return { ok: true };
    }

    /** Async health check (may do a lightweight ping) */
    async astatus(): Promise<Status> {
        return this.status();
    }

    // ── Tools ─────────────────────────────────────────────────────────────────

    /** Return tools that let the agent interact with this backend directly */
    getTools(): BackendTool[] {
        return [];
    }

    // ── toString ──────────────────────────────────────────────────────────────

    toString(): string {
        return `ContextBackend(${this.name})`;
    }
}
