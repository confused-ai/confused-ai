---
title: Scheduler
description: Run agents on a cron schedule with the built-in scheduler.
outline: [2, 3]
---

# Scheduler

`@confused-ai/scheduler` lets you run agents on a schedule using cron expressions.

## Basic usage

```ts
import { ScheduleManager } from 'confused-ai/scheduler';

const scheduler = new ScheduleManager();

// Add a schedule
await scheduler.add({
  id: 'daily-report',
  cron: '0 9 * * *',           // every day at 9am
  handler: async () => {
    const result = await reportAgent.run({
      prompt: 'Generate the daily sales report for today',
    });
    await emailTool.execute({ to: 'team@company.com', body: result.output });
  },
  timezone: 'America/New_York',
  enabled: true,
});

// Start processing
await scheduler.start();
```

## Cron expression reference

```
┌─── minute (0-59)
│ ┌─── hour (0-23)
│ │ ┌─── day of month (1-31)
│ │ │ ┌─── month (1-12)
│ │ │ │ ┌─── day of week (0-6, Sun=0)
* * * * *

Examples:
  0 * * * *    — every hour
  0 9 * * 1-5  — weekdays at 9am
  */15 * * * * — every 15 minutes
  0 0 1 * *    — first of every month at midnight
```

## Validate a cron expression

```ts
import { validateCronExpr, computeNextRun } from 'confused-ai/scheduler';

const result = validateCronExpr('0 9 * * 1-5');
console.log(result.valid);    // true
console.log(result.error);    // undefined

const next = computeNextRun('0 9 * * *', new Date());
console.log(next);            // next 9am
```

## Managing schedules

```ts
// List all schedules
const schedules = await scheduler.list();

// Enable / disable
await scheduler.enable('daily-report');
await scheduler.disable('daily-report');

// Trigger immediately (ignore cron)
await scheduler.trigger('daily-report');

// Remove
await scheduler.remove('daily-report');

// Stop scheduler
await scheduler.stop();
```

## Persistent schedule store (survives restarts)

```ts
import { DbScheduleStore } from 'confused-ai/scheduler';

const store = new DbScheduleStore({ url: 'file:./schedules.db' });

const scheduler = new ScheduleManager({ store });
```
