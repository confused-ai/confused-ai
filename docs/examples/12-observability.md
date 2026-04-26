# 12 · Observability & Hooks 🟡

Hooks give you full visibility into what your agent is doing — every decision,
every tool call, every token spent. Use them for logging, tracing, analytics,
cost tracking, and debugging.

## What you'll learn

- Lifecycle hooks (beforeRun, afterStep, beforeToolCall, etc.)
- Structured logging
- Cost tracking
- Building a debug trace

## All available hooks

```ts
createAgent({
  hooks: {
    // Agent lifecycle
    beforeRun:  (input, ctx)         => void,
    afterRun:   (result, ctx)        => void,
    onError:    (error, ctx)         => void,

    // Each LLM step (one agent "think" = one step)
    beforeStep: (messages, ctx)      => void,
    afterStep:  (response, ctx)      => void,

    // Tool calls
    beforeToolCall: (tool, params, ctx)  => void,
    afterToolCall:  (tool, result, ctx)  => void,

    // Custom system prompt injection
    buildSystemPrompt: (base, ctx)   => string,
  },
});
```

## 1 · Structured Logger

```ts
// structured-logger.ts
import { createAgent } from 'confused-ai';

const agent = createAgent({
  name: 'observed-agent',
  model: 'gpt-4o-mini',
  instructions: 'You are a helpful assistant.',

  hooks: {
    beforeRun: (input, ctx) => {
      console.log(JSON.stringify({
        event: 'agent.run.start',
        input: typeof input === 'string' ? input : '[message array]',
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        timestamp: new Date().toISOString(),
      }));
    },

    afterRun: (result, ctx) => {
      console.log(JSON.stringify({
        event: 'agent.run.complete',
        outputLength: result.text.length,
        steps: result.steps,
        usage: result.usage,             // { promptTokens, completionTokens, totalTokens }
        cost: result.cost,               // cost in USD if tracked
        durationMs: result.durationMs,
        timestamp: new Date().toISOString(),
      }));
    },

    beforeToolCall: (toolName, params, ctx) => {
      console.log(JSON.stringify({
        event: 'tool.call.start',
        tool: toolName,
        params,
        timestamp: new Date().toISOString(),
      }));
    },

    afterToolCall: (toolName, result, ctx) => {
      console.log(JSON.stringify({
        event: 'tool.call.complete',
        tool: toolName,
        resultSize: JSON.stringify(result).length,
        timestamp: new Date().toISOString(),
      }));
    },

    onError: (error, ctx) => {
      console.error(JSON.stringify({
        event: 'agent.error',
        error: error.message,
        stack: error.stack,
        userId: ctx.userId,
        timestamp: new Date().toISOString(),
      }));
    },
  },
});
```

## 2 · Cost Tracker

```ts
// Track spend per user per day
const costStore = new Map<string, number>();

const agent = createAgent({
  model: 'gpt-4o',
  hooks: {
    afterRun: (result, ctx) => {
      const cost = result.cost ?? 0;
      const key = `${ctx.userId}:${new Date().toDateString()}`;
      costStore.set(key, (costStore.get(key) ?? 0) + cost);

      const daily = costStore.get(key)!;
      if (daily > 1.00) {
        console.warn(`User ${ctx.userId} has spent $${daily.toFixed(4)} today`);
      }
    },
  },
});
```

## 3 · Full Debug Trace

Build a detailed trace of everything the agent did:

```ts
import { createAgent } from 'confused-ai';

interface TraceEvent {
  type: string;
  data: unknown;
  ms: number;
}

function createTracedAgent() {
  const trace: TraceEvent[] = [];
  const start = Date.now();

  const agent = createAgent({
    name: 'traced-agent',
    model: 'gpt-4o-mini',
    instructions: 'You are a helpful assistant.',
    hooks: {
      beforeRun:      (input)    => trace.push({ type: 'run_start',      data: { input },         ms: Date.now() - start }),
      afterRun:       (result)   => trace.push({ type: 'run_end',        data: { text: result.text, usage: result.usage }, ms: Date.now() - start }),
      beforeStep:     (messages) => trace.push({ type: 'step_start',     data: { messageCount: messages.length },          ms: Date.now() - start }),
      afterStep:      (response) => trace.push({ type: 'step_end',       data: { content: response.content?.slice(0, 100) }, ms: Date.now() - start }),
      beforeToolCall: (tool, p)  => trace.push({ type: 'tool_call',      data: { tool, params: p },                         ms: Date.now() - start }),
      afterToolCall:  (tool, r)  => trace.push({ type: 'tool_result',    data: { tool, result: r },                         ms: Date.now() - start }),
      onError:        (err)      => trace.push({ type: 'error',          data: { message: err.message },                    ms: Date.now() - start }),
    },
  });

  return {
    agent,
    getTrace: () => trace,
    printTrace: () => {
      console.log('\n=== Agent Trace ===');
      for (const event of trace) {
        console.log(`  [+${event.ms}ms] ${event.type}`, event.data);
      }
      console.log('==================\n');
    },
  };
}

const { agent, printTrace } = createTracedAgent();
await agent.run('Search for TypeScript best practices and summarize the top 3.');
printTrace();
```

Output:
```
=== Agent Trace ===
  [+0ms]    run_start    { input: 'Search for TypeScript best practices...' }
  [+1ms]    step_start   { messageCount: 2 }
  [+812ms]  tool_call    { tool: 'webSearch', params: { query: 'TypeScript best practices 2026' } }
  [+1340ms] tool_result  { tool: 'webSearch', result: { results: [...] } }
  [+1341ms] step_end     { content: 'Based on the search results...' }
  [+1342ms] step_start   { messageCount: 4 }
  [+2100ms] step_end     { content: 'Here are the top 3 TypeScript best practices:...' }
  [+2101ms] run_end      { text: '...', usage: { total: 850 } }
==================
```

## 4 · Send to External Observability Platform

```ts
// Send traces to OpenTelemetry / Datadog / any platform
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('confused-ai');

hooks: {
  beforeRun: (input, ctx) => {
    ctx._span = tracer.startSpan('agent.run', {
      attributes: { 'agent.input': String(input), 'user.id': ctx.userId ?? 'anon' },
    });
  },
  afterRun: (result, ctx) => {
    ctx._span?.setAttributes({ 'agent.tokens': result.usage?.totalTokens });
    ctx._span?.setStatus({ code: SpanStatusCode.OK });
    ctx._span?.end();
  },
  onError: (error, ctx) => {
    ctx._span?.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    ctx._span?.end();
  },
  beforeToolCall: (tool, params, ctx) => {
    ctx._toolSpan = tracer.startSpan(`tool.${tool}`, { parent: ctx._span });
  },
  afterToolCall: (tool, result, ctx) => {
    ctx._toolSpan?.end();
  },
},
```

## 5 · Dynamic System Prompt

Inject real-time context into the agent's instructions:

```ts
hooks: {
  buildSystemPrompt: (baseInstructions, ctx) => {
    const now = new Date().toLocaleString('en-US', { timeZone: 'UTC' });
    const userTier = ctx.metadata?.tier ?? 'free';
    return `${baseInstructions}

Current UTC time: ${now}
User tier: ${userTier}
${userTier === 'free' ? 'Note: Free tier users have limited API calls remaining.' : ''}
    `.trim();
  },
},
```

## What's next?

- [13 · Production Resilience](./13-production) — circuit breakers and fallbacks
