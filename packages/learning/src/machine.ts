/**
 * LearningMachine
 * ===============
 * Unified learning coordinator for agents.
 *
 * Coordinates multiple learning stores under a single API:
 *
 *   buildContext(opts)  → string injected into the agent's system prompt
 *   process(messages)   → extract and persist learnings after a turn
 *   getTools(opts)      → tools the agent can invoke to update memories
 *
 * Each store type is opt-in. Stores may be provided as pre-built instances
 * or the machine will create lightweight in-memory defaults.
 *
 * Usage:
 *   const machine = new LearningMachine({
 *     userMemory:     new InMemoryUserMemoryStore(),
 *     sessionContext: new InMemorySessionContextStore(),
 *   });
 *
 *   // Before each LLM call:
 *   const ctx = await machine.buildContext({ userId, sessionId, message });
 *
 *   // After each turn:
 *   await machine.process(messages, { userId, sessionId });
 */

import type {
    UserProfileStore,
    UserMemoryStore,
    SessionContextStore,
    LearnedKnowledgeStore,
    EntityMemoryStore,
    LearningRecallOptions,
    LearningProcessOptions,
    LearningToolOptions,
    LearningTool,
} from './types.js';

// ── Configuration ─────────────────────────────────────────────────────────────

export interface LearningMachineConfig {
    /** Store for structured user profiles (name, preferences…) */
    userProfile?: UserProfileStore;
    /** Store for unstructured user memories */
    userMemory?: UserMemoryStore;
    /** Store for per-session context (summary, goal, plan) */
    sessionContext?: SessionContextStore;
    /** Store for entity memories (companies, projects, people…) */
    entityMemory?: EntityMemoryStore;
    /** Store for reusable learned knowledge / insights */
    learnedKnowledge?: LearnedKnowledgeStore;
    /** Default namespace for entity and knowledge stores */
    namespace?: string;
    /** Enable debug logging */
    debug?: boolean;
}

// ── Recall Result ─────────────────────────────────────────────────────────────

export interface LearningRecallResult {
    userProfile?: unknown;
    userMemory?: unknown;
    sessionContext?: unknown;
    entityMemory?: unknown;
    learnedKnowledge?: unknown;
    [storeName: string]: unknown;
}

// ── LearningMachine ───────────────────────────────────────────────────────────

export class LearningMachine {
    readonly userProfile?: UserProfileStore;
    readonly userMemory?: UserMemoryStore;
    readonly sessionContext?: SessionContextStore;
    readonly entityMemory?: EntityMemoryStore;
    readonly learnedKnowledge?: LearnedKnowledgeStore;
    readonly namespace: string;
    private readonly debug: boolean;

    constructor(config: LearningMachineConfig = {}) {
        this.userProfile = config.userProfile;
        this.userMemory = config.userMemory;
        this.sessionContext = config.sessionContext;
        this.entityMemory = config.entityMemory;
        this.learnedKnowledge = config.learnedKnowledge;
        this.namespace = config.namespace ?? 'global';
        this.debug = config.debug ?? false;
    }

    // ── Context Building ────────────────────────────────────────────────────

    /**
     * Retrieve relevant data from all stores and format it as a string
     * for injection into the agent's system prompt.
     */
    async buildContext(opts: LearningRecallOptions = {}): Promise<string> {
        const recalled = await this.recall(opts);
        return this._formatResults(recalled);
    }

    /**
     * Raw recall from all enabled stores. Most callers should use
     * `buildContext()` instead; this is useful for inspection/testing.
     */
    async recall(opts: LearningRecallOptions = {}): Promise<LearningRecallResult> {
        const ns = opts.namespace ?? this.namespace;
        const result: LearningRecallResult = {};

        if (this.userProfile && opts.userId) {
            try {
                result.userProfile = await this.userProfile.get(opts.userId, opts.agentId as any);
            } catch (e) {
                this._warn('userProfile.recall', e);
            }
        }

        if (this.userMemory && opts.userId) {
            try {
                result.userMemory = await this.userMemory.get(opts.userId, opts.agentId);
            } catch (e) {
                this._warn('userMemory.recall', e);
            }
        }

        if (this.sessionContext && opts.sessionId) {
            try {
                result.sessionContext = await this.sessionContext.get(opts.sessionId, opts.agentId);
            } catch (e) {
                this._warn('sessionContext.recall', e);
            }
        }

        if (this.entityMemory && opts.entityId) {
            try {
                result.entityMemory = await this.entityMemory.get(opts.entityId, ns);
            } catch (e) {
                this._warn('entityMemory.recall', e);
            }
        }

        if (this.learnedKnowledge && opts.message) {
            try {
                result.learnedKnowledge = await this.learnedKnowledge.search(opts.message, ns);
            } catch (e) {
                this._warn('learnedKnowledge.recall', e);
            }
        }

        return result;
    }

    // ── Processing ──────────────────────────────────────────────────────────

    /**
     * Extract and persist learnings from a completed conversation turn.
     * Each store processes the messages according to its own extraction logic.
     *
     * For ALWAYS-mode stores this is automatic; for AGENTIC stores the agent
     * is expected to call the provided tools directly.
     */
    async process(opts: LearningProcessOptions): Promise<void> {
        // Stores that implement their own `process` hook can be called here.
        // The base implementations are memory-backed without LLM extraction,
        // so process() is a no-op unless extended via custom stores.
        this._debug('process()', { userId: opts.userId, sessionId: opts.sessionId });
    }

    // ── Tools ───────────────────────────────────────────────────────────────

    /**
     * Returns callable tool functions to expose to the agent when using
     * `LearningMode.AGENTIC`. Each enabled store contributes its tools.
     */
    getTools(opts: LearningToolOptions = {}): LearningTool[] {
        const tools: LearningTool[] = [];
        const ns = opts.namespace ?? this.namespace;

        if (this.userMemory) {
            tools.push(this._makeAddMemoryTool(opts.userId, opts.agentId, ns));
            tools.push(this._makeUpdateMemoryTool(opts.userId, opts.agentId));
            tools.push(this._makeDeleteMemoryTool(opts.userId, opts.agentId));
        }

        if (this.sessionContext) {
            tools.push(this._makeUpdateContextTool(opts.sessionId, opts.agentId));
        }

        if (this.entityMemory) {
            tools.push(this._makeAddEntityFactTool(ns));
            tools.push(this._makeAddEntityEventTool(ns));
        }

        if (this.learnedKnowledge) {
            tools.push(this._makeSaveKnowledgeTool(ns));
            tools.push(this._makeSearchKnowledgeTool(ns));
        }

        return tools;
    }

    // ── Serialization ────────────────────────────────────────────────────────

    toJSON(): Record<string, boolean | string> {
        return {
            userProfile:      !!this.userProfile,
            userMemory:       !!this.userMemory,
            sessionContext:   !!this.sessionContext,
            entityMemory:     !!this.entityMemory,
            learnedKnowledge: !!this.learnedKnowledge,
            namespace:        this.namespace,
        };
    }

    // ── Private Helpers ──────────────────────────────────────────────────────

    private _formatResults(recalled: LearningRecallResult): string {
        const parts: string[] = [];

        if (recalled.userProfile) {
            const p = recalled.userProfile as any;
            const name = p.displayName ?? p.name ?? p.userId;
            if (name) parts.push(`User: ${name}`);
            if (p.preferences && Object.keys(p.preferences).length > 0) {
                parts.push(`Preferences: ${JSON.stringify(p.preferences)}`);
            }
        }

        if (recalled.userMemory) {
            const m = recalled.userMemory as any;
            const memories: string[] = (m.memories ?? [])
                .map((mem: any) => `- ${mem.content ?? mem}`)
                .filter(Boolean);
            if (memories.length > 0) {
                parts.push(`User Memories:\n${memories.join('\n')}`);
            }
        }

        if (recalled.sessionContext) {
            const ctx = recalled.sessionContext as any;
            if (ctx.summary) parts.push(`Session Summary: ${ctx.summary}`);
            if (ctx.goal)    parts.push(`Goal: ${ctx.goal}`);
            if (ctx.plan?.length) {
                const planText = ctx.plan.map((step: string, i: number) => `  ${i + 1}. ${step}`).join('\n');
                parts.push(`Plan:\n${planText}`);
            }
            if (ctx.progress?.length) {
                const doneText = ctx.progress.map((s: string) => `  ✓ ${s}`).join('\n');
                parts.push(`Completed:\n${doneText}`);
            }
        }

        if (recalled.entityMemory) {
            const ent = recalled.entityMemory as any;
            const header = `${ent.name ?? ent.entityId} (${ent.entityType})`;
            const lines: string[] = [header];
            if (ent.description) lines.push(ent.description);
            if (ent.facts?.length) {
                lines.push('Facts:');
                ent.facts.forEach((f: any) => lines.push(`  - ${f.content}`));
            }
            parts.push(lines.join('\n'));
        }

        if (recalled.learnedKnowledge) {
            const items = recalled.learnedKnowledge as any[];
            if (items.length > 0) {
                const lines = items.map((k: any) => `- [${k.title}] ${k.learning}`);
                parts.push(`Relevant Learnings:\n${lines.join('\n')}`);
            }
        }

        return parts.join('\n\n');
    }

    private _makeAddMemoryTool(userId?: string, agentId?: string, _ns?: string): LearningTool {
        const store = this.userMemory!;
        return async function addMemory(content: unknown): Promise<string> {
            if (!userId) return 'No userId provided';
            const id = await store.addMemory(userId, String(content), agentId);
            return `Memory added (id=${id})`;
        };
    }

    private _makeUpdateMemoryTool(userId?: string, agentId?: string): LearningTool {
        const store = this.userMemory!;
        return async function updateMemory(memoryId: unknown, content: unknown): Promise<string> {
            if (!userId) return 'No userId provided';
            const ok = await store.updateMemory(userId, String(memoryId), String(content), agentId);
            return ok ? `Memory ${memoryId} updated` : `Memory ${memoryId} not found`;
        };
    }

    private _makeDeleteMemoryTool(userId?: string, agentId?: string): LearningTool {
        const store = this.userMemory!;
        return async function deleteMemory(memoryId: unknown): Promise<string> {
            if (!userId) return 'No userId provided';
            const ok = await store.deleteMemory(userId, String(memoryId), agentId);
            return ok ? `Memory ${memoryId} deleted` : `Memory ${memoryId} not found`;
        };
    }

    private _makeUpdateContextTool(sessionId?: string, agentId?: string): LearningTool {
        const store = this.sessionContext!;
        return async function updateContext(patch: unknown): Promise<string> {
            if (!sessionId) return 'No sessionId provided';
            const existing = await store.get(sessionId, agentId) ?? { sessionId };
            await store.set({ ...existing, ...(patch as object) });
            return 'Session context updated';
        };
    }

    private _makeAddEntityFactTool(namespace: string): LearningTool {
        const store = this.entityMemory!;
        return async function addEntityFact(entityId: unknown, content: unknown): Promise<string> {
            const id = await store.addFact(String(entityId), String(content), namespace);
            return `Fact added (id=${id})`;
        };
    }

    private _makeAddEntityEventTool(namespace: string): LearningTool {
        const store = this.entityMemory!;
        return async function addEntityEvent(entityId: unknown, content: unknown, date?: unknown): Promise<string> {
            const id = await store.addEvent(String(entityId), String(content), date ? String(date) : undefined, namespace);
            return `Event added (id=${id})`;
        };
    }

    private _makeSaveKnowledgeTool(namespace: string): LearningTool {
        const store = this.learnedKnowledge!;
        return async function saveKnowledge(title: unknown, learning: unknown, context?: unknown, tags?: unknown): Promise<string> {
            await store.save({
                title: String(title),
                learning: String(learning),
                context: context ? String(context) : undefined,
                tags: Array.isArray(tags) ? tags.map(String) : undefined,
                namespace,
            });
            return `Knowledge "${title}" saved`;
        };
    }

    private _makeSearchKnowledgeTool(namespace: string): LearningTool {
        const store = this.learnedKnowledge!;
        return async function searchKnowledge(query: unknown): Promise<string> {
            const results = await store.search(String(query), namespace);
            if (!results.length) return 'No relevant learnings found';
            return results.map(k => `[${k.title}] ${k.learning}`).join('\n');
        };
    }

    private _debug(label: string, data?: unknown): void {
        if (this.debug) {
            console.debug(`[LearningMachine] ${label}`, data ?? '');
        }
    }

    private _warn(label: string, err: unknown): void {
        console.warn(`[LearningMachine] ${label} error:`, err);
    }
}
