# Compose & Pipe

`compose()` and `pipe()` let you combine agent configurations, hooks, and middleware without subclassing.

## `compose()`

Merge two or more agent hook sets. Both hook sets execute for each event.

```ts
import { compose, defineAgent } from 'fluxion';

const loggingHooks = {
  beforeRun: async (ctx) => console.log('Run started:', ctx.runId),
  afterRun: async (output) => console.log('Run ended'),
};

const tracingHooks = {
  beforeRun: async (ctx) => startTrace(ctx.runId),
  afterRun: async (output, ctx) => endTrace(ctx.runId),
};

// Both hook sets will execute
const myAgent = defineAgent({ model: 'gpt-4o', instructions: '...' })
  .hooks(compose(loggingHooks, tracingHooks));
```

## `pipe()`

Chain transformations sequentially. Each stage receives the output of the previous one. Useful for `buildSystemPrompt` hooks:

```ts
import { pipe, defineAgent } from 'fluxion';

const addUserContext = {
  buildSystemPrompt: async (base, ctx) => {
    const user = await userDb.get(ctx.metadata.userId);
    return `${base}\n\nUser: ${user.name}, Plan: ${user.plan}`;
  },
};

const addDateTime = {
  buildSystemPrompt: async (base) => {
    return `${base}\n\nCurrent date: ${new Date().toISOString()}`;
  },
};

const addFeatureFlags = {
  buildSystemPrompt: async (base, ctx) => {
    const flags = await featureFlags.get(ctx.metadata.userId);
    return flags.betaFeatures ? `${base}\n\nBeta features: enabled` : base;
  },
};

// Prompts are built in order: base → user context → date → feature flags
const myAgent = defineAgent({ model: 'gpt-4o', instructions: 'You are an assistant.' })
  .hooks(pipe(addUserContext, addDateTime, addFeatureFlags));
```

## Combining compose and pipe

```ts
const myAgent = defineAgent({ model: 'gpt-4o', instructions: '...' })
  .hooks(
    compose(
      loggingHooks,
      tracingHooks,
      pipe(addUserContext, addDateTime), // pipe is nested inside compose
    )
  );
```

## Reusable hook packages

Extract hooks into reusable packages:

```ts
// hooks/analytics.ts
export const analyticsHooks = {
  afterRun: async (output, ctx) => {
    await analytics.track('agent_run_completed', {
      runId: ctx.runId,
      model: ctx.model,
      tokens: ctx.tokens,
    });
  },
};

// hooks/rate-limit.ts
export const rateLimitHooks = {
  beforeRun: async (ctx) => {
    const allowed = await rateLimiter.check(ctx.sessionId);
    if (!allowed) return false; // abort run
  },
};

// agent.ts
import { compose, defineAgent } from 'fluxion';
import { analyticsHooks } from './hooks/analytics';
import { rateLimitHooks } from './hooks/rate-limit';

export const myAgent = defineAgent({ model: 'gpt-4o', instructions: '...' })
  .hooks(compose(analyticsHooks, rateLimitHooks));
```
