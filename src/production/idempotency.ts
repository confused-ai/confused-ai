/**
 * Idempotency store — deduplicates agent.run() calls via X-Idempotency-Key.
 *
 * When a client retries a failed HTTP request (network error, 5xx), the same
 * `X-Idempotency-Key` header causes the server to return the cached response
 * instead of re-executing the agent (preventing duplicate emails, charges, etc.).
 *
 * @example
 * ```ts
 * // In createHttpService options:
 * import { createSqliteIdempotencyStore } from 'confused-ai/production';
 *
 * createHttpService({
 *   agents: { assistant },
 *   idempotency: {
 *     store: createSqliteIdempotencyStore('./agent.db'),
 *     ttlMs: 24 * 60 * 60 * 1000, // 24 hours
 *   },
 * });
 * ```
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** Cached response entry. */
export interface IdempotencyEntry {
    readonly key: string;
    readonly responseStatus: number;
    readonly responseBody: string;
    readonly createdAt: string;
    readonly expiresAt: string;
}

/** Pluggable idempotency persistence interface. */
export interface IdempotencyStore {
    /** Fetch an existing entry, or null if not found / expired. */
    get(key: string): Promise<IdempotencyEntry | null>;
    /** Store a response for a key with a TTL. */
    set(key: string, status: number, body: string, ttlMs: number): Promise<void>;
    /** Remove expired entries (optional housekeeping). */
    prune?(): Promise<void>;
}

/** Options for idempotency in `createHttpService`. */
export interface IdempotencyOptions {
    /** Storage backend. Defaults to InMemoryIdempotencyStore. */
    store?: IdempotencyStore;
    /** How long to cache a response (ms). Default: 86_400_000 (24 hours). */
    ttlMs?: number;
    /**
     * Header name to read the idempotency key from.
     * Default: `'x-idempotency-key'` (case-insensitive).
     */
    headerName?: string;
}

// ── In-memory store ────────────────────────────────────────────────────────

/** Default in-memory idempotency store. Cleared on restart. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
    private cache = new Map<string, IdempotencyEntry>();

    async get(key: string): Promise<IdempotencyEntry | null> {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (new Date(entry.expiresAt) < new Date()) {
            this.cache.delete(key);
            return null;
        }
        return entry;
    }

    async set(key: string, status: number, body: string, ttlMs: number): Promise<void> {
        const now = new Date();
        this.cache.set(key, {
            key,
            responseStatus: status,
            responseBody: body,
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        });
    }

    async prune(): Promise<void> {
        const now = new Date();
        for (const [k, v] of this.cache) {
            if (new Date(v.expiresAt) < now) this.cache.delete(k);
        }
    }
}

// ── SQLite store ───────────────────────────────────────────────────────────

/** SQLite-backed idempotency store. Survives restarts. */
export class SqliteIdempotencyStore implements IdempotencyStore {
    private db: {
        exec: (sql: string) => void;
        prepare: (sql: string) => {
            run: (...params: unknown[]) => void;
            get: (...params: unknown[]) => unknown;
        };
    };

    private constructor(db: SqliteIdempotencyStore['db']) {
        this.db = db;
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS idempotency_cache (
                key TEXT PRIMARY KEY,
                response_status INTEGER NOT NULL,
                response_body TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
        `);
    }

    static create(filePath: string): SqliteIdempotencyStore {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        let Database: (p: string) => SqliteIdempotencyStore['db'];
        try {
            Database = require('better-sqlite3') as typeof Database;
        } catch {
            throw new Error(
                'SqliteIdempotencyStore requires better-sqlite3. Install: npm install better-sqlite3'
            );
        }
        return new SqliteIdempotencyStore(Database(filePath));
    }

    async get(key: string): Promise<IdempotencyEntry | null> {
        const row = this.db.prepare(
            `SELECT key, response_status, response_body, created_at, expires_at
             FROM idempotency_cache WHERE key = ? AND expires_at > ?`
        ).get(key, new Date().toISOString()) as {
            key: string; response_status: number; response_body: string;
            created_at: string; expires_at: string;
        } | undefined;
        if (!row) return null;
        return {
            key: row.key,
            responseStatus: row.response_status,
            responseBody: row.response_body,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
        };
    }

    async set(key: string, status: number, body: string, ttlMs: number): Promise<void> {
        const now = new Date();
        this.db.prepare(
            `INSERT INTO idempotency_cache (key, response_status, response_body, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET
               response_status=excluded.response_status,
               response_body=excluded.response_body,
               expires_at=excluded.expires_at`
        ).run(key, status, body, now.toISOString(), new Date(now.getTime() + ttlMs).toISOString());
    }

    async prune(): Promise<void> {
        this.db.prepare(`DELETE FROM idempotency_cache WHERE expires_at < ?`).run(new Date().toISOString());
    }
}

/**
 * Factory: create a SQLite idempotency store.
 */
export function createSqliteIdempotencyStore(filePath: string): IdempotencyStore {
    return SqliteIdempotencyStore.create(filePath);
}
