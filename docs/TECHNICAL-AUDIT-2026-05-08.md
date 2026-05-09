# Technical Architecture Audit - May 8, 2026

## Executive Verdict

`confused-ai` is already beyond a prototype framework. It has a large TypeScript-first ecosystem, 39 workspace packages, strict repository typechecking, a passing test suite, broad provider/tool/memory/orchestration coverage, and production primitives that many competing agent frameworks treat as external concerns.

The next leap is not more feature breadth. The framework needs consolidation, stricter release gates, typed runtime contracts, bounded concurrency, adapter hardening, and removal or demotion of placeholder surfaces. The main architectural risk is that the codebase has several overlapping implementations of the same concepts: root `src/*` compatibility APIs, package-level APIs, duplicate tool implementations, multiple graph/workflow engines, and parallel production primitives. This creates a serious long-term maintainability and DX cost.

Current validation baseline:

| Gate | Result | Notes |
|---|---:|---|
| `bun run typecheck` | Pass | `tsc -p tsconfig.typecheck.json` completed cleanly. |
| `bun run test` | Pass | **1 569 passing, 12 skipped** (72 test files) as of May 9 2026. |
| `bun run lint` | Fail | Legacy `src/**` lint config lacks the TypeScript ESLint plugin while file comments reference plugin rules; boundaries rule is deprecated. |
| `bun run lint:packages` | **Pass** | **0 errors, 2 warnings** (under `--max-warnings 10`) as of May 9 2026. Was 982 problems at audit time; fixed: unnecessary type assertions, confusing void expressions, tautological conditions, unnecessary optional chains. |

Overall grade: B+ today, with a credible path to A/A+ if the next phase prioritizes consolidation over expansion.

## Highest Priority Findings

### P0 - Release Gate And API Integrity

1. `lint` and `lint:packages` are not shippable gates.
   - Root lint fails because the legacy `src/**` config has `eslint-plugin-boundaries` only, while source comments disable `@typescript-eslint/*` rules that are not registered for that block.
   - Package lint has 956 errors. Some are mechanical, but others reveal unsafe typing (`any`, unsafe assignments, `require`, `@ts-ignore`, unsafe stringification, no-base-to-string).
   - Action: make `bun run lint:packages` pass before adding more architecture. Then migrate `eslint.config.js` from deprecated `boundaries/element-types` to `boundaries/dependencies` and register TypeScript ESLint consistently.

2. The root package export map exposes `./extensions`, but `tsup.config.ts` has no `extensions` entry and no `src/extensions*` source exists.
   - This is a packaging correctness bug: consumers may import an advertised subpath that cannot be built.
   - Action: either remove `./extensions` from `package.json` or add a real `src/extensions/index.ts` entry that re-exports `@confused-ai/contracts/extensions`.

3. Public API layers overlap too heavily.
   - `src/create-agent/factory.ts` and `packages/core/src/agent.ts` both provide agent factories and session orchestration behavior.
   - `packages/agentic` has the modern runner, while `packages/core/src/runner/agent-runner.ts` still carries a separate loop.
   - Action: declare one canonical runtime path for v2 and mark the compatibility path as a thin adapter with tests proving parity.

4. Tool/schema typing is duplicated and brittle.
   - `packages/tools/src/core/tool-helper.ts`, `packages/agentic/src/_zod-to-schema.ts`, and root provider schema conversion all hand-roll Zod introspection through `_def`.
   - Action: introduce a single `@confused-ai/schema` or `packages/contracts/src/schema.ts` adapter for Zod 3/4, JSON Schema, OpenAI tool schema, Anthropic tool schema, and typed structured outputs.

### P0 - Production Runtime Safety

5. Agentic tool execution is unbounded inside each LLM step.
   - `packages/agentic/src/runner.ts` dispatches tool calls with `Promise.all` and no per-run concurrency cap.
   - A model that emits 50 tool calls can saturate outbound APIs, local resources, or thread pools.
   - Action: add `toolConcurrency?: number`, default to a conservative value such as 4 or 8, and expose queue depth metrics.

6. Several timeout races do not clear timer handles or propagate abort signals deeply enough.
   - `packages/graph/src/engine.ts` uses `Promise.race` with `setTimeout` in node execution and does not clear the timer after normal completion.
   - `packages/orchestration/src/multi-agent/swarm.ts` does the same for subtasks.
   - Action: use the existing `@confused-ai/guard` timeout primitive everywhere and pass `AbortSignal` through graph node, tool, provider, and subagent contexts.

7. IDs use `Date.now()` plus `Math.random()` in core session/agent IDs, memory IDs, artifact IDs, and traces.
   - This is weak for distributed systems, tests, and trace correlation.
   - Action: add branded IDs plus `crypto.randomUUID()` or ULID generation with injectable ID providers for deterministic tests.

8. Vector memory durability is incomplete.
   - `VectorMemoryStore.get()` only checks an in-process cache and returns `null` after restart.
   - Action: extend `VectorStoreAdapter` with `get(ids)`/`fetchByIds`, or persist canonical memory metadata in `AgentDb` and treat vector DBs as secondary indexes.

9. `PostgresAgentDb.close()` drops the pool reference without awaiting `pool.end()`.
   - This can leak connections in serverless, tests, and graceful shutdown flows.
   - Action: call `await this._pool?.end()` and add lifecycle tests for every DB adapter.

10. JWT verification is useful but too narrow for enterprise defaults.
    - `packages/serve/src/auth.ts` verifies HS256 and `exp`, but not issuer, audience, `nbf`, `jti`, clock tolerance, JWKS, key rotation, or token replay.
    - Action: keep zero-dependency HS256 for tests/dev, but add a production `JwtVerifier` interface plus JWKS/issuer/audience implementation.

## Overengineering And Unnecessary Complexity Flags

These are not criticisms of ambition; they are places where complexity is currently ahead of proven value or API maturity.

| Flag | Why It Is Overbuilt | Recommendation |
|---|---|---|
| Multiple agent factories and runners | Root `src/create-agent`, package `core`, and package `agentic` all have overlapping lifecycle/session/runtime logic. | Make `packages/agentic` the canonical runtime and reduce root/core to typed facade adapters. |
| Multiple graph/workflow/orchestration engines | `graph`, `execution`, `workflow`, `orchestration`, `scheduler`, and `sdk` overlap in concepts: DAGs, workflows, teams, routing, scheduling. | Publish one execution model matrix: simple pipeline, durable graph, distributed worker. Deprecate or hide redundant surfaces. |
| Placeholder swarm intelligence | `SwarmOrchestrator` has rule-based decomposition and placeholder subagent logic when no LLM is configured. | Move placeholder mode to examples or mark experimental; production API should require an explicit planner/decomposer. |
| Duplicate shell tools | `packages/tools/src/shell.ts` has safe default-deny behavior, while `packages/tools/src/utils/shell.ts` has different command-string semantics and class-based API. | Keep one implementation; adapt legacy entrypoints to it. |
| Hand-written Zod internals in several places | Using `_def` across packages multiplies breakage risk and weakens structured output fidelity. | Centralize schema conversion and test against Zod 3 and 4 fixtures. |
| Broad built-in tool catalog | Tool breadth is marketable but raises maintenance, security, and lint cost. | Split into core tools, community integrations, and optional packs with explicit security profiles. |
| Built-in HS256 JWT implementation | Zero-dependency is nice, but enterprise auth is more about key management, issuer/audience policy, and JWKS. | Keep as a helper; do not position it as the production default. |
| Video/voice/media in the same top-level ecosystem | Impressive, but peripheral to the core agent orchestration engine and increases package surface. | Keep as optional extensions; ensure they never affect core build/lint/test gates. |
| Static-only toolkit classes | Lint flags several classes with only static members. | Replace with plain factory functions for tree-shaking and simpler DX. |
| Docs ahead of implementation freshness | Existing docs still list some gaps that code has already closed: `defineRole`, `createTeam`, memory tools, summary buffer, default-deny shell wrapper. | Add a docs freshness gate: roadmap claims must link to tests or implementation files. |

## Module-by-Module Audit

### Core And Public API

| Module | Current Strength | Scalability / Fault Tolerance / Performance | DX / Type Safety | Competitor Gap | Actions |
|---|---|---|---|---|---|
| Root `confused-ai` export barrel | Very discoverable one-package API; subpaths cover most capabilities. | Export map drift can break consumers; umbrella import risks large bundles despite `sideEffects: false`. | Re-export breadth weakens clear ownership. | Vercel AI SDK has a narrower, cleaner API surface. | Fix `./extensions`; document canonical imports; add package export smoke tests. |
| `packages/core` | Clean primitives, Map tool registry, core interfaces. | ID generation is not distributed-safe; stream queue uses `shift()` but likely low-risk. | `EntityId = string`; deprecated exports still leak. | LangChain Runnables have stronger generic flow. | Add branded IDs; remove deprecated `ToolCallResult`; define generic `Agent<TInput,TOutput,TEvent>`. |
| `src/create-agent` compatibility facade | Excellent beginner DX and production defaults. | Uses dynamic `require`, casts to `any`, and duplicates session/runtime concerns. | `run()`/`streamEvents()` types are good but internally cast-heavy. | Vercel-style DX, weaker internal type purity. | Convert to a thin typed adapter over canonical package APIs; remove `require` in ESM. |
| `packages/sdk` | Defines higher-level agents and workflows. | Needs clearer relationship to `core`, `agentic`, and `workflow`. | Good candidate for typed builder APIs. | Vercel has superior typed generation ergonomics. | Make SDK the canonical DX layer with `defineAgent().input().output().tools().model()`. |
| `packages/contracts` | Strong errors, result types, tenant contracts, extension interfaces. | Good foundation for provider-agnostic design. | Should be the home for branded IDs and schema/result primitives. | Stronger production contracts than CrewAI. | Add `Id<TBrand>`, typed error discriminants, schema adapter interfaces, and versioned extension contracts. |
| `packages/shared` | Useful logger/error utilities. | Slight layering smell if shared depends upward. | Needs strict import boundary enforcement. | N/A. | Keep dependency-free or fold into contracts/observe where appropriate. |

### Models, Providers, And Routing

| Module | Current Strength | Scalability / Fault Tolerance / Performance | DX / Type Safety | Competitor Gap | Actions |
|---|---|---|---|---|---|
| `packages/models` | Broad provider coverage and stream helpers. | Provider calls need uniform retry-after handling, abort propagation, and streaming semantics. | OpenAI provider uses `require` and request casts; lint flags several typed issues. | Vercel AI SDK has better normalized provider/tool/stream deltas. | Define a provider conformance suite; normalize `GenerateResult` finish reasons and stream chunks. |
| Root `src/providers` | Rich model resolver, context/cost routing, compatibility providers. | Duplicates package models; router decision history is in-memory and unbounded unless cleared. | Several casts around stream options. | LangChain has deeper integration maturity. | Merge with `packages/models` or make root providers pure compatibility re-exports. |
| `packages/router` | Cost-aware model routing is a differentiator. | Needs circuit-breaker-aware routing, latency EWMA persistence, and backpressure. | Lint currently starts with rule disables. | Vercel has provider unification; LangChain has ecosystem breadth. | Add typed model capability descriptors and adaptive routing metrics. |

### Agentic Runtime, Reasoning, Planning

| Module | Current Strength | Scalability / Fault Tolerance / Performance | DX / Type Safety | Competitor Gap | Actions |
|---|---|---|---|---|---|
| `packages/agentic` | Modern ReAct loop, lifecycle hooks, guardrails, HITL, checkpointing, parallel tool calls. | Unbounded tool fan-out; hard-coded generation defaults; pre-run reasoning injection can expose internal reasoning as conversation text. | Good typed events, but internal `any` appears in Zod conversion and facades. | Stronger agent runtime than Vercel; less mature than LangGraph for durable agent graphs. | Add bounded concurrency, typed stream deltas, configurable generation defaults, and hidden reasoning scratchpad semantics. |
| `packages/reasoning` | Tree-of-thought and reasoning managers are compelling. | ToT can explode cost/latency if not budget-aware. | Needs tighter generic contracts around scorer/candidate types. | Agno has reasoning tools; LangGraph can model search explicitly. | Gate reasoning through budget/deadline; expose traces as typed events. |
| `packages/planner` | Useful plan generation/execution layer. | Needs crisp boundary with graph/workflow/scheduler. | Previous type diagnostics suggest fragile ID typing. | LangChain planners are older but broad. | Decide whether planner outputs graph nodes, tasks, or agentic tool calls as the canonical intermediate form. |
| `packages/compression` | Context compression and Huffman codec show performance care. | Risk of premature algorithmic breadth if not wired into runtime defaults by measured need. | Needs clear API around lossy vs lossless compression. | LangChain memory has many compression strategies. | Keep compression focused on context windows; benchmark before adding more codecs. |

### Tools And Integrations

| Module | Current Strength | Scalability / Fault Tolerance / Performance | DX / Type Safety | Competitor Gap | Actions |
|---|---|---|---|---|---|
| `packages/tools` | Large tool catalog, MCP support, shell/http/file/browser/data categories. | Tool catalog maintenance and security risk are high; several lint failures reveal unsafe `any` and static-only classes. | Tool inference is good but schema conversion is duplicated. | LangChain has deeper integrations; Agno has cleaner agent memory/tool concepts; Vercel has cleaner tool schema typing. | Split core vs optional packs; centralize schema conversion; add tool conformance tests. |
| Shell tool | `packages/tools/src/shell.ts` is default-deny and uses `execFile`. | Deprecated unrestricted `shell` export still exists; class-based `utils/shell.ts` has different semantics. | Two APIs confuse developers. | Agno's sandbox story is stronger. | Unify implementations; move unrestricted export to tests/dev package; add E2B or container sandbox optional integration. |
| HTTP tool | Blocks private/internal networks by default and supports host allowlist. | Needs DNS rebinding protection and redirect revalidation; private IP checks only inspect hostname string. | Good config shape. | Enterprise frameworks expect mature SSRF hardening. | Resolve DNS and re-check final IP; validate redirects; support method/header/body policy. |
| MCP tools | Client and server are a strong ecosystem bet. | Needs protocol conformance tests across stdio/HTTP and version negotiation. | Useful differentiator. | Agno has MCP support; LangChain is catching up. | Add MCP compatibility suite and security profiles for remote tools. |

### Memory, Knowledge, Learning

| Module | Current Strength | Scalability / Fault Tolerance / Performance | DX / Type Safety | Competitor Gap | Actions |
|---|---|---|---|---|---|
| `packages/memory` | In-memory/vector stores, agent-driven `remember`/`recall`, summary buffer, distillation, retention. | Vector memory `get()` is cache-only; embedding calls need caching and retry/backoff. | Good conceptual surface; ID types are weak. | Agno memory is more first-class; LangChain has wider adapter taxonomy. | Make memory canonical in `AgentDb`; vector DB is index, not source of truth. |
| `packages/knowledge` | RAG engine, loaders, adapters for Neo4j/Chroma/pgvector. | Optional peer adapters use `@ts-ignore`, unsafe stringification, and weak row typing. | Current lint issues are release blockers. | LangChain vector store ecosystem remains far larger. | Add adapter conformance tests; typed row mappers; embedding cache; loader streaming for large files. |
| `packages/learning` | User profiles, learning stores, machine layer. | Ambitious but less obviously core; several stores rely on optional dynamic deps. | Some casts in machine/profile flows. | Agno has personalization; CrewAI less so. | Position as experimental until backed by production examples and eval loops. |
| `packages/context` | Context providers and window support. | Must integrate tightly with compression, memory, and model context limits. | Needs typed context parts. | Vercel has strong message/content typing. | Add `ContextPart` discriminated unions and context budget accounting. |

### Persistence, Storage, Sessions

| Module | Current Strength | Scalability / Fault Tolerance / Performance | DX / Type Safety | Competitor Gap | Actions |
|---|---|---|---|---|---|
| `packages/db` | Unified AgentDb across sessions, memory, learning, knowledge, traces, schedules. | Constructors run schema setup; migrations/versioning are not externalized; Postgres close leak. | Useful cross-cutting abstraction. | Stronger built-in persistence than Vercel; less ecosystem maturity than LangChain integrations. | Add migrations, lifecycle tests, pool shutdown, transaction boundaries, and schema version table. |
| `packages/session` | Memory, SQLite, Redis, fallback stores, retention. | IDs use Date/Math; Redis tests skipped. | Solid interface but some lint. | Good production story vs CrewAI/Vercel. | Add testcontainers or mock Redis CI; crypto IDs; store conformance suite. |
| `packages/adapter-redis` | Redis session/rate limiting primitives. | Tests skipped without live Redis. | Good adapter pattern. | Common production expectation. | Add testcontainers or Redis protocol fake; verify Lua behavior under concurrency. |
| `packages/storage` | Generic low-level storage. | Needs clear distinction from `AgentDb` and artifacts. | Simple. | N/A. | Use for blobs/object storage; avoid overlap with DB/session concepts. |
| `packages/artifacts` | Versioned structured outputs. | IDs use Date/Math; artifact store needs retention and external persistence guidance. | Nice DX for agent outputs. | Vercel artifact/UI patterns are stronger. | Add content-addressed IDs and storage adapter conformance tests. |

### Graph, Workflow, Execution, Scheduling

| Module | Current Strength | Scalability / Fault Tolerance / Performance | DX / Type Safety | Competitor Gap | Actions |
|---|---|---|---|---|---|
| `packages/graph` | DAG engine, durable executor, event store, distributed workers, backpressure, replay/diff. | Timer leaks in task timeouts; SQLite event store has `any`; durability semantics need clearer failure policy. | Powerful but complex. | Closest to LangGraph; stronger built-in production primitives, but less polished API. | Use shared timeout/cancellation; typed event store rows; graph conformance/load tests. |
| `packages/execution` | Execution engine package. | Needs differentiation from graph/workflow. | Risk of redundant abstraction. | LangGraph unifies state graph mental model. | Fold into graph if redundant, or make it the lower-level worker runtime. |
| `packages/workflow` | Pipelines/branching with tests. | Lint shows unsafe assignment in branching. | Good user-facing orchestration candidate. | Vercel has simpler stream pipelines; CrewAI has clearer role/task process. | Make workflow the ergonomic layer over graph for non-durable cases. |
| `packages/orchestration` | Teams, swarm, routers, A2A, consensus, load balancing, role/team helpers. | Swarm decomposition/placeholder logic is not production-grade; subtask concurrency unbounded per stage. | `defineRole` and `createTeam` close CrewAI DX gap. | CrewAI mental model is clearer; Agno team API is concise. | Mark swarm experimental; add planner-based decomposition; cap concurrency and support partial failures. |
| `packages/scheduler` | Schedule store and background scheduling. | Needs leader election/locking story across DB backends. | Useful with AgentDb. | Less central in competitors. | Tie schedules to durable graph/workflow runs; test lock expiry. |
| `packages/background` | BullMQ, Kafka, RabbitMQ, SQS, Redis Pub/Sub, in-memory queues. | Many optional deps and queue semantics; in-memory queue uses simple polling/shift patterns. | Broad but maintenance-heavy. | Strong enterprise differentiator if hardened. | Add queue adapter conformance suite: ack, retry, delay, dead-letter, concurrency. |

### Production, Observability, Serving, Evaluation

| Module | Current Strength | Scalability / Fault Tolerance / Performance | DX / Type Safety | Competitor Gap | Actions |
|---|---|---|---|---|---|
| `packages/guard` | Retry, timeout, circuit breaker, deadline primitives. | Should become the only timeout/retry implementation used everywhere. | Strong and small. | Better production primitive than CrewAI/Vercel core. | Add retry-after support and half-open success threshold if not already in production variant. |
| `packages/guardrails` | Prompt injection, moderation, PII, validators. | Regex/heuristic safety cannot be sold as complete defense. | Good API. | LangChain has broader safety integrations; Vercel delegates. | Add policy engine interface and model-based detectors as optional integrations. |
| `packages/production` | Budget, idempotency, audit, approval, checkpoints, tenants, rate limiting. | Potential overlap with `guard`, `contracts`, `db`, `serve`; must keep responsibilities crisp. | Strong enterprise differentiator. | Major advantage over CrewAI/Vercel core. | Define production-control layering: guard for primitives, production for stores/policies, serve for HTTP wiring. |
| `packages/observe` | Tracing, metrics, logger, request context, Prometheus. | Lint red; direct Prometheus exists but needs release gate confidence. | Good API and logger masking. | LangSmith/Langfuse ecosystems are more mature. | Make span taxonomy stable; add log trace correlation tests; lint-fix Prometheus. |
| `packages/serve` | Validation, auth, hardening, lifecycle, A2A. | JWT implementation needs production verifier abstraction; A2A signature has lint issues. | Good runtime-agnostic middleware. | Vercel has stronger HTTP streaming/serverless ergonomics. | Add Fetch-native handlers, JWKS verifier, OpenAPI contract tests, and security test vectors. |
| `packages/eval` | Benchmarks, scorers, regression checks. | `Promise.all` over eval batches can overload providers. | Useful CI primitive. | LangSmith eval ecosystem is stronger. | Add concurrency controls, dataset versioning, feedback store integration, and trace-to-dataset pipeline. |
| `packages/playground` | Zero-dependency playground with security-conscious HTML handling. | Good dev tool; should remain optional. | Useful onboarding. | Agno UI/Playground parity. | Add dev-server file loading and trace visualization only after core gates pass. |

### Edge/Peripheral Packages

| Module | Current Strength | Scalability / Fault Tolerance / Performance | DX / Type Safety | Competitor Gap | Actions |
|---|---|---|---|---|---|
| `packages/config` | Env/config and secret manager surface. | Secret rotation/reload needs clearer runtime semantics. | Good production convenience. | Enterprise apps expect this. | Add `SecretProvider.watch()` or documented reload strategy. |
| `packages/plugins` | Extension story. | Needs clear separation from `contracts/extensions` and root `./extensions`. | Potentially powerful. | LangChain ecosystem wins on plugins. | Make plugin API versioned and test compatibility. |
| `packages/cli` | Doctor/create/replay style commands. | CLI should be treated as a DX product with integration tests. | Important for time-to-first-agent. | Agno has strong REPL DX. | Add `confused-ai chat` after lint/API consolidation. |
| `packages/test-utils` | Mock providers and scenario helpers. | Good for ecosystem conformance tests. | Strong differentiator if expanded. | Vercel test utilities are lighter. | Add package adapter conformance suites reusable by external adapter authors. |
| `packages/video` | Video orchestration is differentiating but peripheral. | Optional deps and media workflows can distract from core runtime maturity. | Fine as extension. | Not central to Agno/LangChain/CrewAI/Vercel comparison. | Keep extension-only; no dependency or lint drag on core. |
| `packages/voice` | Voice/TTS/STT support and stream events. | Queue uses `shift()` in stream; okay for small buffers but not high-throughput audio. | Good multimodal direction. | Vercel AI SDK has strong UI streaming; Agno has multimodal memory edge. | Add backpressure and ring buffer if voice becomes production target. |

## Type Safety And DX Roadmap

1. Add branded identifiers:

```ts
export type Brand<T, B extends string> = T & { readonly __brand: B };
export type AgentId = Brand<string, 'AgentId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type RunId = Brand<string, 'RunId'>;
```

2. Use discriminated unions for runtime events and provider output:

```ts
type AgentEvent =
  | { type: 'run.started'; runId: RunId; agentId: AgentId }
  | { type: 'llm.delta'; runId: RunId; delta: string }
  | { type: 'tool.requested'; runId: RunId; toolName: ToolName; input: unknown }
  | { type: 'tool.completed'; runId: RunId; toolName: ToolName; output: unknown }
  | { type: 'run.completed'; runId: RunId; finishReason: FinishReason };
```

3. Use template literal types for provider/model strings:

```ts
type Provider = 'openai' | 'anthropic' | 'google' | 'ollama' | 'bedrock' | 'openrouter';
type ModelRef<P extends Provider = Provider> = `${P}:${string}`;
```

4. Make tools fully typed end-to-end:

```ts
interface TypedTool<Name extends string, Input, Output> {
  readonly name: Name;
  readonly schema: Schema<Input>;
  execute(input: Input, ctx: ToolContext): Promise<Output>;
}

type ToolInput<T> = T extends TypedTool<string, infer I, unknown> ? I : never;
type ToolOutput<T> = T extends TypedTool<string, unknown, infer O> ? O : never;
```

5. Add typed agent builders:

```ts
defineAgent()
  .model('openai:gpt-4o')
  .input(z.object({ question: z.string() }))
  .output(z.object({ answer: z.string(), citations: z.array(z.string()) }))
  .tools([searchTool, recallTool])
  .build();
```

6. Replace `as any` compatibility casts with adapter functions that preserve generics.

7. Make lint a required prepack/CI gate after staged cleanup. Typecheck passing alone is not enough for this codebase.

## Modular Architecture Assessment

The intent is correctly provider-agnostic: LLMs, memory, vector stores, sessions, tool registries, queues, and observability are interface-driven. The main issue is not coupling to providers; it is internal conceptual duplication.

Recommended canonical layers:

1. `contracts`: dependency-free types, branded IDs, error/result, schemas, extension contracts.
2. `core`: minimal agent/tool/session interfaces and typed builders, no concrete providers.
3. `agentic`: canonical ReAct/agent runtime.
4. `graph`: canonical durable execution engine.
5. `workflow`: ergonomic composition over graph/agentic.
6. `orchestration`: multi-agent/team patterns over workflow/agentic.
7. `models`, `memory`, `tools`, `db`, `background`: adapter ecosystems.
8. `production`, `guard`, `observe`, `serve`: operational wrappers and HTTP/runtime wiring.
9. Root `src/*`: compatibility facade only.

Boundary rule: lower layers must never import from upper layers. Enforce this with `boundaries/dependencies` after updating ESLint config.

## Clean Folder Structure Plan

The repository should move from a flat, feature-accumulated monorepo to a domain-grouped monorepo where physical location matches architectural responsibility. Public npm package names should stay stable during the migration; only their source folders move.

### Target Repository Shape

```text
agent-framework/
   docs/
      architecture/
      guide/
      reference/
      decisions/
      migration/

   examples/
      quickstart/
      production/
      orchestration/
      rag/
      eval/

   packages/
      foundation/
         contracts/          # @confused-ai/contracts: errors, Result, branded IDs, extension contracts
         schema/             # NEW: Zod/JSON Schema/model tool schema conversion
         shared/             # truly dependency-free constants/utilities only

      runtime/
         core/               # @confused-ai/core: minimal interfaces and typed builders
         agentic/            # @confused-ai/agentic: canonical ReAct runtime
         graph/              # @confused-ai/graph: durable DAG/state graph runtime
         workflow/           # @confused-ai/workflow: ergonomic pipeline/DAG wrappers
         orchestration/      # @confused-ai/orchestration: teams, routing, A2A, consensus
         scheduler/          # @confused-ai/scheduler: scheduled durable runs
         background/         # @confused-ai/background: queue adapters and workers

      providers/
         models/             # @confused-ai/models: provider implementations
         router/             # @confused-ai/router: cost/quality/latency routing

      state/
         db/                 # @confused-ai/db: AgentDb + migrations
         session/            # @confused-ai/session
         memory/             # @confused-ai/memory
         knowledge/          # @confused-ai/knowledge
         learning/           # @confused-ai/learning, experimental until hardened
         storage/            # @confused-ai/storage
         artifacts/          # @confused-ai/artifacts

      tools/
         tools/              # @confused-ai/tools: core tool API + curated safe tools
         adapter-redis/      # @confused-ai/adapter-redis, or move under state/ if only state-backed
         plugins/            # @confused-ai/plugins: versioned plugin contracts and registry

      platform/
         guard/              # @confused-ai/guard: retry, timeout, circuit breaker, concurrency limiter
         guardrails/         # @confused-ai/guardrails
         observe/            # @confused-ai/observe
         production/         # @confused-ai/production: policies/stores composed from foundation/runtime
         serve/              # @confused-ai/serve: HTTP/FETCH/A2A middleware
         config/             # @confused-ai/config

      developer/
         sdk/                # @confused-ai/sdk: defineAgent, typed builders, workflow DX
         cli/                # @confused-ai/cli
         playground/         # @confused-ai/playground
         test-utils/         # @confused-ai/test-utils
         eval/               # @confused-ai/eval

      extensions/
         voice/              # @confused-ai/voice, optional extension
         video/              # @confused-ai/video, optional extension

   src/
      index.ts              # root umbrella export only
      model.ts              # subpath facade only
      tool.ts               # subpath facade only
      workflow.ts           # subpath facade only
      guard.ts              # subpath facade only
      serve.ts              # subpath facade only
      observe.ts            # subpath facade only
      test.ts               # subpath facade only
      create-agent.ts       # compatibility facade only
      */index.ts            # no unique implementation; only re-export package APIs

   tests/
      smoke/                # import/export compatibility and package subpath tests
      e2e/                  # full framework integration tests
      security/             # shell/http/auth/tenant/secret tests
      performance/          # non-benchmark perf assertions

   benchmarks/
   templates/
   scripts/
```

### Workspace Configuration Target

Update workspace globs before moving packages:

```json
{
   "workspaces": [
      "packages/*",
      "packages/*/*"
   ]
}
```

`pnpm-workspace.yaml` should mirror this shape:

```yaml
packages:
   - "packages/*"
   - "packages/*/*"
```

Keep each package's `name` unchanged, for example `packages/runtime/agentic/package.json` still publishes as `@confused-ai/agentic`. This preserves consumer imports while allowing the repo to become navigable.

### Ownership Rules

1. `src/` contains no business logic. It is only root package compatibility and subpath re-export facades.
2. `foundation/*` cannot import from any other domain.
3. `runtime/*` can import from `foundation/*`, `platform/guard`, and explicit adapter interfaces, but not concrete providers or databases.
4. `providers/*`, `state/*`, and `tools/*` implement adapters. They can depend inward on contracts, not sideways on orchestration.
5. `platform/*` wraps runtime behavior with operational controls: auth, serving, guardrails, observability, production stores, config.
6. `developer/*` is user-facing DX: SDK, CLI, playground, eval, tests. It can compose public APIs but should not be required by production runtime packages.
7. `extensions/*` must be optional and must not affect core lint/build/test gates.

### What Should Move Or Collapse

| Current Area | Target | Action |
|---|---|---|
| `src/create-agent/` | `packages/developer/sdk` facade plus `packages/runtime/agentic` runtime | Keep public `confused-ai/create-agent`; move logic behind package APIs. |
| `packages/core/src/runner/agent-runner.ts` | `packages/runtime/agentic` | Deprecate or remove after compatibility parity tests pass. |
| `src/providers/` | `packages/providers/models` and `packages/providers/router` | Merge provider implementations and cost/context routing into package layer. |
| `src/runtime/` | `packages/platform/serve` or new `packages/platform/runtime` | Avoid parallel HTTP server implementations. |
| `src/production/` | `packages/platform/production`, `packages/platform/guard`, `packages/state/db` | Split primitives, stores, and HTTP wiring by responsibility. |
| `src/observability/` | `packages/platform/observe` | Preserve only root facade exports in `src/observe.ts`. |
| `src/dx/` | `packages/developer/sdk` | Keep one canonical DX builder location. |
| `src/testing/` | `packages/developer/test-utils` | Move mocks and scenario utilities. |
| `packages/tools/src/shell.ts` + `packages/tools/src/utils/shell.ts` | `packages/tools/tools/src/shell/` | One shell implementation, one compatibility wrapper. |
| Zod conversion files in tools/agentic/providers | `packages/foundation/schema` | One schema adapter package with conformance tests. |
| `packages/execution` overlap | `packages/runtime/graph` or `packages/runtime/workflow` | Fold if it does not own a distinct execution responsibility. |

### Migration Phases

#### Structure Phase 0: Freeze Surface Area

- Do not add new packages until lint and export gates are green.
- Add an `ARCHITECTURE-OWNERSHIP.md` or `PACKAGES.md` table with package owner domain, allowed imports, and public status.
- Add import smoke tests for every public root and package subpath.

#### Structure Phase 1: Prepare Workspace For Nested Packages

- Update root `package.json` and `pnpm-workspace.yaml` to include `packages/*/*`.
- Update Turbo filters and scripts to handle nested packages.
- Add `eslint-plugin-boundaries` rules for the domain groups above.
- Confirm `bun run typecheck && bun run test` still passes before moving files.

#### Structure Phase 2: Move Packages Without Renaming Them

- Use `git mv` package-by-package.
- Move low-risk packages first: `contracts`, `shared`, `guard`, `observe`, `serve`, `test-utils`.
- After each group move, run package export smoke tests and `bun run typecheck`.
- Keep npm package names, root export map, and consumer import paths stable.

#### Structure Phase 3: Collapse Duplicate Implementations

- Convert `src/*` implementation folders into re-export facades.
- Consolidate duplicate shell, schema, provider, and agent runtime implementations.
- Mark deprecated paths with JSDoc and migration notes, then remove only in a major version.

#### Structure Phase 4: Enforce Boundaries

- Make `lint`, `lint:packages`, export smoke tests, and package conformance tests part of `prepack`.
- Fail CI if a lower-level domain imports an upper-level domain.
- Fail CI if root `src/**` grows implementation files beyond approved facade files.

### Clean Import Policy

Preferred internal imports after reorganization:

```ts
// Good: package-level public boundaries
import type { Result } from '@confused-ai/contracts';
import { withRetry } from '@confused-ai/guard';
import { AgenticRunner } from '@confused-ai/agentic';

// Avoid: cross-package source imports
import { x } from '../../some-other-package/src/internal.js';
```

Preferred consumer imports stay unchanged:

```ts
import { createAgent } from 'confused-ai';
import { openai } from 'confused-ai/model';
import { tool } from 'confused-ai/tool';
```

The physical tree becomes cleaner, while external DX remains stable.

## Production Readiness Assessment

Strengths:

- Circuit breakers, retries, timeouts, deadlines, budget controls, HITL approvals, idempotency, audit logs, tenant context, Redis adapters, graceful shutdown, hardening middleware, OTEL, metrics, and eval tools are already present.
- This is materially stronger than Vercel AI SDK core, CrewAI core, and many LangChain apps by default.

Gaps:

- Release gates are red.
- Provider calls need standardized retry-after behavior and abort propagation.
- Timeout logic is duplicated outside `@confused-ai/guard`.
- Auth should graduate from helper-level HS256 to production verifier interfaces.
- DB schema lifecycle should move from auto-create in adapter constructors toward migrations.
- Observability needs stable event/span taxonomy and trace/log correlation tests.
- Redis and external adapter tests need either testcontainers or reliable fakes.

## Concurrency And Performance Assessment

Strengths:

- Tool registry lookups are Map-based.
- Several O(n) and O(n^2) problems were already fixed in earlier hardening passes.
- Graph backpressure exists.
- The agentic loop executes tool calls in parallel and preserves order.

Risks:

- Parallelism is sometimes unbounded: agentic tools, team coordination, eval batches, background queue dispatches, and swarm stages.
- `Promise.race` timers need cleanup and cancellation propagation.
- In-memory queues and stream buffers still use `shift()` in several peripheral packages.
- Provider/router decision history and audit buffers need bounded retention by default.
- Embedding generation has no default cache in the RAG hot path.

Performance roadmap:

1. Add `ConcurrencyLimiter` in `@confused-ai/guard` and use it everywhere parallel fan-out exists.
2. Add `AbortSignal` to graph node, tool, provider, memory, and queue interfaces.
3. Add embedding cache with hash keys and TTL.
4. Add benchmark gates: single-turn overhead, tool fan-out, 1k-node graph resume, vector memory retrieval, provider routing.
5. Replace hot `shift()` loops in queues/streams with a head-pointer queue abstraction.

## Agentic Orchestration Assessment

Strengths:

- ReAct loop, tool calling, lifecycle hooks, HITL, guardrails, budget tracking, checkpointing, role/team helpers, routers, consensus, swarms, A2A, and graph execution cover a large orchestration space.
- `defineRole` and `createTeam` close much of the CrewAI DX gap.

Gaps:

- Swarm decomposition is currently rule-based and partly placeholder, so it should not be presented as production autonomous decomposition.
- Memory tools exist, but they are tools the developer must register; there is not yet a unified memory policy that decides what gets remembered, summarized, retrieved, and deleted.
- Reasoning enrichment injects reasoning text as an assistant message, which can blur internal scratchpad and user-visible conversation state.
- Multi-agent workflows need typed task/result contracts, partial failure semantics, and compensation/cancel behavior.

Recommended orchestration model:

1. `Agent`: single ReAct actor.
2. `Team`: explicit role-based group with route/coordinate/collaborate modes.
3. `Workflow`: typed DAG/pipeline of agents/tools/functions.
4. `DurableRun`: event-sourced workflow execution with checkpoint/replay.
5. `Swarm`: experimental planner-driven decomposition until it has robust tests and partial failure support.

## Competitor Benchmark Comparison

| Dimension | Current Advantage | Current Gap | Close-The-Gap Action |
|---|---|---|---|
| Agno | Production controls, TypeScript-first, MCP, durable graph, budget/HITL/audit. | Agno's memory/team APIs are cleaner and more first-class; sandbox story is stronger. | Promote memory policy as first-class; unify `createTeam`; add optional E2B/container sandbox. |
| LangChain / LangGraph | Stronger built-in production controls and simpler TS-first story. | LangChain has far more integrations, mature retrievers/vector stores, LangSmith ecosystem, and graph semantics. | Adapter conformance suite, LangSmith/Langfuse deep tracing, canonical graph API, migration guide. |
| CrewAI | TypeScript, production safety, graph durability, provider breadth. | CrewAI has a clear role/task/process mental model. | Make `defineRole`, `Task`, `Team`, and `Process` a polished first-page API. |
| Vercel AI SDK | More agentic orchestration, memory, graph, production controls. | Vercel has superior typed streaming/tool-call ergonomics and UI/serverless integration. | Typed stream deltas, React/UI adapters, Fetch-native handlers, provider normalization. |

## Roadmap

### Phase 1: Stabilize The Foundation (1-2 weeks)

- Fix `package.json` export drift: remove or implement `./extensions`.
- Make `bun run lint` and `bun run lint:packages` pass.
- Add package export smoke tests for every root and package subpath.
- Add branded IDs and crypto-backed ID generation.
- Replace `@ts-ignore` with typed optional peer dependency adapters.
- Fix Postgres pool shutdown and timer cleanup bugs.
- Document which roadmap items are complete versus stale.

Acceptance criteria:

- `bun run typecheck && bun run test && bun run lint && bun run lint:packages` passes.
- Export smoke tests import every public subpath in ESM and CJS modes.
- No red package lint gate in CI.

### Phase 2: Canonical Runtime And Schema Layer (2-4 weeks)

- Make `packages/agentic` the canonical agent runtime.
- Turn root `src/create-agent` and `packages/core/src/agent.ts` into adapters or deprecate one path.
- Create centralized schema conversion and structured output package.
- Add provider conformance tests for tool calls, streaming deltas, usage, finish reasons, aborts, and errors.
- Add bounded tool concurrency and shared timeout/cancellation primitives.

Acceptance criteria:

- One runner owns ReAct semantics.
- All tool schemas pass a common schema snapshot suite.
- Tool fan-out cannot exceed configured concurrency.
- Provider conformance suite passes for OpenAI-compatible, Anthropic, Google, local/self-hosted, and router providers.

### Phase 3: Production Hardening (4-8 weeks)

- Add DB migrations and lifecycle tests for SQLite/Postgres/MySQL where applicable.
- Add Redis/testcontainers integration tests.
- Add JWKS/issuer/audience JWT verifier and token policy interface.
- Add DNS-aware SSRF protection and redirect revalidation for HTTP tools.
- Add queue adapter conformance tests.
- Add retry-after parsing for providers.
- Add default embedding cache.

Acceptance criteria:

- External adapters have conformance suites.
- Security tests cover shell, HTTP SSRF, JWT, authz, tenant tool allowlists, and secret masking.
- Load tests prove bounded resource use under parallel tool calls and graph execution.

### Phase 4: World-Class DX (8-12 weeks)

- Publish typed `defineAgent` builder with input/output schemas and typed tools.
- Promote `defineRole`, `Task`, `Team`, and `Process` to the top-level docs.
- Add `confused-ai chat` REPL and `confused-ai dev` hot reload only after core gates are green.
- Add React/Fresh/Next/Fastify adapters for streaming UI and serverless deployment.
- Add migration guides from LangChain, CrewAI, Agno-style teams, and Vercel AI SDK.

Acceptance criteria:

- New user can create, run, stream, evaluate, and deploy a typed agent in under 5 minutes.
- IDE autocompletion infers tool inputs/outputs and final structured output.
- Docs examples are tested.

### Phase 5: Enterprise Differentiators (12+ weeks)

- Agent registry with versioning, rollback, and A/B routing.
- Trace-to-dataset feedback loop for eval regression.
- Cost attribution dashboard by tenant/user/agent/model/tool.
- Multi-modal memory with image/document embeddings.
- Sandbox integrations for code execution tools.

Acceptance criteria:

- Enterprise reference deployment includes Redis, Postgres, OTEL, Prometheus/Grafana, auth, tenant isolation, budget policies, and eval gates.
- Long-running workflows survive restarts with replayable state and consistent audit logs.

## Specific Code-Level Improvements

1. `package.json`: remove or implement `./extensions` export.
2. `tsup.config.ts`: add matching entry if `./extensions` remains.
3. `eslint.config.js`: migrate boundaries rule and register TypeScript ESLint for legacy `src/**` if those rule comments stay.
4. `packages/core/src/types.ts`: replace `EntityId = string` and `generateEntityId()` with branded crypto IDs.
5. `packages/core/src/agent.ts`: replace Date/Math IDs; remove unused `mergeHooks` future placeholder or wire it fully.
6. `src/create-agent/factory.ts`: remove dynamic `require` and `any` casts through typed async imports/adapters.
7. `packages/agentic/src/runner.ts`: replace `allowedTools: string[]` with `ReadonlySet<string>`; add `toolConcurrency`; expose typed deltas.
8. `packages/agentic/src/_zod-to-schema.ts`: replace internal Zod `_def` usage with centralized schema adapter.
9. `packages/tools/src/core/tool-helper.ts`: remove duplicate Zod conversion.
10. `packages/tools/src/shell.ts` and `packages/tools/src/utils/shell.ts`: consolidate into one implementation.
11. `packages/tools/src/utils/http.ts`: add DNS/redirect SSRF hardening.
12. `packages/graph/src/engine.ts`: clear timeout handles and pass abort signals into node contexts.
13. `packages/orchestration/src/multi-agent/swarm.ts`: replace rule-based decomposition placeholder with explicit planner interface; cap stage concurrency.
14. `packages/memory/src/vector-store.ts`: implement durable `get()` or move metadata source of truth to `AgentDb`.
15. `packages/db/src/postgres.ts`: call `await pool.end()` in `close()`.
16. `packages/serve/src/auth.ts`: add production verifier interface and JWKS implementation.
17. `packages/knowledge/src/adapters/*`: replace `@ts-ignore` and unsafe row access with typed optional imports and row mappers.
18. `packages/observe/src/prometheus.ts`: fix typed lint and add output snapshot tests.
19. `packages/eval/src/*`: add concurrency limits to batch evals.
20. `packages/background/src/queues/*`: add adapter conformance tests for retry, ack, dead-letter, delay, cancellation, and concurrency.

## Final Positioning

The framework should compete as:

> The TypeScript-first enterprise agent runtime for teams that need typed agent development, provider freedom, durable orchestration, production controls, and observable long-running workflows.

To reach that standard, the project should stop expanding the surface area temporarily and spend the next cycle making the core boringly reliable: one canonical runtime, one schema system, one event model, green lint gates, bounded concurrency, strong adapter lifecycle semantics, and truthful docs.

---

# Addendum — Verified May 8, 2026

This addendum captures findings discovered during a fresh read of the codebase that were not surfaced in the main audit, with file/line evidence. The focus is the user's product goal: **tools, memory, and sessions must be easy to use, extensible to anything, and resumable**.

## Verification Snapshot

| Gate | Result | Evidence |
|---|---:|---|
| `bun run typecheck` | Pass | clean exit |
| `bun run lint:packages` | Fail | 982 problems (956 errors, 26 warnings) — unchanged |
| `package.json ./extensions` export drift | Confirmed | [package.json](../package.json) declares `./extensions`, [tsup.config.ts](../tsup.config.ts) has no entry, no `src/extensions*` exists |
| Postgres pool leak | Confirmed | [packages/db/src/postgres.ts:183-186](../packages/db/src/postgres.ts#L183-L186) — `close()` only nulls `_pool`, never awaits `pool.end()` |
| Unbounded tool fan-out | Confirmed | [packages/agentic/src/runner.ts:560](../packages/agentic/src/runner.ts#L560) — `Promise.all(toolCalls.map(...))` |
| Graph timer/abort leak | Confirmed | [packages/graph/src/engine.ts:512-515](../packages/graph/src/engine.ts#L512-L515) — `Promise.race` + `setTimeout`, no `clearTimeout`, no `AbortSignal` propagation |
| HS256-only JWT | Confirmed | [packages/serve/src/auth.ts:42-91](../packages/serve/src/auth.ts#L42-L91) — no `iss`/`aud`/`nbf`/`jti`/JWKS/clock skew |
| Weak ID generation | Confirmed | 34 sites use `Date.now() + Math.random()` across core, memory, session, sdk, scheduler, planner, orchestration, artifacts, execution, graph, tools, learning |

## P0 — Adoption Blockers (New)

These are the highest-leverage gaps for "easy to use, easy to extend, resumable" that are not already in the main audit.

### A1. Two competing entry points confuse first-time users

- [src/dx/agent.ts:46](../src/dx/agent.ts#L46) exposes `agent('You are helpful.')` as the marketed 3-line quickstart, but [src/index.ts:55](../src/index.ts#L55) re-exports `createAgenticAgent` from `@confused-ai/agentic` and [src/create-agent.ts](../src/create-agent.ts) re-exports the legacy `createAgent`. README and examples disagree on which to use.
- [examples/simple-agent.ts:21](../examples/simple-agent.ts#L21) imports from `../src/create-agent.js` directly — bypasses the public entry the README sells.
- **Action**: pick one canonical entry. Recommendation: `agent()` is the headline API; `createAgent()` and `createAgenticAgent()` become typed adapters with `@deprecated` JSDoc pointing to `agent()`. Update every example file to use the canonical import.

### A2. Tool barrel forces a 100-tool import to use one tool

- [packages/tools/src/index.ts:1-200](../packages/tools/src/index.ts) does `export * from` for every category. Importing `@confused-ai/tools` pulls every tool's module graph (Slack, Stripe, Twilio, Playwright, AWS, BullMQ, etc.) into resolution even with `sideEffects: false`.
- Bundle smoke tests are absent, so consumers do not learn about this until they ship.
- **Action**: keep barrel for discovery, but make every tool importable from a stable subpath: `@confused-ai/tools/communication/slack`, `@confused-ai/tools/devtools/github`, etc. Add a CI bundle-size budget that imports `tool()` + 1 tool and asserts the closure stays under a fixed kB threshold.

### A3. There is no canonical "extend a memory store" surface

- [packages/memory/src/index.ts](../packages/memory/src/index.ts) exports `InMemoryStore`, `VectorMemoryStore`, `DbMemoryStore`, `PineconeVectorStore`, `QdrantVectorStore`, `PgVectorStore`, plus `OpenAIEmbeddingProvider`, plus `createAgentMemoryTools`, plus `MemoryDistiller`. There is no documented "implement these 4 methods to write your own store" template.
- [packages/memory/src/vector-store.ts:208](../packages/memory/src/vector-store.ts#L208) makes IDs with `Date.now() + Math.random()`, and `get()` is cache-only (already noted in main audit), so user-built stores cannot reliably participate.
- **Action**: publish a `MemoryStore` interface with conformance tests in `@confused-ai/test-utils` (`runMemoryStoreConformance(store)`). Provide a `customStore` example (e.g. a 30-line Upstash or Turso store) in [examples/](../examples/).

### A4. Sessions cannot be resumed across processes by default

- [packages/session/src/db-store.ts:21](../packages/session/src/db-store.ts#L21) and [packages/core/src/agent.ts:146](../packages/core/src/agent.ts#L146) generate session IDs with `Date.now() + Math.random()` — collidable across replicas and not replay-stable.
- The default `agent()` path uses `InMemorySessionStore` per [src/create-agent/factory.ts](../src/create-agent/factory.ts) — restart loses every conversation. The README quickstart never hints at this.
- **Action**:
  1. Default to `crypto.randomUUID()` for all session/run/memory/artifact IDs (one ID factory in `@confused-ai/contracts`).
  2. Ship a `createAgent({ persist: 'sqlite' | 'postgres' | 'redis' })` shorthand that auto-wires `DbSessionStore`, `DbMemoryStore`, and `AgentDb` with one connection string.
  3. Make `agent.run(prompt, { sessionId })` return `{ sessionId, runId, resumeToken }` so users can store one string and continue any conversation.

### A5. "Continue where I left off" is not a first-class verb

- The agentic runner supports checkpoints internally (`_restoreCheckpoint` referenced in [packages/agentic/src/runner.ts:7](../packages/agentic/src/runner.ts#L7)) and the graph engine has `_saveCheckpoint`, but the public `agent()` / `createAgent()` surface has no `resume(runId)` method. Users cannot say "the process crashed mid-tool-call, finish it" without learning the graph package.
- **Action**: expose `agent.resume(runId)` and `agent.streamResume(runId)`. Internally, route through `AgentDb` checkpoint records; if no checkpoint exists, replay from session messages. Return the same `AgenticRunResult` shape as `run()` so user code is symmetric.

### A6. Optional peer deps loaded via `require()` break ESM-only consumers

- 14 sites use `require('pg' | 'better-sqlite3' | 'ioredis' | 'mongodb' | '@aws-sdk/...' | '@google-cloud/...' | '@opentelemetry/api' | 'openai')` inside `.ts` source — see [packages/db/src/postgres.ts](../packages/db/src/postgres.ts), [packages/session/src/redis-store.ts:64](../packages/session/src/redis-store.ts#L64), [packages/session/src/sqlite.ts:41](../packages/session/src/sqlite.ts#L41), [packages/learning/src/*-stores.ts](../packages/learning/), [packages/config/src/secret-manager.ts](../packages/config/src/secret-manager.ts), [packages/observe/src/logger.ts:140](../packages/observe/src/logger.ts#L140), [packages/models/src/openai-provider.ts:140](../packages/models/src/openai-provider.ts#L140), [packages/core/src/runner/agent-runner.ts:78](../packages/core/src/runner/agent-runner.ts#L78).
- Pure-ESM Node 22+ users, Bun-only users, and Deno users hit `require is not defined` at runtime when the optional path is taken.
- **Action**: replace every `require()` with a typed `tryImport<T>(specifier)` helper that does `await import(specifier)` and returns `T | null`. Centralize in `@confused-ai/shared` so the eslint-disable lines disappear.

### A7. Knowledge adapters use `@ts-ignore` for optional peers

- [packages/knowledge/src/adapters/chroma-adapter.ts:109](../packages/knowledge/src/adapters/chroma-adapter.ts#L109), [pgvector-adapter.ts:127](../packages/knowledge/src/adapters/pgvector-adapter.ts#L127), [neo4j-adapter.ts:151](../packages/knowledge/src/adapters/neo4j-adapter.ts#L151), [pdf-loader.ts:39](../packages/knowledge/src/loaders/pdf-loader.ts#L39), and 8 sites in [packages/background/src/queues/*](../packages/background/src/queues/) use `@ts-ignore` instead of typed optional adapter shims.
- This silently disables compiler help and produces `unsafe-*` lint errors that user-built adapters then have to copy-paste.
- **Action**: define `interface ChromaClientLike { /* minimal surface used */ }` per adapter. Use `tryImport` to get the real client and cast once at the boundary. This becomes the template for community adapters.

### A8. `agent()` defaults pull `HttpClientTool` + `BrowserTool` automatically

- [src/create-agent/factory.ts:36-38](../src/create-agent/factory.ts#L36-L38) — `resolveTools(undefined)` returns `[new HttpClientTool(), new BrowserTool()]`. That includes a Playwright dependency in the resolution graph for an agent that just answered "2+2".
- **Action**: default to **no tools**. Add a clear `agent({ tools: 'web' })` preset that opt-in attaches HTTP + Browser. Surprise dependencies are an adoption killer.

### A9. Date.now()-based IDs collide in tests and observability

- 34 sites — sample evidence: [packages/orchestration/src/multi-agent/swarm.ts:620](../packages/orchestration/src/multi-agent/swarm.ts#L620) (also uses deprecated `String.prototype.substr`), [packages/artifacts/src/artifact.ts:342](../packages/artifacts/src/artifact.ts#L342), [packages/graph/src/types.ts:24](../packages/graph/src/types.ts#L24), [packages/core/src/types.ts:15](../packages/core/src/types.ts#L15).
- Under fast loops or vitest `--threads`, two IDs minted in the same millisecond can match. This breaks trace correlation and event store dedup.
- **Action**: one helper `newId(prefix?: string): Brand<string,'Id'>` in `@confused-ai/contracts` using `crypto.randomUUID()`. Replace all 34 sites with codemod. Remove the `String.prototype.substr` site (deprecated since Node 14).

### A10. Tool definition has three competing shapes

- [packages/tools/src/core/tool-helper.ts](../packages/tools/src/core/tool-helper.ts) exports `tool({ name, description, parameters, execute })` — modern, Zod-typed, fluent.
- [packages/tools/src/types.ts](../packages/tools/src/types.ts) exports legacy `defineTool()` and `Tool` interface.
- [packages/tools/src/core/base-tool.ts](../packages/tools/src/core/base-tool.ts) exposes a class-based `BaseTool` that 100+ built-in tools extend.
- A user reading the README sees `tool()`, opens any built-in tool source and sees a class. They do not know which to copy.
- **Action**: pick `tool()` as the one user-facing API. Refactor built-in tools to be **defined with** `tool()` (or a thin `definedTool()` for tools that need lifecycle), and demote `BaseTool` to internal. Document a single "Custom Tool in 10 Lines" recipe.

## Easy-to-Use Roadmap (Adoption Track)

A surgical set of changes that, taken together, make this framework feel like Vercel AI SDK to start and like LangGraph to scale. Ordered by user-visible impact.

### Track 1: One Story for Tools, Memory, Sessions

Goal: a beginner can write `agent(...)`, give it a custom tool, attach memory, and resume after a crash, all from one import path.

```ts
// The vision — every line should work today after Track 1 lands.
import { agent, tool, memory, session } from 'confused-ai';
import { z } from 'zod';

const search = tool({
  name: 'search',
  description: 'Search the web',
  parameters: z.object({ q: z.string() }),
  execute: async ({ q }) => fetch(`https://duckduckgo.com/?q=${q}`).then(r => r.text()),
});

const ai = agent({
  instructions: 'You are a helpful research assistant.',
  tools: [search],
  memory: memory.sqlite('./memory.db'),       // long-term store
  session: session.sqlite('./sessions.db'),   // short-term + resumable
});

const { sessionId, runId } = await ai.run('Find papers about Mamba SSMs.');

// later, in another process — same DB, finishes any in-flight tool calls.
await ai.resume(runId);
```

Required work:
1. Add re-exports `memory` and `session` namespaces to root [src/index.ts](../src/index.ts) — `memory.sqlite(path)`, `memory.postgres(url)`, `memory.redis(url)`, `memory.inMemory()`, same shape for `session`.
2. Implement `agent.resume(runId)` (see A5) backed by the existing checkpoint store.
3. Wire `crypto.randomUUID()` ID factory (A9) so `runId` and `sessionId` are durable strings.
4. Default `tools: []` (A8); show `tools: 'web'` preset for one-line opt-in.

### Track 2: Extension Templates

Make extending the framework a 30-line file by publishing copy-paste templates and conformance tests:

| Extension | Template path | Conformance test |
|---|---|---|
| Custom LLM provider | `examples/extending/custom-provider.ts` | `runProviderConformance(provider)` |
| Custom tool | `examples/extending/custom-tool.ts` | already typed via `tool()` |
| Custom memory store | `examples/extending/custom-memory.ts` | `runMemoryStoreConformance(store)` |
| Custom session store | `examples/extending/custom-session.ts` | `runSessionStoreConformance(store)` |
| Custom vector store | `examples/extending/custom-vector.ts` | `runVectorStoreConformance(store)` |
| Custom queue adapter | `examples/extending/custom-queue.ts` | `runQueueConformance(queue)` |
| Custom guardrail | `examples/extending/custom-guardrail.ts` | type-checked at compile time |

These conformance helpers must live in `@confused-ai/test-utils` and be the basis for community packages getting an "official adapter" badge.

### Track 3: First-Class Resumability

Resumability is the durable execution killer feature LangGraph leads on. To match and exceed it:

1. **Stable run IDs**: `runId` is the resume key. Returned from `run()`, `streamEvents()`, `streamResume()`, and `resume()`.
2. **Single source of truth**: `AgentDb.checkpoints` table (already exists per [packages/db](../packages/db/)) becomes the canonical store; `agentic` and `graph` both write here.
3. **Idempotent tool execution**: every tool call gets a deterministic `toolCallId` derived from `(runId, step, name, hash(args))`. On resume, replay completed calls from the checkpoint instead of re-executing. This makes `agent.resume()` safe even if the original process called Stripe.
4. **Replay-from-event-log fallback**: if no checkpoint exists but the session has messages, rebuild state by feeding messages back to the LLM with `tool_choice: 'none'`. This is the difference between "we have durability" and "we have durability that survives schema changes".
5. **`resumeToken`** opaque string returned to clients — encodes `{ sessionId, runId, version }`. Prevents cross-tenant resume by signing with `process.env.RESUME_SECRET`.

### Track 4: Quickstart Bundle Size Gate

Add a CI test that imports `{ agent, tool }` from `confused-ai` and asserts the bundled closure stays under **80 kB minified, gzipped**, with no transitive `playwright`, `pg`, or `aws-sdk`. This single gate forces the right architectural decisions for A2 and A8 and signals to evaluators that the framework respects their bundle.

### Track 5: Five-Minute Onboarding Acceptance Test

Hire-the-junior-dev test (run quarterly, on a fresh machine):
1. `npx create-confused-ai my-app` (CLI scaffold).
2. Set `OPENAI_API_KEY`.
3. Run, get a working agent with a custom tool, memory, and session, all wired.
4. Kill the process mid-run, restart, see it resume.
5. Total time-to-resumable-agent: under 5 minutes, zero open browser tabs to docs.

If any step requires reading documentation, fix the API not the docs.

## Compelling-to-Developers Final Word

`confused-ai` already has the depth of LangChain and the production controls of nothing else in TypeScript. What it lacks is a single, obvious, beautiful path through the front door:

- **One way to make an agent**: `agent()`.
- **One way to make a tool**: `tool()`.
- **One way to attach memory or sessions**: `memory.<adapter>()` / `session.<adapter>()`.
- **One way to extend anything**: implement the interface, run the conformance test.
- **One way to recover**: `agent.resume(runId)`.

Ship those five sentences, make every example match, kill the duplicates listed in A1/A6/A10, and this becomes the framework TypeScript developers reach for first instead of last.

---

# Addendum II — The Adapter Reality Check (Verified May 8, 2026)

The audit above states "the framework follows a pluggable, provider-agnostic design." Reading the source, **this claim does not hold today**. The framework has multiple competing definitions of every core extension point. An adapter written against one is incompatible with the others. This is the single biggest blocker to "easy to extend to anything."

## B1. Five Competing `SessionStore` Interfaces

| File | Shape | Notes |
|---|---|---|
| [packages/session/src/types.ts:27](../packages/session/src/types.ts#L27) | `get/create/update/getMessages/appendMessage/delete` | Canonical, used by `@confused-ai/session` adapters |
| [packages/contracts/src/adapters.ts:27](../packages/contracts/src/adapters.ts#L27) | `create(userId)/get/append/delete/listByUser/touch` | Different method names, different return shapes (`Promise<string>` vs `Promise<SessionData>`) |
| [packages/core/src/agent.ts:36](../packages/core/src/agent.ts#L36) | `get/create/update/getMessages` (4 methods) | Local re-declaration "ISP — minimal, only what factory needs" |
| `Session` shape in `session/types.ts` | `createdAt: number, messages: ReadonlyArray<SessionMessage>` | epoch ms |
| `Session` shape in `contracts/adapters.ts` | `createdAt: string, messages: readonly Message[]` | ISO string, different `Message` type |

A user implementing a custom Upstash session store has to pick one. The other three callsites silently won't accept their adapter. This must collapse to **one interface in `@confused-ai/contracts`**, with everything else being a typed re-export.

## B2. Three Competing `MemoryStore` Interfaces

- [packages/memory/src/types.ts:96](../packages/memory/src/types.ts#L96) — semantic memory: `store(entry)/retrieve(query)/get(id)/update/delete` with `MemoryEntry`, `MemoryType.SHORT_TERM | LONG_TERM | EPISODIC | SEMANTIC`.
- [packages/graph/src/types.ts:440](../packages/graph/src/types.ts#L440) — key-value cache: `get<T>(key)/set<T>(key, value, ttlMs?)/delete/has/keys/clear`. **Same name, completely different contract.** The file's own comment admits: *"Canonical core types: import type { MemoryStore as CoreMemoryStore } from '../memory/types.js'"* — yet defines `MemoryStore` anyway.
- [packages/contracts/src/adapters.ts](../packages/contracts/src/adapters.ts) — does not define `MemoryStore`, contributing to the confusion.

Result: graph nodes that say `ctx.memory.set(...)` cannot interoperate with agentic memory that expects `store({ content, type })`. **Action**: rename graph's KV interface to `KVStore` (it is one). Make `MemoryStore` from `@confused-ai/memory` the single canonical contract.

## B3. Three Competing `LLMProvider` Interfaces

- [packages/core/src/runner/types.ts:79](../packages/core/src/runner/types.ts#L79) — `generateText(messages, options)/streamText?` returning `GenerateResult`. Plus segregated `ITextGenerator`, `IStreamingProvider`, `IToolCallProvider`, `IEmbeddingProvider`.
- [packages/graph/src/types.ts:489](../packages/graph/src/types.ts#L489) — `generate(messages, options)/stream?` returning `LLMResponse`. The file's own comment includes a 7-line bridge example: *"To bridge a canonical provider into the graph engine, use: const graphLlm: LLMProvider = { name, generate: (msgs, opts) => coreProvider.generateText(...).then(r => ({ content: r.text, ... })) }"*. Telling users to write a 7-line shim per provider is not "provider-agnostic."
- [packages/test-utils/src/index.ts:27](../packages/test-utils/src/index.ts#L27) — third shape used in tests.

OpenAI, Anthropic, Gemini, Ollama, OpenRouter, Bedrock all live in `@confused-ai/models`. None of them work natively with the graph engine without the user-written adapter. **Action**: kill the graph-local `LLMProvider`. Graph imports `LLMProvider` from `@confused-ai/contracts`. Same applies to `MemoryStore` and `LLMMessage`.

## B4. Three Competing `ToolRegistry` Interfaces

- [packages/tools/src/core/types.ts:106](../packages/tools/src/core/types.ts#L106) — full registry: `register/unregister/get/getByName/list/listByCategory/search/has/clear`.
- [packages/core/src/runner/types.ts:130](../packages/core/src/runner/types.ts#L130) — runner-local subset.
- [packages/agentic/src/_tool-types.ts:71](../packages/agentic/src/_tool-types.ts#L71) — agentic-local subset.

`tool()` produces a `LightweightTool` that needs `.toFrameworkTool()` to be usable, and the conversion target depends on which package is consuming it. **Action**: one `Tool` interface and one `ToolRegistry` in `@confused-ai/contracts`. Everything else is structural assignability.

## B5. The Four-Quadrant Knowledge Model — Sessions, Memory, Knowledge, Skills

Today the framework has three overlapping concepts and is missing the fourth:

| Concept | What it is | Where it lives now | Lifecycle |
|---|---|---|---|
| **Session** | Recent message turns for one conversation | [packages/session](../packages/session/) | Per conversation, hot, often ephemeral |
| **Memory** | Facts the agent decided are worth keeping | [packages/memory](../packages/memory/) | Cross-conversation, semantic search, slow growth |
| **Knowledge** | External documents the agent retrieves | [packages/knowledge](../packages/knowledge/) | Read-mostly, indexed offline, RAG-style |
| **Skills** | Reusable capability bundles (instructions + tools + few-shot + retrieval policy) | **MISSING** as a first-class type | Versioned, composable, shareable |

The framework today conflates "skills" with "tools" and "instructions." But the user's mental model is closer to Anthropic Skills, OpenAI GPTs, or Agno's `Toolkit`: *"give my agent the `web-research` skill and the `pdf-summarizer` skill, those bundles bring their own tools, instructions, and memory hints."*

The codebase already gestures at this:
- [packages/orchestration/src/a2a/types.ts:139](../packages/orchestration/src/a2a/types.ts#L139) defines `A2AAgentSkill` for inter-agent advertisement, but only as a metadata blob.
- `createToolkit` exists in orchestration but is just a tool-grouping helper.

**Recommended `Skill` contract** — to live in `@confused-ai/contracts`:

```ts
export interface Skill {
  readonly id: string;
  readonly version: `${number}.${number}.${number}`;
  readonly name: string;
  readonly description: string;
  /** Prepended to system prompt when skill is active. */
  readonly instructions?: string;
  /** Tools this skill brings. */
  readonly tools?: readonly Tool[];
  /** Few-shot exemplars injected into context. */
  readonly examples?: readonly { input: string; output: string }[];
  /** Optional retrieval over a private knowledge index. */
  readonly knowledge?: KnowledgeRef;
  /** Optional memory namespace this skill reads/writes within. */
  readonly memoryNamespace?: string;
  /** When true, the skill is auto-activated on matching intent; otherwise must be explicitly attached. */
  readonly autoActivate?: (input: string, ctx: SkillContext) => boolean | Promise<boolean>;
}

agent({
  instructions: '...',
  skills: [webResearch, pdfSummarizer, codeReviewer],
});
```

This single addition lets users **package, share, version, and npm-install capability bundles** — the missing layer between "raw tool" and "whole agent" that LangChain has had as `Chain`, CrewAI has as `Crew`, and Agno has as `Toolkit`.

## B6. Adapter Cleanliness Audit — Per Package

Verdict per package on the dimension *"a third party can write a clean adapter today without copy-pasting source"*:

| Package | Adapter contract clean? | Conformance test? | Optional-peer pattern | Verdict |
|---|---|---|---|---|
| `session` | Partial — duplicates contracts/core | None | `require()` (A6) | Needs work |
| `memory` | Multiple stores, no single contract | None | OK in main path, weak in vector | Needs work |
| `knowledge` | `VectorStore` + `RAGEngine` reasonable | None | `@ts-ignore` (A7) | Needs work |
| `models` | Strong base, OpenAI uses `require()` | None | `require()` | Needs polish |
| `tools` | Three shapes (B4 / A10) | None | OK | Needs consolidation |
| `db` | `AgentDb` is the right abstraction | Partial | `require()` | Needs migrations + close fix |
| `background` | 4 queue shapes, all `@ts-ignore` | None | `@ts-ignore` everywhere | Worst-class today |
| `guardrails` | Validator-shape consistent | None | OK | Needs conformance suite |
| `serve` | Middleware-style, runtime-agnostic | None | OK | Needs JWT verifier interface |
| `observe` | Tracer/Logger/Metrics interfaces decent | None | `require()` for OTEL | Needs lint clean + interface freeze |
| `eval` | Scorer/Dataset interfaces clean | None | OK | Needs concurrency limit |
| `graph` | Local re-declares of core interfaces | None | OK | Needs to consume contracts |
| `orchestration` | A2A clean, swarm placeholder | None | OK | Mark swarm experimental |
| `learning` | Dynamic `require()` everywhere | None | `require()` | Mark experimental |
| `production` | Stores well-typed | Partial | OK | Needs overlap audit with guard/db |

**Zero packages ship a public conformance test today.** That is the single most important production-engineering deliverable for the next cycle.

## B7. Production-Grade Engineering Bar — Per-Package Acceptance Criteria

For the framework to claim "best-class engineering across all code," every published package must pass this checklist. Today **0 of 39** pass all criteria.

| # | Criterion | How to verify |
|---|---|---|
| 1 | Zero `eslint-disable` lines except `@typescript-eslint/no-require-imports` until A6 lands | `grep -r "eslint-disable"` in package |
| 2 | Zero `@ts-ignore` / `@ts-expect-error` outside test fixtures | `grep -r "@ts-"` |
| 3 | Zero `any` in public API surface | typed lint passes with strict rules |
| 4 | All public interfaces re-exported from `@confused-ai/contracts` (no local re-declarations) | one-grep audit |
| 5 | Public ID-emitting methods use `crypto.randomUUID()` via `newId()` | grep for `Math.random` |
| 6 | All async public methods accept `AbortSignal` | type audit |
| 7 | All long-running methods emit typed events to `@confused-ai/observe` spans | trace correlation tests |
| 8 | All optional peer deps loaded via typed `tryImport<T>()`, not `require()` | grep |
| 9 | All adapters pass `runXConformance(adapter)` from `@confused-ai/test-utils` | CI gate |
| 10 | Bundle size budget for the package's main entry | size-limit / bundlephobia gate |
| 11 | Lifecycle: `init()`, `close()`, `health()` all tested with real and mock backends | testcontainers + unit |
| 12 | Errors thrown are `ConfusedAIError` with `code` from `ERROR_CODES`, never bare `Error` | grep + types |
| 13 | Public methods documented with `@example` blocks in TSDoc | docs build |
| 14 | Package README explains exactly how to write an adapter, not just how to use one | reviewer signoff |
| 15 | `prepack` runs lint + typecheck + test for the package, gated in CI | pipeline |

A green checklist for every package — that is what "production-grade across the framework" looks like.

## B8. Concrete Cleanup Order (Surgical, 4 PRs)

Doing this in big-bang form will fail. Sequence:

**PR-1 — Contracts as the single source of truth** (low risk, high leverage)
- Move `LLMProvider`, `Message`, `Tool`, `ToolRegistry`, `MemoryStore`, `SessionStore`, `VectorStore`, `EmbeddingProvider`, `Skill` (new) into [packages/contracts/src/](../packages/contracts/src/).
- Have `core`, `agentic`, `graph`, `tools`, `memory`, `session` re-export from contracts, never re-declare.
- Rename `graph`'s `MemoryStore` → `KVStore`.
- Land typed `tryImport<T>` in `@confused-ai/shared`; convert all 14 `require()` sites.

**PR-2 — UUID ID factory + branded IDs** (mechanical codemod)
- Add `newId(prefix?)`, `Brand<T,B>`, `AgentId`, `SessionId`, `RunId`, `MemoryId`, `ToolCallId` to contracts.
- Codemod: 34 `Date.now() + Math.random()` sites → `newId(prefix)`.
- Remove deprecated `String.prototype.substr` site in swarm.

**PR-3 — Conformance suites** (publishes the "extension contract" promise)
- Add `runSessionStoreConformance`, `runMemoryStoreConformance`, `runVectorStoreConformance`, `runToolConformance`, `runProviderConformance`, `runQueueConformance`, `runSkillConformance` to `@confused-ai/test-utils`.
- Run them against every built-in adapter in CI. Document them as the public extension contract.

**PR-4 — `Skill` as first-class** (unlocks composability story)
- Implement `Skill` interface in contracts; add `agent({ skills: [...] })` integration in `createAgent`.
- Ship 3 reference skills: `webResearch`, `pdfSummarizer`, `codeReviewer` under `@confused-ai/skills` (new package, opt-in).
- Document the *"package and ship a skill on npm"* recipe.

Each PR is independently mergeable, independently revertable, and independently visible to users. Total scope is bounded; total impact resets the framework's adapter story to "actually clean."

## Bottom Line

The current claim "pluggable provider-agnostic design" is aspirational. Today the codebase has 5 `SessionStore`s, 3 `MemoryStore`s, 3 `LLMProvider`s, 3 `ToolRegistry`s, 14 `require()`-based optional peers, 12 `@ts-ignore`s, 34 collidable IDs, no `Skill` concept, and 0 conformance tests. After PR-1 through PR-4 above, the same sentence becomes literally true and the framework gains a credible composability story (skills) the competition does not have in the same shape. That is what "clean, neat, extensible to any adapter" actually requires.
