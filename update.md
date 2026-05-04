# confused-ai — Lightweight Architecture Guide

> How to keep the framework production-grade without becoming bloated.
> This pairs with PRODUCTION_UPGRADE.md — read that for resilience and security changes; read this for the structural decisions that keep the bundle small and the API clean.

---

## The Guiding Principle

**Thin core. Opt-in everything. No surprises on `npm install`.**

A developer who just wants `createAgent` + `openai()` should get ~15 KB installed, not 50 MB of transitive dependencies. Every production feature (HTTP runtime, RAG, graph engine, observability) is available — but only when explicitly imported.

Compare:
| What you use | What installs |
|---|---|
| `import { createAgent } from 'confused-ai'` | core (~13 KB) + zod (peer dep) |
| `+ openai('gpt-4o')` | + openai SDK (peer dep, already in your project) |
| `+ createHttpService(...)` | + confused-ai/serve (~18 KB) + express (peer dep) |
| `+ KnowledgeEngine(...)` | + confused-ai/knowledge (~14 KB) + your chosen vector store adapter |

---

## Rule 1 — The Core Has Exactly One Dependency

`packages/core/package.json` must list only `zod` as a dependency (not peer, not optional — it is always needed for tool schema validation).

Everything else is either:
- a **peer dep** (you install it, we wrap it), or
- an **optional peer dep** (install only if you use that feature), or
- **lazy-required** inside the function that needs it (not at module load time).

```json
{
  "name": "@confused-ai/core",
  "dependencies": {
    "zod": ">=3.22.0"
  },
  "peerDependencies": {},
  "optionalDependencies": {}
}
```

If a PR to `packages/core` adds any dependency other than zod, it is rejected.

---

## Rule 2 — LLM SDKs Are Always Peer Dependencies

The model adapters in `packages/models` never bundle the upstream SDK.

```
packages/models/
  src/
    openai.ts      # wraps `openai` SDK — peer dep
    anthropic.ts   # wraps `@anthropic-ai/sdk` — peer dep
    google.ts      # wraps `@google/generative-ai` — peer dep
    ollama.ts      # wraps `ollama` — peer dep
```

Each adapter file is ~60 lines. The SDK is imported at the top of the file but declared as an optional peer dep — if the user hasn't installed it, the import throws a clean error message:

```ts
// packages/models/src/openai.ts
let OpenAI: typeof import('openai').default;
try {
  OpenAI = (await import('openai')).default;
} catch {
  throw new Error(
    '[confused-ai] openai adapter requires the openai package: npm install openai'
  );
}
```

`packages/models/package.json`:
```json
{
  "peerDependencies": {
    "openai":              ">=4.0.0",
    "@anthropic-ai/sdk":   ">=0.30.0",
    "@google/generative-ai": ">=0.5.0",
    "ollama":              ">=0.5.0"
  },
  "peerDependenciesMeta": {
    "openai":              { "optional": true },
    "@anthropic-ai/sdk":   { "optional": true },
    "@google/generative-ai": { "optional": true },
    "ollama":              { "optional": true }
  }
}
```

---

## Rule 3 — Heavy Tools Are Lazy-Required

Tools that need a heavy driver (database, browser, object storage) must not import that driver at module load time. They lazy-require it inside `execute()`:

```ts
// packages/tools/src/postgresql-tool.ts
export class PostgreSQLTool extends BaseTool {
  private pool: unknown = null;

  async execute(input: { query: string }) {
    if (!this.pool) {
      // Fails fast with a clear message if pg isn't installed
      const { Pool } = await import('pg').catch(() => {
        throw new Error('[confused-ai] PostgreSQLTool requires pg: npm install pg');
      });
      this.pool = new Pool(this.opts.connection);
    }
    return (this.pool as import('pg').Pool).query(input.query);
  }
}
```

Tools that only use built-in Node.js APIs (`node:fs`, `node:crypto`, `node:child_process`) can import eagerly — they add zero bundle cost.

Heavy-dep tools and their peer deps:
| Tool | Peer dep |
|---|---|
| `PostgreSQLTool` | `pg` |
| `MySQLTool` | `mysql2` |
| `RedisTool` | `ioredis` |
| `BrowserTool` | `puppeteer` |
| `S3Tool` | `@aws-sdk/client-s3` |
| `GitHubTool` | `@octokit/rest` |
| `StripeTool` | `stripe` |

---

## Rule 4 — `sideEffects: false` on Every Package

Every `package.json` in the monorepo must declare:

```json
{ "sideEffects": false }
```

The only exceptions are packages that register polyfills or global patches — those must explicitly list the affected files:

```json
{ "sideEffects": ["./dist/register-otel.mjs"] }
```

This lets bundlers (webpack, rollup, esbuild) safely tree-shake entire packages when their imports are unused. Importing `confused-ai` and using only `createAgent` must not pull in the graph engine, HTTP runtime, or voice module.

---

## Rule 5 — Separate Entry Points, No Barrel Re-Exports

The root `confused-ai` package is a convenience re-export. It must **not** be a single-barrel file that imports everything — that defeats tree-shaking.

```
confused-ai (root)
├── package.json        # re-exports via "exports" map
└── src/
    └── index.ts        # only re-exports from @confused-ai/core
```

Each subpath is a completely independent entry point in `tsup.config.ts`:

```ts
// packages/core/tsup.config.ts
export default defineConfig({
  entry: {
    index:    'src/index.ts',
    agent:    'src/agent.ts',
    tool:     'src/tool.ts',
    session:  'src/session.ts',
  },
  splitting:  true,   // code-split shared internals
  treeshake:  true,
  format:     ['esm', 'cjs'],
  dts:        true,
});
```

The `exports` map in the root `package.json` then points each subpath to its own pre-built chunk — no dynamic bundling at runtime.

---

## Rule 6 — The API Surface Must Stay Small

Every new public export has a cost: it adds to the mental model every user must maintain. New functionality must earn its place in the public API.

**Hierarchy of options (prefer earlier):**

1. **Do it inside `createAgent` options** — if the feature is universally useful and adds <5 lines to the options object.
2. **Export a standalone function** — if the feature is optional and composable.
3. **Export a class** — only when the feature is stateful and has a clear lifecycle (connect → use → close).
4. **New subpath package** — only when the feature has its own heavy dependency tree.

**What should NOT be exported:**
- Internal helper functions used only inside the package
- Implementation details of adapters (e.g. the raw Postgres `Pool` instance)
- Anything that would cause a breaking change on the next refactor

---

## Rule 7 — Keep the Default Quickstart Zero-Config

The three-line quickstart must always work with zero configuration files:

```ts
import { agent } from 'confused-ai';

const ai = agent('You are a helpful assistant.');
const { text } = await ai.run('What is 2 + 2?');
```

This means:
- `agent()` picks a sensible default model from whatever `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` is set in `process.env`
- It uses in-memory session storage by default
- It uses a console logger in dev mode, silent in production
- It does not require any config files, init calls, or setup functions

Progressive complexity is opt-in:

```ts
// Level 1 — works immediately
const ai = agent('You are a helpful assistant.');

// Level 2 — add tools
const ai = createAgent({ instructions: '...', tools: [new HttpClientTool()] });

// Level 3 — add persistence + budget
const ai = createAgent({ ..., sessionStore: createSqliteSessionStore(), budget: { maxUsdPerRun: 0.10 } });

// Level 4 — full production stack
const service = createHttpService({ agents: { support: ai }, cors: '*', auditStore: ... });
```

Each level builds on the previous. No level requires re-reading the docs for the previous one.

---

## Rule 8 — No Class Inheritance in the Public API

Inheritance creates tight coupling between the user's code and the framework's internals. If we rename a base class method, every user who extended it breaks.

**Instead of:**
```ts
class MyTool extends BaseTool {
  async execute(input: { orderId: string }) { ... }
}
```

**Use the factory function:**
```ts
const myTool = tool({
  name:        'lookupOrder',
  description: 'Look up an order by ID',
  parameters:  z.object({ orderId: z.string() }),
  execute:     async ({ orderId }) => db.orders.findById(orderId),
});
```

The `tool()` factory is a plain function that returns a plain object. It is not a class. Users can compose, spread, and mock it without knowing anything about how the framework works internally.

`BaseTool` can exist internally for the 100+ built-in tools — it must not be a required part of the public API for custom tools.

---

## Rule 9 — Error Messages Must Guide the Fix

Every error thrown by the framework must include:
1. What went wrong (specific, not generic)
2. What the user should do to fix it

```ts
// Bad
throw new Error('Invalid configuration');

// Good
throw new ConfusedAIError({
  code:    ERROR_CODES.VALIDATION_FAILED,
  message: `createAgent: 'budget.maxUsdPerRun' must be a positive number, got ${JSON.stringify(value)}. ` +
           `Pass a value like: budget: { maxUsdPerRun: 0.10 }`,
});
```

This is especially important for the "lazy dep" errors:
```ts
throw new Error(
  `[confused-ai] PostgreSQLTool requires the pg package.\n` +
  `Install it: npm install pg\n` +
  `Or: yarn add pg / pnpm add pg`
);
```

---

## Rule 10 — Benchmark the Bundle on Every PR

Add a CI step that fails if any package exceeds its size budget:

```yaml
# .github/workflows/bundle-size.yml
- name: Check bundle sizes
  run: |
    node scripts/check-bundle-sizes.mjs
```

```js
// scripts/check-bundle-sizes.mjs
const BUDGETS = {
  '@confused-ai/core':     15_000,   // 15 KB
  '@confused-ai/models':    3_000,   //  3 KB
  '@confused-ai/tools':     2_000,   //  2 KB per tool (checked individually)
  '@confused-ai/serve':    20_000,   // 20 KB
  '@confused-ai/graph':    12_000,   // 12 KB
  '@confused-ai/guard':     8_000,   //  8 KB
  '@confused-ai/observe':  13_000,   // 13 KB
  '@confused-ai/knowledge': 16_000,  // 16 KB
};

for (const [pkg, budget] of Object.entries(BUDGETS)) {
  const { size } = await stat(`packages/${pkg.split('/')[1]}/dist/index.mjs`);
  if (size > budget) {
    console.error(`${pkg}: ${size}B exceeds budget of ${budget}B`);
    process.exit(1);
  }
}
```

---

## What to Cut From the Current Codebase

Several things in the README describe features that, if implemented naively, would bloat the core. Here's how to handle each:

### LLM Router — move to `confused-ai/router`
The `createCostOptimizedRouter` currently lives in the main barrel. It has no place there — move it to its own subpath. Users who want smart routing opt in; everyone else pays nothing.

### Multi-Agent Orchestrator — move to `confused-ai/workflow`
`MultiAgentOrchestrator`, `compose()`, `createSupervisor()`, `createSwarm()` all belong in `/workflow`. They require stateful coordination logic that should not be in the agent runner.

### Voice — move to `confused-ai/voice` (already correct)
Keep as-is. Just verify ElevenLabs SDK is an optional peer dep, not a bundled dependency.

### Guardrails — keep in `confused-ai/guard` but make `createAgent`'s `guardrails` option accept the interface, not a class
Users should be able to pass any object that satisfies `{ validate(input: string): Promise<void> }` — not be forced to extend a framework class.

### Audit & Idempotency — keep in `confused-ai/serve` (not core)
These are HTTP-layer concerns. The agent runner itself should not know about idempotency keys — only the HTTP service layer needs them.

---

## Folder Structure After Changes

```
packages/
├── contracts/      # ~1 KB  — zero deps, types only
├── core/           # ~13 KB — agent runner, zod only
├── models/         # ~2 KB  — LLM adapters, all SDKs are peer deps
├── tools/          # ~0.5 KB each — lazy heavy deps
├── workflow/       # ~10 KB — pipelines, orchestrator (opt-in)
├── guard/          # ~8 KB  — circuit breaker, rate limit, budget (opt-in)
├── serve/          # ~18 KB — HTTP runtime (opt-in)
├── observe/        # ~11 KB — OTEL, structured logger (opt-in)
├── knowledge/      # ~14 KB — RAG, loaders, vector stores (opt-in)
├── graph/          # ~9 KB  — durable graph executor (opt-in)
├── session/        # ~4 KB  — session stores (opt-in)
├── voice/          # ~7 KB  — TTS/STT (opt-in)
├── router/         # ~5 KB  — LLM router (opt-in)
└── test-utils/     # ~6 KB  — mocks, scenario builder (devDep only)

adapters/ (separate packages, installed independently)
├── adapter-redis/
├── adapter-postgres/
├── adapter-pinecone/
├── adapter-qdrant/
└── adapter-s3/
```

Minimum install (quickstart): **~15 KB**
Full install (every opt-in): **~115 KB**
Peer deps (SDKs): **user-controlled**

---

## Summary Checklist

Before every release, verify:

- [ ] `packages/core/package.json` lists only `zod` as a non-peer dependency
- [ ] Every LLM SDK is a peer dep in `packages/models`
- [ ] Every heavy tool uses lazy `import()` inside `execute()`
- [ ] Every package has `"sideEffects": false`
- [ ] The three-line quickstart still works with zero config
- [ ] No public API exports use class inheritance
- [ ] Every error message includes a fix suggestion
- [ ] Bundle size CI step passes all budgets
- [ ] No new export added to the root barrel without a subpath entry point