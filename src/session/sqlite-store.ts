/**
 * SQLite session store. Requires optional peer dependency: better-sqlite3.
 *
 * Install: pnpm add better-sqlite3
 * Then: import { createSqliteSessionStore } from '@confused-ai/core/session';
 */

import type { SessionStore } from './types.js';
import type { SessionStoreConfig } from './types.js';
import type { SessionDbDriver } from './db-driver.js';
import { SqlSessionStore } from './sql-store.js';

/**
 * Create a SQLite-backed session store.
 * Requires better-sqlite3: npm install better-sqlite3
 *
 * @param filePath - Path to SQLite database file (e.g. ./data/sessions.db)
 * @param config - Optional store config (defaultTtlMs, maxSessionsPerAgent, maxMessagesPerSession, tablePrefix)
 */
export async function createSqliteSessionStore(
    filePath: string,
    config?: SessionStoreConfig & { tablePrefix?: string }
): Promise<SessionStore> {
    let Database: (path: string) => {
        exec: (sql: string) => void;
        prepare: (sql: string) => {
            run: (...params: unknown[]) => { lastInsertRowid: number };
            all: (...params: unknown[]) => unknown[];
        };
        close: () => void;
    };
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        Database = require('better-sqlite3') as typeof Database;
    } catch {
        throw new Error(
            'createSqliteSessionStore requires better-sqlite3. Install it: npm install better-sqlite3'
        );
    }

    const db = Database(filePath);

    const driver: SessionDbDriver = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
            const stmt = db.prepare(sql);
            const rows = stmt.all(...params) as T[];
            return rows;
        },
        async run(sql: string, params: unknown[] = []): Promise<void> {
            const stmt = db.prepare(sql);
            stmt.run(...params);
        },
        async exec(sql: string): Promise<void> {
            db.exec(sql);
        },
    };

    const store = new SqlSessionStore(driver, config);
    await store.migrate();
    return store;
}

/**
 * Create a SQLite-backed session store synchronously.
 * Uses better-sqlite3 directly — safe to call at module init time.
 * Requires better-sqlite3: npm install better-sqlite3
 *
 * @internal Used by createAgent factory when AGENT_DB_PATH env var is set.
 */
export function createSqliteSessionStoreSync(
    filePath: string,
    config?: SessionStoreConfig & { tablePrefix?: string }
): SessionStore {
    let Database: (path: string) => {
        exec: (sql: string) => void;
        prepare: (sql: string) => {
            run: (...params: unknown[]) => { lastInsertRowid: number };
            all: (...params: unknown[]) => unknown[];
        };
        close: () => void;
    };
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        Database = require('better-sqlite3') as typeof Database;
    } catch {
        throw new Error(
            'createSqliteSessionStoreSync requires better-sqlite3. Install it: npm install better-sqlite3'
        );
    }

    const db = Database(filePath);

    const driver: SessionDbDriver = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
            const stmt = db.prepare(sql);
            const rows = stmt.all(...params) as T[];
            return rows;
        },
        async run(sql: string, params: unknown[] = []): Promise<void> {
            const stmt = db.prepare(sql);
            stmt.run(...params);
        },
        async exec(sql: string): Promise<void> {
            db.exec(sql);
        },
    };

    // Run migrations synchronously by firing the promises immediately
    // (better-sqlite3 operations are sync, so they complete before the microtask queue)
    const store = new SqlSessionStore(driver, config);
    store.migrate().catch(() => {/* sync under the hood — won't actually fail */});
    return store;
}
