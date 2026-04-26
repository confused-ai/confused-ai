/**
 * Context System — Types
 * ======================
 *
 * ContextMode  — how a provider exposes its data to the agent
 * Document     — a retrievable piece of content
 * Answer       — the result of a context query
 * Status       — health/availability of a backend
 */

// ── ContextMode ───────────────────────────────────────────────────────────────

export enum ContextMode {
    /** Provider content is injected into the system prompt */
    DEFAULT = 'default',
    /** Provider injects content AND registers as an agent sub-capability */
    AGENT   = 'agent',
    /** Provider exposes callable tools the agent can invoke */
    TOOLS   = 'tools',
}

// ── Common primitives ─────────────────────────────────────────────────────────

export interface Status {
    /** Whether the provider/backend is reachable and healthy */
    ok: boolean;
    /** Human-readable detail (reason for failure, version, etc.) */
    detail?: string;
}

export interface Document {
    /** Stable content identifier */
    id: string;
    /** Human-readable name or title */
    name: string;
    /** Source URI (file path, URL, database row reference…) */
    uri?: string;
    /** Full text content */
    content?: string;
    /** Source label ("database", "gdrive", "web"…) */
    source?: string;
    /** Short excerpt used in search result previews */
    snippet?: string;
    /** Extra provider-specific metadata */
    metadata?: Record<string, unknown>;
}

export interface Answer {
    /** Retrieved documents matching the query */
    results: Document[];
    /** Optional synthesized textual answer based on results */
    text?: string;
}

// ── Query options ─────────────────────────────────────────────────────────────

export interface QueryOptions {
    /** User executing the query (for access-control aware backends) */
    userId?: string;
    /** Session scoping */
    sessionId?: string;
    /** Namespace/collection to query within */
    namespace?: string;
    /** Maximum number of documents to return */
    limit?: number;
    /** Minimum similarity / relevance score threshold (0.0–1.0) */
    minScore?: number;
}

// ── Update options ────────────────────────────────────────────────────────────

export interface UpdateOptions {
    /** Namespace/collection to upsert into */
    namespace?: string;
    /** Delete existing namespace contents before inserting */
    replace?: boolean;
}
