# Changelog

All notable changes to `confused-ai` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## 1.0.0 (2026-05-05)


### Features

* add additional tools and configurations ([5b21948](https://github.com/confused-ai/confused-ai/commit/5b2194863bff2a9e3961108f2146fd91f02621dc))
* add CI, CodeQL, and stale workflows; implement Dependabot configuration ([0667e59](https://github.com/confused-ai/confused-ai/commit/0667e59efb5f6c9d03ac42da0a34dab887419218))
* add Delightful DX and Enterprise sections with interactive components ([29d9d43](https://github.com/confused-ai/confused-ai/commit/29d9d4373456870bd8f6b3533a6719dbf52cb262))
* add examples for code review pipeline, eval regression guard, reasoning agent, and scheduled agent ([583821a](https://github.com/confused-ai/confused-ai/commit/583821a5c09c3c650319e3374a04bb71a9a7f7e7))
* add feedback handling and session fallback store ([66721de](https://github.com/confused-ai/confused-ai/commit/66721de18e70302c18d9ebd1ad0cee2994dfba79))
* add file system utility tools for reading, writing, and managing files ([a796e34](https://github.com/confused-ai/confused-ai/commit/a796e34782087049e0cad6dbc73e047a3698924f))
* add HTTP client tool for making web requests ([a796e34](https://github.com/confused-ai/confused-ai/commit/a796e34782087049e0cad6dbc73e047a3698924f))
* add knowledgebase support and optional buildContext method to agent factory and RAGEngine interface ([318409a](https://github.com/confused-ai/confused-ai/commit/318409aa2ddf81a880c26166918dbaabde7d6c5c))
* add scheduler types and interfaces for schedule management ([b48b041](https://github.com/confused-ai/confused-ai/commit/b48b0412f2541ad149867749761d7b648a32eb16))
* add SQLite-backed learning stores for user memories, session contexts, learned knowledge, entity memories, and decision logs ([7a9db29](https://github.com/confused-ai/confused-ai/commit/7a9db29c225639fdd1af6a316ae787ea9178fa75))
* add turbo.json for task management and update.md for architecture guidelines ([481d1ac](https://github.com/confused-ai/confused-ai/commit/481d1ac1e0398b880642644a19e31f9a60942167))
* bump version to 0.8.1 ([dd5e7f2](https://github.com/confused-ai/confused-ai/commit/dd5e7f2cda51670edbb3e9e318e12e45283d1d5c))
* create DbScheduleStore for managing schedules in AgentDb ([7a9db29](https://github.com/confused-ai/confused-ai/commit/7a9db29c225639fdd1af6a316ae787ea9178fa75))
* create utility index for easy access to tools ([a796e34](https://github.com/confused-ai/confused-ai/commit/a796e34782087049e0cad6dbc73e047a3698924f))
* enhance CtaBanner with copy functionality and improved styling ([f7763b5](https://github.com/confused-ai/confused-ai/commit/f7763b5b3651feddee054ace9c5a16e1c310cb56))
* enhance Graph Engine with durable execution, wave scheduling, and testing utilities ([9e6640b](https://github.com/confused-ai/confused-ai/commit/9e6640b9d229013c9a0d0487e9be9ba28ae5b72c))
* enhance README and documentation links, update package metadata ([9725a47](https://github.com/confused-ai/confused-ai/commit/9725a4793ffb04b267ea0ec0db88a7c521440876))
* enhance voice module with OpenAI and ElevenLabs support for TTS and STT ([bb1bb6b](https://github.com/confused-ai/confused-ai/commit/bb1bb6b3bf6666d8e37cacc42b7231d3c6ba4104))
* expand entry points in tsup configuration to include additional source files ([c9866d2](https://github.com/confused-ai/confused-ai/commit/c9866d2401920b96fe2ddb77f566e5ea6896930c))
* expand workflows documentation with advanced features ([bb1bb6b](https://github.com/confused-ai/confused-ai/commit/bb1bb6b3bf6666d8e37cacc42b7231d3c6ba4104))
* implement caching and compression for tool execution results ([bdc6c1e](https://github.com/confused-ai/confused-ai/commit/bdc6c1e9df4ab5b0b395f1a54003702a73e2513b))
* implement DbSessionStore for session management ([7a9db29](https://github.com/confused-ai/confused-ai/commit/7a9db29c225639fdd1af6a316ae787ea9178fa75))
* implement graph test runner with mock LLM provider and event assertions ([b48b041](https://github.com/confused-ai/confused-ai/commit/b48b0412f2541ad149867749761d7b648a32eb16))
* implement shell tool for executing shell commands with security measures ([a796e34](https://github.com/confused-ai/confused-ai/commit/a796e34782087049e0cad6dbc73e047a3698924f))
* introduce DbMemoryStore for persistent memory management ([7a9db29](https://github.com/confused-ai/confused-ai/commit/7a9db29c225639fdd1af6a316ae787ea9178fa75))
* **playground:** add interactive agent playground with HTTP server and UI ([4632935](https://github.com/confused-ai/confused-ai/commit/463293521cb6c95a3f63c10afb776deadeec15d0))
* update documentation and improve site configuration ([48888e6](https://github.com/confused-ai/confused-ai/commit/48888e643220c8858e468357e734c75759f8f291))
* update roadmap with cumulative budget, risk register, and governance details; refactor session store and type definitions ([4bb9292](https://github.com/confused-ai/confused-ai/commit/4bb9292b9fa51e377c2eb464747ab77932333ca1))
* update version to 0.8.0 and refactor import paths for consistency ([f5d7fd6](https://github.com/confused-ai/confused-ai/commit/f5d7fd68c5483fc516e441a47323f62501ccc930))
* update version to 1.0.0 in package.json and version.ts ([716e8f0](https://github.com/confused-ai/confused-ai/commit/716e8f0fa64fabbc647747d82e3b3b5b8851f95f))


### Bug Fixes

* add missing Tool fields in MockToolRegistry ([63a35ab](https://github.com/confused-ai/confused-ai/commit/63a35abb7c5faa6967a3478085745aa70e4f18d0))
* remove static.yml, fix deploy-docs to build VitePress on all pushes ([93b0978](https://github.com/confused-ai/confused-ai/commit/93b09782370742f05b8e6407179e057c89ec1668))
* update built-in adapter versions to 1.2.0 ([bb1bb6b](https://github.com/confused-ai/confused-ai/commit/bb1bb6b3bf6666d8e37cacc42b7231d3c6ba4104))
* update hero text to improve clarity and impact ([1f6d444](https://github.com/confused-ai/confused-ai/commit/1f6d4442dafb98132f91172aad7ab0eae87bce6c))
* update llmProvider to llm in eval-regression examples and rename manager methods in scheduled-agent ([28409ca](https://github.com/confused-ai/confused-ai/commit/28409ca1a7c7f4b7ac520994d5c6319aed94740d))
* update version to 1.0.1 in package.json ([be55c8a](https://github.com/confused-ai/confused-ai/commit/be55c8a57a343ffa7e2051af331b1d7983b3a51a))

## [1.1.7] — 2026-05-04

### Added

- **`DbScheduleStore`** (`packages/scheduler`) — bridges `ScheduleManager` with any `AgentDb` backend. Pass any `AgentDb` instance (SQLite, Postgres, MySQL, MongoDB, Redis, DynamoDB, Turso, JSON) as the `ScheduleStore` without writing custom persistence code. Exported from `confused-ai/scheduler`.
- **DB health in `/health` endpoint** — `CreateHttpServiceOptions` now accepts `db?: AgentDb`. When set, `GET /health` and `GET /v1/health` run a live `db.health()` probe and return HTTP 503 with `{ status: 'degraded' }` if the database is unreachable.

### Fixed

- **`@confused-ai/db` — `uuid()` not cryptographically secure** — all 8 backends now use `crypto.randomUUID()` via a shared `packages/db/src/utils.ts` module (was `Math.random()`-based).
- **`@confused-ai/db` — `init()` race condition** — concurrent callers no longer double-initialize the connection pool. Async backends (Postgres, MongoDB, MySQL, DynamoDB, Turso) now guard with a shared `_initPromise`.
- **`PostgresAgentDb`** — `getKnowledgeItems()`, `getTrace()`, and `getTraces()` now re-serialize JSONB `content` / `metadata` columns back to strings. The `pg` driver returns JSONB as parsed objects, not strings; this caused type contract violations for consumers expecting `string | null`.
- **`PostgresAgentDb`** — `close()` method was accidentally removed during a refactor; restored.
- **`MongoAgentDb`** — all `findOne()` and `find()` calls now include `{ projection: { _id: 0 } }`, preventing MongoDB's internal `_id` ObjectId field from leaking into `SessionRow`, `MemoryRow`, and other row types.
- **`DynamoDbAgentDb`** — constructor now calls `validateTableNames()` to catch misconfigured table names at startup rather than at first use.
- **`TursoAgentDb`** — single-row casts (`LibSqlRow → SessionRow` etc.) now use the `as unknown as T` double-cast pattern, fixing TypeScript strict-mode errors.
- **`DbSessionStore`** (`packages/session`) — `now()` helper now returns Unix epoch **seconds** (`Math.floor(Date.now() / 1000)`) matching the `AgentDb` timestamp contract. Was returning milliseconds, causing `created_at`/`updated_at` to be stored 1000× too large.

---

## [1.1.6] — 2026-05-04

### Changed

- **Monorepo structure** — all source code now lives in independently-built workspace packages under `packages/`. `src/` retained as backward-compatible re-export barrel.
- **`packages/tools`** — rewrote `shell`, `browser`, and `types` as clean functional `defineTool` implementations; removed all class-based files with broken `../core/` relative imports.
- **`packages/test-utils`** — complete standalone implementation of `createMockLLM`, `createMockAgent`, `runScenario`; zero cross-package dependencies.
- **CI** — updated to 4 jobs: `typecheck → lint → test (Node 18/20/22) → build all packages`.

### Fixed

- `router/selectForBudget`: removed incorrect `* 1_000_000` scaling; budget comparison is now direct dollar-per-million.
- `adapter-redis/session-store`: removed unnecessary optional chain on non-null `hGetAll` result; fixed template literal number type.
- `tools/types.ts`: migrated from deprecated `ZodTypeAny` → `z.ZodType`, `_def` → `.def`.
- Removed 33 broken package copies that had relative `src/`-path imports.
- Docs URL: replaced all `rvuyyuru2.github.io/agent-framework` references with `confused-ai.github.io/confused-ai`.
- Version consistency: `ARCHITECTURE.md` and `SECURITY.md` now match `package.json` version `1.1.6`.

### Security

- `SECURITY.md`: added ShellTool sandbox requirements section.
- `SECURITY.md`: documented `RedisRateLimiter` for multi-instance rate limiting.
- `README.md`: qualified audit logging claim — removed SOC2/HIPAA label; added compliance footnote.

---

## [1.1.0] — 2026-04-27

### Added

- **`agent.stream()`** — every `CreateAgentResult` now exposes `stream(prompt, options?)` returning `AsyncIterable<string>`. Stream agent output with `for await` loops; accepts all `run()` options except `onChunk`.
- **`defineAgent().budget(config)`** — set per-run / per-user / monthly USD caps directly on the fluent builder without dropping to `createAgent()`.
- **`defineAgent().checkpoint(store)`** — wire a durable checkpoint store in one builder call.
- **`defineAgent().adapters(registry)`** — plug in adapter registry or explicit `AdapterBindings` via the builder.

### Performance

- **`AgenticRunner`** — Zod→JSON Schema conversion (`toolToLLMDef`) is now computed **once** in the constructor and reused on every `run()` call. Previously computed fresh on every run.
- **Tool execution** — fixed `Promise.race` timer leak: the 30-second timeout handle is now always cleared via `.finally()`, preventing timer accumulation in long-running processes. Timing switched to `performance.now()` for sub-millisecond accuracy.
- **`AuditPlugin`** — `getEventsByType()`, `getEventsForNode()`, and `getEventsForExecution()` are now O(1) index lookups backed by internal `Map`s maintained on each `onEvent()` call. Previously O(n) full array scans.
- **`OpenTelemetryPlugin`** — the `@opentelemetry/api` dynamic import is cached after the first successful load. Previously re-imported on every `onNodeStart()` call.

### Fixed

- **`compose()`** — agent detection now uses a precise three-field type guard (`run` + `instructions` + `createSession`) instead of fragile duck-typing, preventing accidental misclassification of option objects as agents.

---

## [1.0.0] — 2026-05-18

### Added

#### Reasoning Module (`confused-ai/reasoning`)
- `ReasoningManager` — drives chain-of-thought and self-critique loops over a `generate` function; fully framework-agnostic (pass any LLM call)
- `ReasoningConfig` — `{ generate, minSteps, maxSteps, systemPrompt, temperature }`; configurable step counts and system prompt override
- `ReasoningEventType` — discriminated union: `step`, `action`, `complete`, `error` — iterate with `for await`
- `NextAction` — typed decision point: `continue | finish | backtrack | escalate`; `ReasoningStep` captures thought + observation + next action
- `ReasoningStore` — pluggable persistence for full reasoning traces (audit, replay, fine-tuning)
- Exported from `confused-ai/reasoning` subpath

#### Scheduler Module (`confused-ai/scheduler`)
- `ScheduleManager` — CRUD for cron-based job schedules; pluggable `ScheduleStore` + `ScheduleRunStore` backends
- `InMemoryScheduleStore` / `InMemoryScheduleRunStore` — zero-config for dev and testing
- `SqliteScheduleStore` / `SqliteScheduleRunStore` — durable persistence; survives process restarts
- `CreateScheduleInput` — `{ name, cronExpr, endpoint, enabled, maxRetries, retryDelaySeconds }`
- `ScheduleRunStatus` — `pending | running | success | failed | skipped`
- `manager.register(key, handler)` — in-process handler registry; no HTTP endpoint required
- `manager.create / update / delete / enable / disable` — full lifecycle CRUD
- `manager.triggerNow(id)` — manual trigger for backfill / testing
- `manager.listRuns(id, limit)` — query run history with status, duration, error
- `manager.start() / stop()` — poll loop lifecycle
- Exported from `confused-ai/scheduler` subpath

#### CompressionManager (`confused-ai/compression`)
- `CompressionManager` — transparently compresses context windows before LLM calls; pluggable strategy (`truncate | summarise | rolling`)
- `CompressionConfig` — `{ strategy, targetTokens, summaryPrompt, model }`
- Automatic trigger when token estimate exceeds `targetTokens`; preserves system prompt + most-recent N messages unconditionally
- Exported from `confused-ai/compression` subpath

#### ContextProvider (`confused-ai/context`)
- `ContextProvider` — retrieves grounding documents and injects them into the system prompt or user message at run time
- `ContextBackend` — pluggable retrieval backend: `InMemoryContextBackend`, `SqliteContextBackend`; implement `search(query, k)` for custom backends
- `ContextMode` — `prepend | append | system` — controls injection point
- `Document` — `{ id, content, metadata }`; `Answer` — `{ text, sources }`
- Exported from `confused-ai/context` subpath

#### Freedom Layer — bare / compose / pipe (`confused-ai`)
- `bare(opts)` — zero-defaults agent constructor; caller provides LLM, tools, hooks, everything; no sessions, no injected tools, no guardrails
- `BareAgentOptions` — `{ name, instructions, llm, tools?, hooks?, maxSteps?, timeoutMs? }`
- `compose(...agents, opts?)` — pipe N agents sequentially; output text of step N → input of step N+1
- `ComposeOptions` — `{ when?, transform? }` — conditional routing and data reshaping between steps
- `pipe(agent).then(agent).run(prompt)` — builder-style alternative to `compose()` with identical semantics
- `hooks.buildSystemPrompt` / `hooks.afterRun` — lifecycle interception on every `bare()` agent
- Exported from top-level `confused-ai` import

#### Eval Regression Suite (`confused-ai/observability`)
- `runEvalSuite({ suiteName, dataset, agent, store, scorer, passingScore, regressionThreshold, setBaseline, onSample })` — run a labeled dataset, score every sample, compare to baseline
- `EvalStore` interface — `appendSample`, `appendRun`, `querySamples`, `queryRuns`, `getBaseline`, `saveBaseline`
- `InMemoryEvalStore` — zero-config for dev; `SqliteEvalStore` — durable CI persistence
- `EvalReport` — `{ suiteRunId, suiteName, averageScore, passedCount, totalCount, passed, regressionDelta, baselineScore, samples }`
- `EvalDatasetItem` — `{ input, expectedOutput? }`; `EvalScorer` — `(input, expected, actual) => number | Promise<number>`
- `setBaseline: true` — saves the current run as the reference; subsequent runs compare against it
- `regressionThreshold` — decimal fraction; suite fails if `averageScore < baselineScore - threshold`
- CI-friendly: `process.exit(1)` on regression; `EXIT_ON_REGRESSION` env var pattern documented

#### Real-World Example Library
- `examples/reasoning-agent.ts` — **Incident Triage Bot**: uses `ReasoningManager` with a mock `generate` function to demonstrate 4-step chain-of-thought diagnosis and remediation plan; no API key required
- `examples/scheduled-agent.ts` — **Nightly Market Digest**: demonstrates `ScheduleManager` CRUD, cron scheduling (`0 9 * * 1-5`), handler registry, `triggerNow`, run history, enable/disable; no API key required
- `examples/code-review-pipeline.ts` — **PR Code Review Pipeline**: three `bare()` agents (DiffAnalyser, SecurityReviewer, ReportWriter) wired with `compose()`, `pipe()`, and conditional `when` hand-off; no API key required
- `examples/eval-regression.ts` — **CI Eval Regression Guard**: three back-to-back `runEvalSuite` calls (baseline → regression → fixed) using `MockLLMProvider`; custom `wordOverlapF1Scorer`; no API key required

#### Documentation (docs/examples/)
- `19-reasoning.md` — Incident triage with `ReasoningManager`, event streaming patterns, production wiring
- `20-scheduled-agents.md` — Fintech market digest scheduling, cron syntax reference, persistent store swap
- `21-code-review-pipeline.md` — `bare()` vs `createAgent()` comparison, all three composition styles, GitHub Actions integration
- `22-eval-ci.md` — Eval dataset design, word-overlap F1 scorer, SQLite persistence, full CI workflow

### Changed
- `package.json` scripts: added `example:reasoning`, `example:scheduled`, `example:code-review`, `example:eval`
- `docs/examples/index.md`: added rows 19–22 to the example table; updated framework map runnable list
- `src/shared/version.ts`: `VERSION` bumped from `0.3.0` → `1.0.0`

---

## [0.7.0] — 2026-04-27

### Added

#### Budget Enforcement
- `budget?: BudgetConfig` added to `CreateAgentOptions` — configure `maxUsdPerRun`, `maxUsdPerUser`, `maxUsdPerMonth`, and `onExceeded` behaviour (`'throw' | 'warn' | 'truncate'`)
- `BudgetEnforcer` instantiated in factory.ts; `budgetEnforcer?.resetRun()` called before each run
- `addStepCost()` called in `runner.ts` after each LLM call when `result.usage` is present
- `recordAndCheck(userId)` called in runner.ts after the run loop to enforce per-user daily + monthly caps
- `userId?: string` added to `AgenticRunConfig` for per-user cap enforcement
- `BudgetExceededError` thrown when a cap is crossed and `onExceeded === 'throw'`

#### HITL Approval HTTP Endpoints
- `approvalStore?: ApprovalStore` added to `CreateHttpServiceOptions`
- `GET /v1/approvals` — lists all pending approval requests
- `POST /v1/approvals/:id` — submits a decision `{ approved: boolean, comment?: string, decidedBy: string }`
- Both routes wired in `server.ts` and documented in the OpenAPI spec

#### Distributed Trace Context
- `extractTraceContext()` imported and called in `server.ts` from incoming request headers (`traceparent`, `tracestate`)
- `traceId` from the incoming trace is propagated in JSON responses and SSE event streams

#### Graph Engine Production Hardening
- `DurableExecutor` class — wraps `DAGEngine` + `EventStore` for fully durable execution; `.run()` starts a new execution, `.resume(executionId)` replays all events and continues from the last incomplete node; detects graph version mismatch on resume
- `computeWaves(graph: GraphDef): NodeId[][]` — topological level assignment returning groups of nodes that can execute in parallel, used internally by the scheduler and available for custom scheduling
- `BackpressureController(maxConcurrency)` — semaphore for concurrency control; `.acquire()` waits for a free slot, `.release()` frees one, `.inflight` and `.queueDepth` expose current state
- Graph testing utilities exported from `confused-ai/testing`: `createTestRunner(opts?)`, `createMockLLMProvider(name, responses)`, `expectEventSequence(actual, expected)` (subset match), `assertExactEventSequence(actual, expected)` (strict match)
- 4 new CLI commands: `confused-ai replay --run-id <id>` (stream events), `confused-ai inspect --run-id <id>` (per-node summary), `confused-ai export --run-id <id> [--out file]` (dump to JSON), `confused-ai diff --run-id-a <id> --run-id-b <id>` (compare two runs; exits `1` if divergent)
- Benchmark suite under `benchmarks/` with 4 files targeting: executor (<1ms), event-store (>5 k writes/sec), replay (>10 k events/sec), graph-compile (<5ms); run via `bun run bench`
- ESLint layer-boundaries config (`eslint.config.js`) using `eslint-plugin-boundaries` to block illegal cross-layer imports

---

## [0.6.0]

### Added

#### Testing Module (`confused-ai/testing`)
- `MockToolRegistry` — records all tool invocations for assertion in tests; supports `calls()`, `lastCall()`, `reset()`, `register()`, `toTools()`
- `createTestAgent()` — zero-config test harness that auto-wires `MockLLMProvider` + `MockSessionStore`
- `createTestHttpService()` — integration test helper that starts a real HTTP server on a random port with `.request()`, `.close()`, `.port`, `.baseUrl`
- Exported `./testing` subpath from package.json and tsup config

#### HTTP Runtime
- **X-Request-ID correlation**: Every HTTP response now includes `X-Request-ID` header, assigned at the start of request handling. Forwarded from incoming `x-request-id` header when present.
- **Rate limiting middleware**: `CreateHttpServiceOptions.rateLimit` option wires any `{ check(key): Promise<void> | void }` implementation (e.g. `RateLimiter`) into the HTTP middleware stack. Keyed on authenticated identity, `X-Forwarded-For`, or remote address. Returns 429 with JSON error on limit exceeded.

#### JWT RBAC
- `verifyJwtAsymmetric(token, publicKeyPem, algorithm)` — RS256/RS384/RS512/ES256/ES384/ES512 verification using Node.js `crypto.createVerify` (no external deps)
- `jwtAuth({ publicKey, algorithm })` — asymmetric verification path when `publicKey` is provided
- `algorithm` option on `JwtAuthOptions` for explicit algorithm selection

#### CLI
- `confused-ai serve <file>` — new command; imports an agent file and starts the HTTP service on a configurable port; graceful SIGINT/SIGTERM handling
- `confused-ai eval <dataset> --agent <file>` — new command; runs a JSON dataset against an agent and reports accuracy; CI-friendly exit code
- `confused-ai run --watch` — fully implemented watch mode using `fs.watch()` with 150ms debounce and module cache busting
- `confused-ai doctor` — complete rewrite: checks Node.js version, all LLM provider API keys, 7 optional packages, and network connectivity
- `confused-ai create` — complete rewrite: multi-template scaffold (`basic`, `http`) generating `agent.ts`, `package.json`, `tsconfig.json`, `.env.example`, `README.md`

#### Package Exports
- Added `./testing`, `./learning`, `./video`, `./config` subpaths to package.json
- Added corresponding entries to tsup build config

#### Type Infrastructure
- `tsconfig.test.json` — separate tsconfig for test files with `"types": ["bun-types", "node"]`; enables Node.js types in tests without polluting source compilation
- `vitest.config.ts` — `typecheck.tsconfig` now points to `tsconfig.test.json`

#### Tests
- `tests/jwt-rbac.test.ts` — HS256 verification, tamper detection, expiry, wrong secret, `hasRole`, `jwtAuth` factory
- `tests/testing-utils.test.ts` — `MockToolRegistry`, `MockLLMProvider`, `MockSessionStore` assertions
- `tests/guardrails.test.ts` — PII detection, prompt injection, `GuardrailValidator`, URL validation
- `tests/budget.test.ts` — `BudgetEnforcer`, `BudgetExceededError`, `estimateCostUsd`, per-user daily limits
- `tests/storage.test.ts` — in-memory and file-based storage adapters

#### Documentation
- `SECURITY.md` — vulnerability reporting, JWT security guidance, hardening checklist
- `CONTRIBUTING.md` — setup, coding standards, PR process, release flow
- `CHANGELOG.md` — this file

### Fixed
- `runtime.test.ts` — `AgenticRunResult.markdown` was missing from mock return, causing type errors

---

## [0.5.0]

### Added

#### HTTP Runtime
- JWT RBAC middleware (`jwtAuth`, `verifyJwtHs256`, `hasRole`)
- OpenAPI schema generation endpoint (`/v1/openapi.json`)
- Server-sent events (SSE) streaming for long-running agent runs
- WebSocket support for bidirectional agent communication
- Admin API (`/v1/admin/health`, `/v1/admin/sessions`, `/v1/admin/circuit-breakers`)
- Audit log integration with `pushAudit()` on all request lifecycle events

#### Production
- `BudgetEnforcer` — hard USD caps per run, per user (daily), and per month
- `BudgetExceededError` with structured `cap`, `limitUsd`, `spentUsd`, `runCostUsd` fields
- `HealthChecker` — aggregated health endpoint for LLM providers, storage, and custom checks
- HITL (Human-in-the-loop) HTTP endpoints for approval workflows

#### Observability
- OpenTelemetry distributed trace context propagation (`traceparent` header injection/extraction)
- `EvalStore` for storing agent evaluation results

#### Adapters
- 20-category adapter registry: LLM, vector DB, storage, cache, message queue, observability, auth, email, SMS, payment, analytics, search, file, calendar, CRM, ERP, IoT, blockchain, multimedia, custom
- Production adapter bundle (Redis rate limiter, S3 storage, PostgreSQL session)

---

## [0.4.0]

### Added
- Agentic runner with configurable step limit, timeout, and tool execution
- Multi-agent orchestration: `AgentTeam` (parallel) and `SupervisorAgent` (sequential delegation)
- Long-term memory with vector similarity search
- RAG (Retrieval-Augmented Generation) knowledge base
- Background queue processing (BullMQ integration)
- Checkpoint/resume for long-running agentic tasks
- Circuit breaker with half-open probe on LLM provider failures
- Cost tracker with per-model pricing (`MODEL_PRICING` map)
- Plugin system with lifecycle hooks (onStart, onStep, onEnd, onError)

---

## [0.3.0]

### Added
- Session management with in-memory and persistent stores
- Lifecycle hooks system (`beforeRun`, `afterStep`, `afterRun`, `onError`, `onToolCall`)
- Structured artifact output (markdown, JSON, image, file, chart)
- LLM router (cost-based, performance-based, smart classification)
- Streaming token output via async iterators

---

## [0.2.0]

### Added
- Core `createAgent()` and `Agent` class
- Multi-provider LLM support: OpenAI, Anthropic Claude, Google Gemini, OpenRouter, AWS Bedrock
- Tool system with Zod schema validation
- `GuardrailValidator`, PII detection, prompt injection detection
- Rate limiter with sliding window algorithm
- `InMemorySessionStore`, `InMemoryCheckpointStore`

---

## [0.1.0]

### Added
- Initial release
- Basic agent with single LLM call
- OpenAI provider
- CLI scaffold (`confused-ai create`)
