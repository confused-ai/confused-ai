# Plugins

Plugins are reusable middleware you attach to agents via `.use()`. They can intercept hooks, add tools, modify config, and share state.

## Built-in plugins

### Logging plugin

```ts
import { loggingPlugin } from 'confused-ai/plugins';
import { defineAgent } from 'confused-ai';

const myAgent = defineAgent({ model: 'gpt-4o', instructions: '...' })
  .use(loggingPlugin({ level: 'info' }));
```

### Rate limit plugin

```ts
import { rateLimitPlugin } from 'confused-ai/plugins';

const myAgent = defineAgent({ model: 'gpt-4o', instructions: '...' })
  .use(rateLimitPlugin({
    requestsPerMinute: 60,
    tokensPerMinute: 100_000,
    perUser: true,
  }));
```

### Telemetry plugin

```ts
import { telemetryPlugin } from 'confused-ai/plugins';

const myAgent = defineAgent({ model: 'gpt-4o', instructions: '...' })
  .use(telemetryPlugin({
    serviceName: 'my-agent-service',
    otlpEndpoint: 'http://localhost:4318',
  }));
```

## Custom plugins

A plugin is a function that receives and optionally modifies agent config:

```ts
import type { AgentPlugin } from 'confused-ai/plugins';

const myPlugin: AgentPlugin = (config) => ({
  ...config,
  hooks: {
    ...config.hooks,
    beforeRun: async (ctx) => {
      // your logic here
      return config.hooks?.beforeRun?.(ctx);
    },
  },
});

const myAgent = defineAgent({ model: 'gpt-4o', instructions: '...' })
  .use(myPlugin);
```

## Parameterized plugins

```ts
import type { AgentPlugin } from 'confused-ai/plugins';

function auditPlugin(options: { store: Storage }): AgentPlugin {
  return (config) => ({
    ...config,
    hooks: {
      ...config.hooks,
      afterRun: async (output, ctx) => {
        await options.store.set(`audit:${ctx.runId}`, {
          input: ctx.input,
          output,
          timestamp: Date.now(),
          model: ctx.model,
        });
        return config.hooks?.afterRun?.(output, ctx);
      },
    },
  });
}

const store = createStorage({ driver: 'file', basePath: './audit-log' });
const myAgent = defineAgent({ model: 'gpt-4o', instructions: '...' })
  .use(auditPlugin({ store }));
```

## Composing plugins

```ts
const myAgent = defineAgent({ model: 'gpt-4o', instructions: '...' })
  .use(loggingPlugin({ level: 'debug' }))
  .use(rateLimitPlugin({ requestsPerMinute: 30 }))
  .use(telemetryPlugin({ serviceName: 'my-service' }))
  .use(auditPlugin({ store }));
```
