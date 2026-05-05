/**
 * Database tools — execute SQL queries against PostgreSQL, MySQL, or SQLite.
 * Requires the appropriate driver as a peer dependency:
 *   PostgreSQL: npm install pg
 *   MySQL:      npm install mysql2
 *   SQLite:     npm install better-sqlite3
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface DatabaseToolConfig {
    /** Database URL (postgres://..., mysql://..., or file path for SQLite) */
    connectionString: string;
    /** Optional list of allowed tables (allowlist). Omit to allow all. */
    allowedTables?: string[];
    /** Max rows returned per query (default: 100) */
    maxRows?: number;
}

function checkTable(table: string, allowed?: string[]) {
    if (allowed?.length && !allowed.includes(table)) {
        throw new Error(`Table "${table}" is not in the allowed list.`);
    }
}

// ── PostgreSQL Query ───────────────────────────────────────────────────────

const PgQuerySchema = z.object({
    query: z.string().describe('SQL SELECT query to execute'),
    params: z.array(z.unknown()).optional().describe('Positional parameters ($1, $2, ...)'),
});

export class PostgreSQLQueryTool extends BaseTool<typeof PgQuerySchema, { rows: unknown[]; rowCount: number; fields: string[] }> {
    constructor(private config: DatabaseToolConfig) {
        super({
            id: 'postgresql_query',
            name: 'PostgreSQL Query',
            description: 'Execute a SQL query against a PostgreSQL database. Returns rows as JSON.',
            category: ToolCategory.DATABASE,
            parameters: PgQuerySchema,
        });
    }
    protected async performExecute(input: z.infer<typeof PgQuerySchema>, _ctx: ToolContext) {
        const { Pool } = require('pg') as { Pool: new (o: { connectionString: string }) => { query(q: string, p?: unknown[]): Promise<{ rows: unknown[]; rowCount: number; fields: Array<{ name: string }> }> } };
        const pool = new Pool({ connectionString: this.config.connectionString });
        const result = await pool.query(input.query, input.params);
        const rows = this.config.maxRows ? result.rows.slice(0, this.config.maxRows) : result.rows;
        return { rows, rowCount: result.rowCount, fields: result.fields.map((f) => f.name) };
    }
}

// ── PostgreSQL Insert ──────────────────────────────────────────────────────

const PgInsertSchema = z.object({
    table: z.string().describe('Table name'),
    record: z.record(z.string(), z.unknown()).describe('Column → value map to insert'),
});

export class PostgreSQLInsertTool extends BaseTool<typeof PgInsertSchema, { id: unknown; success: boolean }> {
    constructor(private config: DatabaseToolConfig) {
        super({
            id: 'postgresql_insert',
            name: 'PostgreSQL Insert',
            description: 'Insert a record into a PostgreSQL table. Returns the inserted row id.',
            category: ToolCategory.DATABASE,
            parameters: PgInsertSchema,
        });
    }
    protected async performExecute(input: z.infer<typeof PgInsertSchema>, _ctx: ToolContext) {
        checkTable(input.table, this.config.allowedTables);
        const { Pool } = require('pg') as { Pool: new (o: { connectionString: string }) => { query(q: string, p?: unknown[]): Promise<{ rows: unknown[] }> } };
        const pool = new Pool({ connectionString: this.config.connectionString });
        const cols = Object.keys(input.record);
        const vals = Object.values(input.record);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO ${input.table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`;
        const result = await pool.query(sql, vals);
        return { id: (result.rows[0] as Record<string, unknown>)?.['id'], success: true };
    }
}

// ── MySQL Query ───────────────────────────────────────────────────────────

const MySQLQuerySchema = z.object({
    query: z.string().describe('SQL SELECT query to execute'),
    params: z.array(z.unknown()).optional().describe('Query parameters (? placeholders)'),
});

export class MySQLQueryTool extends BaseTool<typeof MySQLQuerySchema, { rows: unknown[]; rowCount: number }> {
    constructor(private config: DatabaseToolConfig) {
        super({
            id: 'mysql_query',
            name: 'MySQL Query',
            description: 'Execute a SQL query against a MySQL database. Returns rows as JSON.',
            category: ToolCategory.DATABASE,
            parameters: MySQLQuerySchema,
        });
    }
    protected async performExecute(input: z.infer<typeof MySQLQuerySchema>, _ctx: ToolContext) {
        const mysql2 = require('mysql2/promise') as {
            createConnection(o: { uri: string }): Promise<{ execute(q: string, p?: unknown[]): Promise<[unknown[], unknown[]]>; end(): Promise<void> }>;
        };
        const conn = await mysql2.createConnection({ uri: this.config.connectionString });
        const [rows] = await conn.execute(input.query, input.params ?? []);
        await conn.end();
        const arr = Array.isArray(rows) ? rows : [];
        return { rows: this.config.maxRows ? arr.slice(0, this.config.maxRows) : arr, rowCount: arr.length };
    }
}

// ── SQLite Query ───────────────────────────────────────────────────────────

const SQLiteQuerySchema = z.object({
    query: z.string().describe('SQL query to execute'),
    params: z.array(z.unknown()).optional().describe('Query parameters (? placeholders)'),
});

export class SQLiteQueryTool extends BaseTool<typeof SQLiteQuerySchema, { rows: unknown[]; rowCount: number }> {
    constructor(private config: DatabaseToolConfig) {
        super({
            id: 'sqlite_query',
            name: 'SQLite Query',
            description: 'Execute a SQL query against a SQLite database file. Returns rows as JSON.',
            category: ToolCategory.DATABASE,
            parameters: SQLiteQuerySchema,
        });
    }
    protected async performExecute(input: z.infer<typeof SQLiteQuerySchema>, _ctx: ToolContext) {
        const Database = require('better-sqlite3') as (path: string) => { prepare(q: string): { all(...a: unknown[]): unknown[] } };
        const db = Database(this.config.connectionString);
        const rows = db.prepare(input.query).all(...(input.params ?? []));
        const trimmed = this.config.maxRows ? rows.slice(0, this.config.maxRows) : rows;
        return { rows: trimmed, rowCount: trimmed.length };
    }
}

// ── Toolkit ────────────────────────────────────────────────────────────────

export class DatabaseToolkit {
    readonly tools: BaseTool[];
    constructor(config: DatabaseToolConfig & { type: 'postgres' | 'mysql' | 'sqlite' }) {
        if (config.type === 'postgres') {
            this.tools = [new PostgreSQLQueryTool(config), new PostgreSQLInsertTool(config)];
        } else if (config.type === 'mysql') {
            this.tools = [new MySQLQueryTool(config)];
        } else {
            this.tools = [new SQLiteQueryTool(config)];
        }
    }
}
