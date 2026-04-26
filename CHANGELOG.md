# Changelog

All notable changes to `fluxion` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- (your changes here)

---

## [0.6.0] — Current

### Added

#### Testing Module (`fluxion/testing`)
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
- `fluxion serve <file>` — new command; imports an agent file and starts the HTTP service on a configurable port; graceful SIGINT/SIGTERM handling
- `fluxion eval <dataset> --agent <file>` — new command; runs a JSON dataset against an agent and reports accuracy; CI-friendly exit code
- `fluxion run --watch` — fully implemented watch mode using `fs.watch()` with 150ms debounce and module cache busting
- `fluxion doctor` — complete rewrite: checks Node.js version, all LLM provider API keys, 7 optional packages, and network connectivity
- `fluxion create` — complete rewrite: multi-template scaffold (`basic`, `http`) generating `agent.ts`, `package.json`, `tsconfig.json`, `.env.example`, `README.md`

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
- CLI scaffold (`fluxion create`)
