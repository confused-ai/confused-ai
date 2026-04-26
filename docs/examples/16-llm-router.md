# 16 · Intelligent LLM Router 🟢

Route every request to the **right model** automatically — cheapest for trivial
questions, most capable for hard reasoning, fastest for latency-sensitive tasks.

## Smart routing (recommended)

For the **strongest default**, use **`createSmartRouter`** — same zero-extra-LLM-call
classifier, but selection uses an **`adaptive`** multi-criteria score (quality, cost,
speed, and how well the model’s `capabilities` match the detected task). Task detection
is **multi-signal** (scores per task type, not “first regex wins”).

```ts
import { createSmartRouter, OpenAIProvider } from 'confused-ai';

const openai = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! });

const router = createSmartRouter([
  {
    provider: openai,
    model: 'gpt-4.1-nano',
    capabilities: ['simple'],
    costTier: 'nano',
    speedTier: 'fast',
    contextWindow: 8_000,
  },
  {
    provider: openai,
    model: 'gpt-4o-mini',
    capabilities: ['simple', 'coding', 'tool_use'],
    costTier: 'small',
    speedTier: 'fast',
    contextWindow: 128_000,
  },
  // … larger models for reasoning / long_context …
]);
```

Tune trade-offs with `adaptiveWeights` (optional): `quality`, `cost`, `speed`,
`capabilityFit`. For full control, pass `classifyTask` and/or `classifyComplexity`
callbacks on `LLMRouter` / `createSmartRouter`.

Use **`scoreTaskTypesForRouting(text, ctx)`** (exported from `confused-ai/llm`) if you
want to log or override task scores in middleware.

Legacy **`createBalancedRouter`** is unchanged: filter by capability, enforce a minimum
quality bar per task, then pick the **cheapest** viable model.

## What you'll learn

- **`createSmartRouter`** vs **`createBalancedRouter`**
- How the built-in multi-signal task classifier works
- Routing strategies: `adaptive`, `balanced`, `cost`, `quality`, `speed`
- How to add override rules for domain-specific routing
- Inspecting route decisions for observability
- Drop-in use with any existing provider

## Why a router?

Different tasks demand different models:

| Task | Best fit |
|------|----------|
| "What time is it in Tokyo?" | `gpt-4.1-nano` — fast & cheap |
| Generating a REST API | `gpt-4.1` or `claude-sonnet-4` — reliable coding |
| Multi-step reasoning / math | `claude-opus-4` or `o3` — frontier quality |
| RAG over 200-page PDF | model with 200 k+ context window |
| Real-time chat UI | fastest model available |

`LLMRouter` classifies every request **without** making extra LLM calls and picks
from your table. **`createSmartRouter`** adds **adaptive** scoring so trade-offs stay
smooth when several models are “good enough.”

## Basic setup

```ts
import {
  createBalancedRouter,
  OpenAIProvider,
  AnthropicProvider,
} from 'confused-ai';

const openai     = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! });
const anthropic  = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY! });

const router = createBalancedRouter([
  {
    provider: openai,
    model: 'gpt-4.1-nano',
    capabilities: ['simple'],
    costTier: 'nano',
    speedTier: 'fast',
    contextWindow: 8_000,
  },
  {
    provider: openai,
    model: 'gpt-4o-mini',
    capabilities: ['simple', 'coding', 'tool_use'],
    costTier: 'small',
    speedTier: 'fast',
    contextWindow: 128_000,
  },
  {
    provider: openai,
    model: 'gpt-4.1',
    capabilities: ['coding', 'creative', 'tool_use'],
    costTier: 'medium',
    speedTier: 'medium',
    contextWindow: 128_000,
  },
  {
    provider: anthropic,
    model: 'claude-sonnet-4',
    capabilities: ['coding', 'reasoning', 'long_context'],
    costTier: 'large',
    speedTier: 'medium',
    contextWindow: 200_000,
  },
  {
    provider: anthropic,
    model: 'claude-opus-4',
    capabilities: ['reasoning', 'creative'],
    costTier: 'frontier',
    speedTier: 'slow',
    contextWindow: 200_000,
    qualityScore: 10,
  },
]);

// Use exactly like any LLMProvider
const result = await router.generateText([
  { role: 'user', content: 'Implement a binary search in TypeScript' },
]);

// Inspect the routing decision
console.log(router.getLastRouteDecision());
// {
//   model: 'gpt-4.1',
//   detectedTask: 'coding',
//   detectedComplexity: 'low',
//   strategy: 'balanced',
//   reason: 'task=coding, complexity=low, strategy=balanced, tokens≈12',
//   estimatedTokens: 12,
// }
```

## Routing strategies

| Strategy | Behaviour |
|----------|-----------|
| `balanced` *(default)* | Cheap for simple tasks; escalates quality as complexity grows |
| `cost` | Always picks the cheapest capable model |
| `quality` | Always picks the highest quality capable model |
| `speed` | Always picks the fastest capable model |

```ts
import { LLMRouter } from 'confused-ai';

const qualityRouter = new LLMRouter({ entries, strategy: 'quality' });
const costRouter    = new LLMRouter({ entries, strategy: 'cost' });
const speedRouter   = new LLMRouter({ entries, strategy: 'speed' });
```

## Task types & how they're detected

| `TaskType` | Detected when… |
|------------|---------------|
| `simple` | Short conversational messages (default) |
| `coding` | Code blocks, language keywords, `debug`/`refactor`/`implement` |
| `reasoning` | `step-by-step`, `analyze`, math/proof terms |
| `creative` | Write a story/poem/blog/email, brainstorm |
| `tool_use` | Tools array is non-empty in `GenerateOptions` |
| `long_context` | Estimated tokens > 6 000 |
| `multimodal` | Message content includes image/audio/video parts |

## Override rules

Rules are evaluated **before** strategy logic and let you hard-wire routing for
specific cases:

```ts
const router = new LLMRouter({
  entries,
  strategy: 'balanced',
  rules: [
    {
      name: 'security-tasks',
      match: (ctx) =>
        ctx.messages.some(
          (m) =>
            typeof m.content === 'string' &&
            /\b(security|vulnerability|CVE|pentest|auth)\b/i.test(m.content),
        ),
      useEntry: 4, // always use claude-opus-4 (index 4)
    },
    {
      name: 'always-fast-for-system',
      match: (ctx) => ctx.messages[0]?.role === 'system' && ctx.estimatedTokens < 200,
      useEntry: 0, // nano model
    },
  ],
});
```

## Drop-in with agents

Because `LLMRouter` implements `LLMProvider`, pass it anywhere a provider is
accepted:

```ts
import { createAgent } from 'confused-ai';

const agent = await createAgent({
  name: 'smart-agent',
  llm: router,       // ← router as the provider
  tools: [...],
  systemPrompt: '...',
});
```

## Observability

```ts
// Single decision
const d = router.getLastRouteDecision();
console.log(`Used ${d?.model} for ${d?.detectedTask} (${d?.detectedComplexity})`);

// Full history
const history = router.getDecisionHistory();
const byModel = Object.groupBy(history, (d) => d.model);
console.log('Calls per model:', Object.fromEntries(
  Object.entries(byModel).map(([m, ds]) => [m, ds!.length])
));

router.clearHistory(); // reset when needed
```

## Custom classifier

Replace the built-in heuristic with your own logic:

```ts
const router = new LLMRouter({
  entries,
  strategy: 'balanced',
  classifyTask: (ctx) => {
    const text = ctx.messages.at(-1)?.content ?? '';
    if (typeof text === 'string' && text.includes('[INTERNAL]')) return 'simple';
    return 'reasoning'; // default to reasoning for everything else
  },
});
```

## Preset factories

| Factory | Strategy |
|---------|----------|
| **`createSmartRouter(entries)`** | **`adaptive`** (recommended) |
| `createBalancedRouter(entries)` | `balanced` |
| `createCostOptimizedRouter(entries)` | `cost` |
| `createQualityFirstRouter(entries)` | `quality` |
| `createSpeedOptimizedRouter(entries)` | `speed` |
