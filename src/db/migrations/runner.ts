/**
 * Migration runner for PostgresAgentDb.
 *
 * Manages versioned schema migrations using a `schema_version` table.
 * Migrations run in numeric order and are idempotent — running twice is safe.
 */

/** A single versioned migration. */
export interface Migration {
  /** Monotonically increasing version number (1, 2, 3 …). */
  version: number;
  /** Human-readable description shown in logs. */
  description: string;
  /** SQL to execute (may contain multiple statements separated by semicolons). */
  sql: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> };

/**
 * Run pending migrations against the given database connection.
 *
 * On first call: creates the `schema_version` table, runs all migrations.
 * On subsequent calls: skips already-applied migrations.
 *
 * @param db          - Minimal DB adapter (needs only `.query(sql, params)`)
 * @param migrations  - Ordered list of migrations (sorted by version ascending)
 * @param schemaTable - Name of the version-tracking table (default: `schema_version`)
 */
export async function runMigrations(
  db: Db,
  migrations: Migration[],
  schemaTable = 'schema_version',
): Promise<void> {
  // Ensure the version tracking table exists.
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${schemaTable} (
      version     INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  BIGINT NOT NULL
    )
  `);

  // Load already-applied versions.
  const { rows } = await db.query(`SELECT version FROM ${schemaTable}`);
  const applied = new Set<number>(rows.map((r: { version: number }) => r.version));

  // Sort ascending and apply pending migrations in order.
  const pending = migrations
    .filter(m => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.query(migration.sql);
    await db.query(
      `INSERT INTO ${schemaTable} (version, description, applied_at) VALUES ($1, $2, $3)`,
      [migration.version, migration.description, Date.now()],
    );
  }
}
