# LLM Router

The `LLMRouter` implements the `LLMProvider` interface and **automatically selects the best model** for each request based on task type and an optimisation strategy. Drop it in anywhere a model name or `LLMProvider` is accepted.

## Quick start

```ts
import { createBalancedRouter } from 'fluxion/llm';
import { createAgent } from 'fluxion';

const llm = createBalancedRouter(); // balances cost vs quality vs speed

const agent = createAgent({
  name: 'assistant',
  llm,
  instructions: 'You are a helpful assistant.',
});
```

## Strategies

Four built-in factory functions, each pre-configured with model preferences:

| Factory | Strategy | Description |
|---------|----------|-------------|
| `createBalancedRouter()` | `balanced` | Balances cost, quality, and speed for each task type |
| `createCostOptimizedRouter()` | `cost` | Always picks the cheapest capable model |
| `createQualityFirstRouter()` | `quality` | Always picks the highest-quality model regardless of cost |
| `createSpeedOptimizedRouter()` | `speed` | Minimises latency — picks the fastest available model |

```ts
import {
  createBalancedRouter,
  createCostOptimizedRouter,
  createQualityFirstRouter,
  createSpeedOptimizedRouter,
} from 'fluxion/llm';

const balanced  = createBalancedRouter();
const cheap     = createCostOptimizedRouter();
const best      = createQualityFirstRouter();
const fast      = createSpeedOptimizedRouter();
```

## Task types

The router classifies each request and selects a model accordingly:

| Task type | Examples | Best strategy |
|-----------|---------|---------------|
| `simple` | Formatting, classification, yes/no | `cost` or `speed` |
| `coding` | Writing, reviewing, debugging code | `quality` |
| `reasoning` | Math, logic puzzles, planning | `quality` |
| `creative` | Stories, marketing copy, brainstorming | `balanced` |
| `tool_use` | Agents with tool calls | `balanced` |
| `long_context` | Documents > 32k tokens | `balanced` (context-window aware) |
| `multimodal` | Images, audio, video inputs | `quality` |

You can hint the task type explicitly:

```ts
const result = await agent.run('Write a merge sort', {
  metadata: { taskType: 'coding' }, // → router picks a coding-optimised model
});
```

## Custom router with `LLMRouter`

```ts
import { LLMRouter } from 'fluxion/llm';
import { OpenAIProvider, AnthropicProvider } from 'fluxion/llm';

const router = new LLMRouter({
  strategy: 'balanced',
  providers: [
    { taskTypes: ['coding', 'reasoning'], provider: new AnthropicProvider({ model: 'claude-opus-4-5' }) },
    { taskTypes: ['simple', 'creative'],  provider: new OpenAIProvider({ model: 'gpt-4o-mini' }) },
    { taskTypes: ['tool_use'],            provider: new OpenAIProvider({ model: 'gpt-4o' }) },
  ],
  fallback: new OpenAIProvider({ model: 'gpt-4o-mini' }), // used when no match
});
```

## Use in a multi-agent team

Each agent in a team can use the same router — the router selects the optimal model per request:

```ts
import { createBalancedRouter, createCostOptimizedRouter } from 'fluxion/llm';
import { createAgent } from 'fluxion';

const researchAgent = createAgent({
  name:         'researcher',
  llm:          createQualityFirstRouter(), // best model for deep reasoning
  instructions: 'Research and summarise information.',
});

const draftAgent = createAgent({
  name:         'drafter',
  llm:          createBalancedRouter(),     // balanced for writing tasks
  instructions: 'Write a blog post from the research.',
});
```

## `LLMRouter` API reference

`LLMRouter` implements `LLMProvider` — every method that accepts a model name or provider also accepts `LLMRouter`:

```ts
class LLMRouter implements LLMProvider {
  constructor(config: LLMRouterConfig);
  chat(messages, options?): Promise<LLMResponse>;
  stream(messages, options?): AsyncIterable<LLMChunk>;
}
```

Factory functions take no required arguments. All models default to reading API keys from standard environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.).

::: tip See it in action
The [LLM Router example](../examples/16-llm-router.md) shows a complete multi-agent pipeline with cost, quality, and speed variants side-by-side.
:::
