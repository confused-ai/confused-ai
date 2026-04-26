/**
 * ContextProvider — Abstract
 * ==========================
 *
 * A ContextProvider is a high-level, reusable context source that agents
 * can attach to. It wraps one or more ContextBackends and implements the
 * query / update interface.
 *
 * Three interaction modes (ContextMode):
 *   DEFAULT  — content injected as text into the system prompt
 *   AGENT    — provider exposes its own sub-agent persona
 *   TOOLS    — provider registers callable tools with the agent
 *
 * Concrete implementations:
 *   class DatabaseContextProvider extends ContextProvider { query(...) }
 *   class WebContextProvider extends ContextProvider { query(...) }
 *
 * Quick inline example (in-memory):
 *
 *   class StaticContextProvider extends ContextProvider {
 *     readonly name = 'static';
 *     async query(q) { return { results: this.docs.filter(...) }; }
 *   }
 */

import type { Answer, Document, QueryOptions, Status, UpdateOptions } from './types.js';
import { ContextMode } from './types.js';
import type { BackendTool } from './backend.js';

export interface ProviderConfig {
    name: string;
    mode?: ContextMode;
    /** Instructions injected into the agent's system prompt */
    instructions?: string;
    /** Tool name for the query operation (TOOLS mode) */
    queryToolName?: string;
    /** Tool name for the update operation (TOOLS mode) */
    updateToolName?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

// ── ContextProvider ───────────────────────────────────────────────────────────

export abstract class ContextProvider {
    readonly name: string;
    readonly mode: ContextMode;
    readonly queryToolName: string;
    readonly updateToolName: string;
    readonly metadata: Record<string, unknown>;
    protected _instructions?: string;
    private _ready = false;

    constructor(config: ProviderConfig) {
        this.name           = config.name;
        this.mode           = config.mode           ?? ContextMode.DEFAULT;
        this.queryToolName  = config.queryToolName  ?? `${config.name}_query`;
        this.updateToolName = config.updateToolName ?? `${config.name}_update`;
        this.metadata       = config.metadata       ?? {};
        this._instructions  = config.instructions;
    }

    // ── Core API (must implement) ─────────────────────────────────────────────

    /** Query the provider and return matching documents */
    abstract query(query: string, options?: QueryOptions): Promise<Answer>;

    // ── Optional overrides ────────────────────────────────────────────────────

    /**
     * Update provider content (upsert documents, refresh index, etc.)
     * Default implementation throws — providers that support updates override.
     */
    async update(documents: Document[], options?: UpdateOptions): Promise<void> {
        void documents; void options;
        throw new Error(`${this.name}: update() not supported`);
    }

    // ── Health ────────────────────────────────────────────────────────────────

    status(): Status {
        return { ok: true, detail: `${this.name} ready=${this._ready}` };
    }

    async astatus(): Promise<Status> {
        return this.status();
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /** Initialise connections. Called once before first query. */
    async setup(): Promise<void> {
        this._ready = true;
    }

    /** Release resources. */
    async close(): Promise<void> {
        this._ready = false;
    }

    // ── System Prompt Integration ─────────────────────────────────────────────

    /** Returns text to inject into the agent's system prompt */
    instructions(): string | undefined {
        return this._instructions;
    }

    // ── Tools (TOOLS mode) ────────────────────────────────────────────────────

    /**
     * Returns tools that wrap `query()` and optionally `update()`.
     * Used when mode === ContextMode.TOOLS so the agent can call them explicitly.
     */
    getTools(): BackendTool[] {
        const tools: BackendTool[] = [
            {
                name:        this.queryToolName,
                description: `Query the ${this.name} context provider`,
                fn:          (q: unknown, opts?: unknown) =>
                    this.query(String(q), opts as QueryOptions | undefined),
            },
        ];

        // Expose update tool only for providers that support it
        const supportsUpdate = this._hasConcreteUpdate();
        if (supportsUpdate) {
            tools.push({
                name:        this.updateToolName,
                description: `Update the ${this.name} context provider`,
                fn:          (docs: unknown, opts?: unknown) =>
                    this.update(docs as Document[], opts as UpdateOptions | undefined),
            });
        }

        return tools;
    }

    // ── toString ──────────────────────────────────────────────────────────────

    toString(): string {
        return `ContextProvider(name=${this.name}, mode=${this.mode})`;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Detect whether a subclass actually implemented `update()`.
     * We can't easily tell at construction time, so check prototype chain.
     */
    private _hasConcreteUpdate(): boolean {
        // Walk up the prototype chain until we hit ContextProvider itself
        let proto = Object.getPrototypeOf(this);
        while (proto && proto !== ContextProvider.prototype) {
            if (Object.prototype.hasOwnProperty.call(proto, 'update')) return true;
            proto = Object.getPrototypeOf(proto);
        }
        return false;
    }
}
