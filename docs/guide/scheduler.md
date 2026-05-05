---
title: Scheduler
description: Cron-based agent scheduling — define recurring tasks with standard cron expressions, register handlers, and run agents on a schedule.
outline: [2, 3]
---

# Scheduler

`ScheduleManager` provides cron-based job scheduling with an in-process handler registry. Register agent handlers by key, define jobs with standard 5-field cron expressions, and call `start()` to begin the tick loop.

---

## Quick start

```ts
import { ScheduleManager } from 'confused-ai';
import { agent }           from 'confused-ai';

// Create an agent to run on a schedule
const reportAgent = agent({
  model:        'gpt-4o',
  instructions: 'Generate a concise daily metrics report from the provided data.',
});

// Create a scheduler
const scheduler = new ScheduleManager();

// Register a handler
scheduler.register('daily-report', async () => {
  const data   = await metricsService.getDailyStats();
  const result = await reportAgent.run(`Generate a report for this data: ${JSON.stringify(data)}`);
  await slackService.post('#reports', result.text);
});

// Schedule it (every day at 8am UTC)
scheduler.create({
  id:       'daily-report-job',
  handler:  'daily-report',
  cron:     '0 8 * * *',
  enabled:  true,
  timezone: 'UTC',
});

scheduler.start();
```

---

## Cron format

5-field standard cron (minute, hour, day-of-month, month, day-of-week):

| Field | Range | Special chars |
|-------|-------|---------------|
| Minute | 0–59 | `*`, `,`, `-`, `/` |
| Hour | 0–23 | `*`, `,`, `-`, `/` |
| Day of month | 1–31 | `*`, `,`, `-`, `/`, `?` |
| Month | 1–12 | `*`, `,`, `-`, `/` |
| Day of week | 0–7 (0 & 7 = Sun) | `*`, `,`, `-`, `/`, `?` |

### Common expressions

| Cron | Meaning |
|------|---------|
| `* * * * *` | Every minute |
| `0 * * * *` | Every hour |
| `0 9 * * 1-5` | 9am Monday–Friday |
| `0 8 * * *` | 8am every day |
| `0 0 * * 0` | Midnight every Sunday |
| `*/15 * * * *` | Every 15 minutes |
| `0 0 1 * *` | First of every month |

---

## CRUD operations

```ts
// Create
const job = scheduler.create({
  id:       'my-job',
  handler:  'handlerKey',
  cron:     '0 9 * * 1-5',
  enabled:  true,
  timezone: 'America/New_York',
  metadata: { team: 'platform' },
});

// Read
const all      = scheduler.list();
const specific = scheduler.get('my-job');

// Update
scheduler.update('my-job', { cron: '0 10 * * 1-5' });
scheduler.enable('my-job');
scheduler.disable('my-job');

// Delete
scheduler.delete('my-job');
```

---

## Utility functions

```ts
import { validateCronExpr, computeNextRun } from 'confused-ai';

// Validate before saving
const valid = validateCronExpr('0 9 * * 1-5');
console.log(valid.ok);     // true
console.log(valid.error);  // undefined | 'Invalid field ...'

// Preview next 3 run times
const nextRuns = computeNextRun('0 9 * * 1-5', { count: 3 });
nextRuns.forEach(d => console.log(d.toISOString()));
```

---

## Run history

```ts
// Get last 10 runs for a job
const history = await scheduler.getRunHistory('my-job', { limit: 10 });

for (const run of history) {
  console.log(run.jobId);         // 'my-job'
  console.log(run.startedAt);     // Date
  console.log(run.completedAt);   // Date | null
  console.log(run.status);        // 'success' | 'error' | 'running'
  console.log(run.error);         // error message if status === 'error'
}
```

---

## Quick start

```ts
import { ScheduleManager } from 'confused-ai';

const scheduler = new ScheduleManager();

// Register a handler — key matches the schedule's `endpoint` field
scheduler.register('digest', async () => {
  const report = await reportAgent.run('Generate daily digest');
  await db.insert('digests', { content: report.text, date: new Date() });
});

// Create a schedule
const id = await scheduler.create({
  name:     'Daily digest',
  cronExpr: '0 9 * * *',   // 09:00 UTC every day
  endpoint: 'digest',
  enabled:  true,
});

// Start the polling loop (checks every 60s by default)
scheduler.start();

// On shutdown:
scheduler.stop();
```

---

## Cron expression format

5-field standard cron: `<minute> <hour> <dom> <month> <dow>`

| Example | Meaning |
|---------|---------|
| `* * * * *` | Every minute |
| `0 * * * *` | Every hour |
| `0 9 * * *` | Every day at 09:00 UTC |
| `0 9 * * 1` | Every Monday at 09:00 UTC |
| `*/5 * * * *` | Every 5 minutes |
| `0 9 1 * *` | First day of every month at 09:00 |
| `0 9,17 * * 1-5` | 09:00 and 17:00 Monday–Friday |

Validate and inspect cron expressions:

```ts
import { validateCronExpr, computeNextRun } from 'confused-ai';

validateCronExpr('0 9 * * *'); // throws if invalid

const next = computeNextRun('0 9 * * *', new Date());
console.log(next); // Date of next 09:00 occurrence
```

---

## CRUD operations

```ts
// Create
const id = await scheduler.create({
  name:              'Hourly sync',
  cronExpr:          '0 * * * *',
  endpoint:          'sync',
  enabled:           true,
  payload:           { source: 'salesforce' },
  timezone:          'America/New_York',
  maxRetries:        3,
  retryDelaySeconds: 30,
});

// Read
const schedule = await scheduler.get(id);

// List all (or only enabled)
const all     = await scheduler.list();
const enabled = await scheduler.list(true);

// Update
await scheduler.update(id, { cronExpr: '0 */2 * * *', enabled: false });

// Enable / disable
await scheduler.enable(id);
await scheduler.disable(id);

// Delete
await scheduler.delete(id);
```

---

## Run history

Query past executions via the run store:

```ts
const scheduler = new ScheduleManager({
  runStore: new InMemoryScheduleRunStore(),
});

// After some runs:
const runs = await scheduler.getRuns(id, 20);  // last 20 runs for a schedule
/*
[
  {
    id: 'run-abc',
    scheduleId: 'sched-xyz',
    status: 'success',
    triggeredAt: '2026-04-27T09:00:00Z',
    completedAt: '2026-04-27T09:00:04Z',
    output: { rows: 142 },
    attempt: 1,
  },
  ...
]
*/
```

`ScheduleRun.status` values: `pending` | `running` | `success` | `failed` | `skipped`

---

## Timezone support

All schedules run in UTC by default. Set `timezone` to any IANA timezone name to evaluate cron expressions locally:

```ts
await scheduler.create({
  name:     'Morning report',
  cronExpr: '0 8 * * 1-5',       // 08:00 in New York, Mon–Fri
  endpoint: 'morning-report',
  enabled:  true,
  timezone: 'America/New_York',
});
```

---

## Payload passing

The `payload` field is forwarded to the handler at runtime:

```ts
scheduler.register('email-blast', async (payload) => {
  const { templateId, audience } = payload as { templateId: string; audience: string };
  await emailAgent.run(`Send template ${templateId} to ${audience} audience`);
});

await scheduler.create({
  name:     'Weekly newsletter',
  cronExpr: '0 10 * * 1',
  endpoint: 'email-blast',
  enabled:  true,
  payload:  { templateId: 'weekly-001', audience: 'pro-subscribers' },
});
```

---

## `ScheduleManagerConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `ScheduleStore` | `InMemoryScheduleStore` | Where schedules are persisted |
| `runStore` | `ScheduleRunStore` | `InMemoryScheduleRunStore` | Where run history is persisted |
| `pollIntervalMs` | `number` | `60_000` | How often to check for due schedules |
| `debug` | `boolean` | `false` | Log schedule checks and executions |

---

## Production persistence

### `DbScheduleStore` — persist to any `AgentDb` backend

`DbScheduleStore` bridges `ScheduleManager` with the `@confused-ai/db` unified storage layer. Plug in any supported backend (SQLite, Postgres, MySQL, MongoDB, Redis, DynamoDB, Turso, JSON) with zero custom glue code:

```ts
import { ScheduleManager, DbScheduleStore } from 'confused-ai/scheduler';
import { SqliteAgentDb } from '@confused-ai/db';

const db        = new SqliteAgentDb({ path: './agent.db' });
const store     = new DbScheduleStore(db);
const scheduler = new ScheduleManager({ store });

// All CRUD goes to agent.db's agent_schedules table — survives process restarts
await scheduler.create({
  name:     'Nightly report',
  cronExpr: '0 2 * * *',
  endpoint: 'nightly-report',
  enabled:  true,
});

scheduler.start();
```

Swap the db instance to switch backends:

```ts
import { PostgresAgentDb, MongoAgentDb } from '@confused-ai/db';

// Postgres
const store = new DbScheduleStore(
  new PostgresAgentDb({ connectionString: process.env.DATABASE_URL! })
);

// MongoDB
const store = new DbScheduleStore(
  new MongoAgentDb({ uri: process.env.MONGO_URI!, dbName: 'myapp' })
);
```

`DbScheduleStore` stores HTTP-only fields (`endpoint`, `method`, `payload`, `timezone`, `maxRetries`, `retryDelaySeconds`) inside the row's `metadata` JSON column since the `agent_schedules` table is backend-agnostic.

### Custom `ScheduleStore`

If you need a fully custom store, implement `ScheduleStore` directly:

```ts
import type { ScheduleStore, ScheduleRunStore } from 'confused-ai';

class PgScheduleStore implements ScheduleStore {
  async get(id: string) { /* SELECT * FROM schedules WHERE id = $1 */ }
  async list(enabledOnly = false) { /* SELECT * FROM schedules ... */ }
  async save(schedule) { /* INSERT OR UPDATE */ }
  async delete(id: string) { /* DELETE FROM schedules WHERE id = $1 */ }
}

const scheduler = new ScheduleManager({
  store:    new PgScheduleStore(),
  runStore: new PgScheduleRunStore(),
});
```

---

## `Schedule` type reference

```ts
interface Schedule {
  readonly id:          string;
  name:                 string;
  cronExpr:             string;    // 5-field cron
  endpoint:             string;    // registered handler key or HTTP URL
  method?:              HttpMethod; // 'POST' etc. — for HTTP-target schedules
  payload?:             unknown;
  timezone?:            string;    // IANA timezone (default: UTC)
  enabled:              boolean;
  nextRunAt?:           string;    // ISO timestamp of next execution
  maxRetries?:          number;
  retryDelaySeconds?:   number;
  readonly createdAt:   string;
  updatedAt:            string;
}
```

---

## Related

- [Background Queues](./background-queues.md) — dispatch work to durable queue backends
- [Agents](./agents.md) — building the handlers that schedules invoke
- [Production](./production.md) — circuit breakers and rate limiting around scheduled work
