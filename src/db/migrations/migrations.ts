import type { Migration } from './runner.js';

/**
 * All schema migrations for AgentDb.
 *
 * IMPORTANT: Never edit an existing migration — only add new ones.
 * Each migration must be idempotent (use IF NOT EXISTS / IF EXISTS).
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema — sessions, memories, learnings, knowledge, traces, schedules',
    sql: `
      CREATE TABLE IF NOT EXISTS agent_sessions (
        session_id    TEXT PRIMARY KEY,
        session_type  TEXT NOT NULL DEFAULT 'agent',
        agent_id      TEXT,
        team_id       TEXT,
        workflow_id   TEXT,
        user_id       TEXT,
        agent_data    JSONB,
        team_data     JSONB,
        workflow_data JSONB,
        session_data  JSONB,
        metadata      JSONB,
        runs          JSONB,
        summary       TEXT,
        created_at    BIGINT NOT NULL,
        updated_at    BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_user  ON agent_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);

      CREATE TABLE IF NOT EXISTS agent_memories (
        memory_id  TEXT PRIMARY KEY,
        user_id    TEXT,
        agent_id   TEXT,
        team_id    TEXT,
        memory     TEXT NOT NULL,
        topics     JSONB,
        input      TEXT,
        feedback   TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_memories_user ON agent_memories(user_id);

      CREATE TABLE IF NOT EXISTS agent_learnings (
        learning_id   TEXT PRIMARY KEY,
        learning_type TEXT NOT NULL,
        namespace     TEXT,
        user_id       TEXT,
        agent_id      TEXT,
        team_id       TEXT,
        workflow_id   TEXT,
        session_id    TEXT,
        entity_id     TEXT,
        entity_type   TEXT,
        content       JSONB NOT NULL,
        metadata      JSONB,
        created_at    BIGINT NOT NULL,
        updated_at    BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_learnings_type ON agent_learnings(learning_type);
      CREATE INDEX IF NOT EXISTS idx_agent_learnings_user ON agent_learnings(user_id);

      CREATE TABLE IF NOT EXISTS agent_knowledge (
        id             TEXT PRIMARY KEY,
        name           TEXT,
        description    TEXT,
        content        JSONB,
        type           TEXT,
        size           BIGINT,
        linked_to      TEXT,
        access_count   INT DEFAULT 0,
        status         TEXT,
        status_message TEXT,
        external_id    TEXT,
        metadata       JSONB,
        created_at     BIGINT,
        updated_at     BIGINT
      );

      CREATE TABLE IF NOT EXISTS agent_traces (
        trace_id    TEXT PRIMARY KEY,
        run_id      TEXT,
        session_id  TEXT,
        user_id     TEXT,
        agent_id    TEXT,
        team_id     TEXT,
        workflow_id TEXT,
        name        TEXT,
        status      TEXT,
        start_time  TEXT,
        end_time    TEXT,
        duration_ms FLOAT,
        metadata    JSONB,
        created_at  BIGINT NOT NULL,
        updated_at  BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_schedules (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        agent_id    TEXT,
        cron        TEXT,
        enabled     BOOLEAN NOT NULL DEFAULT TRUE,
        next_run_at BIGINT,
        last_run_at BIGINT,
        locked_by   TEXT,
        locked_at   BIGINT,
        metadata    JSONB,
        created_at  BIGINT NOT NULL,
        updated_at  BIGINT NOT NULL
      );
    `,
  },
];
