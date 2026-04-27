# Changelog

All notable changes to `confused-ai` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
