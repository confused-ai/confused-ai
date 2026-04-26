# 20 · Scheduled Agent Jobs: Nightly Market Digest 🔴

**Real-world problem:** Your fintech team needs a bot that wakes up at 09:00 every weekday, pulls the previous day's market snapshot, and delivers a 5-bullet digest to Slack (or email, or a database).

`ScheduleManager` handles cron-based job scheduling with in-process handlers, run history, retry logic, and enable/disable without code changes.

---

## What you'll learn

- `ScheduleManager` — CRUD for schedules backed by a pluggable store
- Register in-process handlers by key (no HTTP endpoints required)
- Run history with `ScheduleRunStore` — query past executions
- Enable / disable schedules at runtime (e.g. pause over weekend)
- Multiple concurrent schedules in the same process
- Pattern to wire a real agent as the handler

---

## The problem

| Requirement | How |
|---|---|
| Trigger at 09:00 weekdays | cron `0 9 * * 1-5` |
| Pull market data | handler function |
| Summarise with an agent | agent inside handler |
| Deliver to Slack | handler calls Slack API |
| Retry on failure | `maxRetries: 2` |
| History for audit | `ScheduleRunStore` |
| Pause over weekend | `update(id, { enabled: false })` |

---

## Setup

```ts
import {
  ScheduleManager,
  InMemoryScheduleStore,
  InMemoryScheduleRunStore,
} from 'confused-ai/scheduler';
```

---

## 1 · Create the manager

```ts
const manager = new ScheduleManager({
  store:           new InMemoryScheduleStore(),    // swap for SqliteScheduleStore in prod
  runStore:        new InMemoryScheduleRunStore(),
  pollIntervalMs:  60_000,   // check for due schedules every minute
  debug:           false,
});
```

---

## 2 · Register a handler

Handlers are registered by **key** — the same key used in the schedule's `endpoint` field.

```ts
import { createAgent } from 'confused-ai';

const digestAgent = createAgent({
  name: 'MarketDigestAgent',
  model: 'gpt-4o-mini',
  instructions: `
    You are a market analyst. You receive a raw market snapshot and
    produce a concise 5-bullet digest suitable for Slack.
    Format: plain text, no markdown headers.
  `,
  tools: false,
});

manager.register('market-digest', async () => {
  // 1. Fetch market data (replace with your real API)
  const snapshot = await fetchMarketData();

  // 2. Summarise with the agent
  const result = await digestAgent.run(JSON.stringify(snapshot));

  // 3. Deliver (replace with your Slack/email/DB call)
  await slack.chat.postMessage({
    channel: '#market-updates',
    text: result.text,
  });

  return { delivered: true, chars: result.text.length };
});
```

---

## 3 · Create the schedule

```ts
const id = await manager.create({
  name:               'Nightly Market Digest',
  cronExpr:           '0 9 * * 1-5',   // 09:00 Mon–Fri
  endpoint:           'market-digest',  // matches registered handler key
  enabled:            true,
  maxRetries:         2,
  retryDelaySeconds:  30,
});

console.log('Schedule created:', id);
```

### Cron syntax (5-field)

```
┌──── minute   (0–59)
│ ┌─── hour    (0–23)
│ │ ┌── dom    (1–31)
│ │ │ ┌─ month  (1–12)
│ │ │ │ ┌ dow   (0–7, 0+7=Sunday)
│ │ │ │ │
0 9 * * 1-5    → 09:00, Monday through Friday
0 */4 * * *    → every 4 hours
30 8 1 * *     → 08:30 on the 1st of every month
*/5 * * * *    → every 5 minutes
```

---

## 4 · Start the poll loop

```ts
manager.start();  // begins polling on the pollIntervalMs interval

// Graceful shutdown
process.on('SIGTERM', () => {
  manager.stop();
  process.exit(0);
});
```

---

## 5 · Manual trigger (backfill / test)

```ts
// Fire a specific schedule right now, regardless of cron
await manager.triggerNow(id);
```

---

## 6 · Query run history

```ts
const runs = await manager.listRuns(id, 20);

for (const run of runs) {
  const duration = run.completedAt
    ? `${new Date(run.completedAt).getTime() - new Date(run.triggeredAt).getTime()}ms`
    : 'in-progress';

  console.log(`[${run.status}] ${run.triggeredAt} (${duration})`);

  if (run.status === 'failed') {
    console.log(`  Error: ${run.error}`);
    console.log(`  Attempt: ${run.attempt}`);
  }
}
```

| `ScheduleStatus` | Meaning |
|---|---|
| `pending` | Queued, not yet started |
| `running` | Handler currently executing |
| `success` | Completed without error |
| `failed` | Handler threw; retries exhausted |
| `skipped` | Schedule was disabled when due |

---

## 7 · Enable / disable at runtime

```ts
// Pause over the weekend without code changes
await manager.update(id, { enabled: false });

// Resume Monday morning
await manager.update(id, { enabled: true });

// Change the cron expression live (takes effect on next poll)
await manager.update(id, { cronExpr: '0 8 * * 1-5' }); // moved to 08:00
```

---

## 8 · Add a second schedule — hourly health ping

```ts
manager.register('health-ping', async () => {
  const ok = await myInfra.healthCheck();
  if (!ok) await pagerDuty.trigger('infra-health-check-failed');
  return { ok };
});

await manager.create({
  name:     'Hourly Health Ping',
  cronExpr: '0 * * * *',   // top of every hour
  endpoint: 'health-ping',
  enabled:  true,
  maxRetries: 1,
  retryDelaySeconds: 5,
});
```

---

## 9 · Production: persistent store

Swap `InMemoryScheduleStore` for `SqliteScheduleStore` (or your own adapter) so schedules survive restarts:

```ts
import { SqliteScheduleStore, SqliteScheduleRunStore } from 'confused-ai/scheduler';

const manager = new ScheduleManager({
  store:    new SqliteScheduleStore('./schedules.db'),
  runStore: new SqliteScheduleRunStore('./schedules.db'),
  pollIntervalMs: 60_000,
});
```

Your schedule registry, next-run timestamps, and full run history now survive process restarts — no re-registration needed.

---

## Complete wiring pattern

```ts
// scheduler.ts — production entry point
import { ScheduleManager, SqliteScheduleStore, SqliteScheduleRunStore } from 'confused-ai/scheduler';
import { createAgent } from 'confused-ai';

const manager = new ScheduleManager({
  store:    new SqliteScheduleStore('./schedules.db'),
  runStore: new SqliteScheduleRunStore('./schedules.db'),
  pollIntervalMs: 60_000,
});

// Register all handlers
manager.register('market-digest',  marketDigestHandler);
manager.register('health-ping',    healthPingHandler);
manager.register('weekly-report',  weeklyReportHandler);
manager.register('cleanup-old-sessions', cleanupHandler);

// Ensure schedules exist (create only if not already saved)
await seedSchedules(manager);

// Start
manager.start();

process.on('SIGTERM', () => { manager.stop(); process.exit(0); });
```

---

## Runnable example

```bash
bun examples/scheduled-agent.ts
```

Runs without an API key — uses simulated market data. Demonstrates CRUD, manual trigger, history, enable/disable, and multi-schedule setup.

---

## Related

- [Production Resilience](./13-production) — wrap handlers in circuit breakers
- [Observability & Hooks](./12-observability) — log every run with structured telemetry
- [Full framework showcase](./17-full-framework-showcase) — see scheduler in a complete system
- **Guide:** [Scheduler](../guide/scheduler) — full API reference
