---
title: Changelog
description: All notable changes to Confused-AI
---

# Changelog

All notable changes to `confused-ai` are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · [Semantic Versioning](https://semver.org/)

::: tip Full changelog
The authoritative `CHANGELOG.md` lives in the repository root.  
[View on GitHub →](https://github.com/rvuyyuru2/agent-framework/blob/main/CHANGELOG.md)
:::

## v1.0.0 — Current

### Added

#### Reasoning Module
- `ReasoningManager` — chain-of-thought and self-critique loops over any `generate` function
- `ReasoningEventType` discriminated union: `step`, `action`, `complete`, `error`
- `NextAction` typed decision point: `continue | finish | backtrack | escalate`
- `ReasoningStore` — pluggable trace persistence (audit, replay, fine-tuning)

#### Scheduler Module
- `ScheduleManager` — CRUD for cron-based job schedules with pluggable `ScheduleStore` + `ScheduleRunStore`
- `InMemoryScheduleStore` (dev) / `SqliteScheduleStore` (prod)
- In-process handler registry — no HTTP endpoint required
- Full lifecycle: `create / update / delete / enable / disable / triggerNow / listRuns`

#### CompressionManager
- Transparent context-window compression before LLM calls; `truncate | summarise | rolling` strategies

#### ContextProvider
- Retrieves and injects grounding documents into the system prompt or user message at run time
- Pluggable `ContextBackend`: `InMemoryContextBackend`, `SqliteContextBackend`

#### Freedom Layer — bare / compose / pipe
- `bare(opts)` — zero-defaults agent; caller owns LLM, tools, hooks, everything
- `compose(...agents, opts?)` — sequential pipeline; output of each agent → input of next
- `compose` options: `when` (conditional routing) + `transform` (reshape data between steps)
- `pipe(agent).then(agent).run(prompt)` — builder-style equivalent to `compose()`

#### Eval Regression Suite
- `runEvalSuite` — labeled dataset, per-sample scoring, baseline comparison, CI exit code
- `InMemoryEvalStore` / `SqliteEvalStore` — durable baseline persistence across CI jobs
- `setBaseline: true` — promote current run as new reference; `regressionThreshold` — allowable score drop

#### Real-World Example Library (4 new runnable examples)
- `examples/reasoning-agent.ts` — Incident Triage Bot (no API key needed)
- `examples/scheduled-agent.ts` — Nightly Market Digest (no API key needed)
- `examples/code-review-pipeline.ts` — PR Code Review Pipeline (no API key needed)
- `examples/eval-regression.ts` — CI Eval Regression Guard (no API key needed)

#### Documentation
- [19 · Incident Triage Bot](./examples/19-reasoning) — `ReasoningManager`, event streaming
- [20 · Scheduled Agent Jobs](./examples/20-scheduled-agents) — cron scheduling, run history
- [21 · Code Review Pipeline](./examples/21-code-review-pipeline) — `bare()`, `compose()`, `pipe()`
- [22 · Eval Regression Guard](./examples/22-eval-ci) — `runEvalSuite`, CI baseline guard

---

## v0.7.0

### Added

#### Budget Enforcement
- `budget?: BudgetConfig` added to `CreateAgentOptions` — hard USD caps per run and per user
- `BudgetEnforcer` instantiated in factory, `recordAndCheck(userId)` called after the run loop
- `userId?: string` added to `AgenticRunConfig` for per-user cap enforcement

#### HITL Approval HTTP Endpoints
- `GET /v1/approvals` — list pending approvals
- `POST /v1/approvals/:id` — submit decision `{ approved, comment, decidedBy }`
- `approvalStore?: ApprovalStore` added to `CreateHttpServiceOptions`

#### Distributed Trace Context
- W3C `traceparent` / `tracestate` extraction from incoming HTTP request headers
- `traceId` from incoming trace propagated in JSON and SSE responses
- `src/observability/trace-context.ts` — `extractTraceContext()`, `injectTraceContext()`

---

## v0.6.0

### Added

#### Testing Module (`confused-ai/testing`)
- `MockToolRegistry` — records all invocations; `calls()`, `lastCall()`, `reset()`
- `createTestAgent()` — zero-config test harness with `MockLLMProvider` + `MockSessionStore`
- `createTestHttpService()` — integration test helper on a random port

#### HTTP Runtime
- `X-Request-ID` correlation header on every response
- `rateLimit` middleware option in `CreateHttpServiceOptions`
- `auditStore` option — SQLite-backed persistent audit log
- WebSocket transport (`websocket: true`) — attaches to existing `http.Server`
- Admin API (`adminApi: true`) — `/admin/health`, `/admin/agents`, `/admin/audit`, `/admin/stats`, `/admin/checkpoints`

#### Adapter System (`confused-ai/adapters`)
- 20-category adapter system covering SQL, NoSQL, vector, cache, object storage, message queues, observability, embedding, session, memory, guardrail, RAG, tool registry, auth, rate limiting, audit log
- `createProductionSetup()` — opinionated full-stack wiring with progressive upgrade path

#### LLM Router (`confused-ai/llm`)
- `LLMRouter` — intelligent routing by task type, complexity, and strategy
- Four strategies: `balanced`, `cost`, `quality`, `speed`
- Factories: `createBalancedRouter`, `createCostOptimizedRouter`, `createQualityFirstRouter`, `createSpeedOptimizedRouter`

#### Deployment Templates (`/templates`)
- `Dockerfile`, `docker-compose.yml`, `fly.toml`, `render.yaml`, `k8s.yaml`
- Grafana dashboard JSON (`grafana-dashboard.json`)

#### DX Improvements
- `defineTool()` helper — AI SDK-style fluent builder with Zod schemas, `needsApproval`, streaming hooks
- `createWorkflow().then(step).commit()` — Mastra-style typed step workflows
- `createStepWorkflow`, `StepWorkflow`, `StepWorkflowBuilder`, `StepWorkflowStep` exports

#### Resilience
- `withResilience()` — circuit breaker + rate limiter + retry + health check wrapper
- `RedisRateLimiter` — distributed rate limiting via Redis

#### Secret Manager (`confused-ai/config`)
- `createSecretManager()` with adapters: `EnvSecretManagerAdapter`, `AwsSecretsManagerAdapter`, `AzureKeyVaultAdapter`, `VaultAdapter`, `GcpSecretManagerAdapter`

#### Orchestration Extensions
- `AgentRouter` — capability-based, round-robin, least-loaded routing
- `HandoffProtocol` — structured agent-to-agent task handoff with tracing
- `ConsensusProtocol` — multi-agent voting (majority, unanimous, weighted, best-of-n)

---

## v0.5.0

### Added
- Checkpoint/resume for long-running agents — `checkpointStore?` in `AgenticRunnerConfig`
- `createSqliteSessionStoreSync` — sync init, safe for factory use
- Persistent user profiles and learning modes
- Eval dataset persistence — `EvalStore`, `InMemoryEvalStore`, `SqliteEvalStore`, `runEvalSuite`
- Plugin system — `confused-ai/plugins` with built-in logging, rate-limit, telemetry plugins
- Contracts layer — `confused-ai/contracts` for shared interfaces without runtime code

---

## v0.4.0

### Added
- Full adapter system for all infrastructure categories
- Multi-tenancy with `createTenantContext()`
- JWT RBAC on HTTP routes
- SOC 2 / HIPAA audit trail

---

## v0.3.0

### Added
- ReAct agentic loop with `createAgent`
- `createHttpService` HTTP runtime with OpenAPI
- 50+ built-in tools
- RAG / KnowledgeEngine

---

## v0.1.0

Initial release.
