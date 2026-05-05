# Strategic Transformation Roadmap — confused-ai

> **Document class:** Executive strategy + engineering delivery plan  
> **Current version:** 1.1.7  
> **Horizon:** 3 release cycles (v1.2, v1.3, v2.0)  
> **Last reviewed:** May 2026

---

## Purpose

This document serves as the authoritative planning instrument for transforming confused-ai from a feature-rich TypeScript framework into the dominant enterprise-grade agentic infrastructure for TypeScript deployments. It synthesizes findings from four parallel workstreams:

1. Architectural documentation re-engineering
2. Competitive gap analysis (Agno, LangChain, CrewAI)
3. Enterprise production-readiness audit
4. Developer experience optimization

---

## Strategic Positioning

### Target Market Definition

confused-ai targets **TypeScript teams shipping LLM-powered features to production** who require:
- Enterprise-grade reliability (SLAs, budget controls, audit trails)
- Composable architecture (not a monolithic agent framework)
- Zero vendor lock-in (pluggable everything)
- TypeScript-first type safety (not a Python port)

### Differentiation Statement

> "confused-ai is the only TypeScript agent framework that treats production infrastructure — budget enforcement, idempotency, circuit breakers, multi-tenancy, durable execution — as day-one features, not afterthoughts."

This is the moat. Every roadmap decision must reinforce this position.

---

## Current State Assessment (v1.1.7 Baseline)

### Strengths

| Strength | Evidence |
|----------|---------|
| Production safety primitives | `BudgetEnforcer`, `IdempotencyGuard`, `CircuitBreaker` — unique in cohort |
| TypeScript type safety end-to-end | Zod→JSON Schema→TypeScript flow; full inference |
| Durable graph execution | `DurableExecutor` with event sourcing and crash-resume |
| Multi-tenancy native | `TenantContext` with per-tenant isolation |
| Observability completeness | OTLP, Langfuse, LangSmith, audit log, Grafana template |
| MCP ecosystem | Both client and server, bidirectional |
| Test infrastructure | `createMockLLM()`, `runScenario()`, eval aggregators |

### Critical Gaps (requiring v1.2 resolution)

| Gap | Risk Level | Competitive Impact |
|-----|-----------|-------------------|
| Agent-driven memory (no `remember`/`recall` tools) | High | Agno parity required |
| ShellTool default-deny security posture | Critical | Production security gate |
| HttpClientTool SSRF prevention | High | Cloud security gate |
| Tool-level authorization per tenant | High | Compliance requirement |
| PostgreSQL audit/checkpoint stores | Medium | Operational consistency |

### Strategic Opportunities

| Opportunity | Competitive Advantage |
|-------------|----------------------|
| VS Code extension | No framework in cohort has one |
| Interactive REPL (`confused-ai chat`) | Developer productivity gap |
| Helm chart | Enterprise K8s deployment standard |
| Prometheus native endpoint | Platform engineering adoption |
| Feedback/annotation API | Eval loop closure |

---

## Roadmap by Release

### v1.2 — Security Hardening & Memory Parity *(Target: 6 weeks)*

**Theme:** Close the two critical gaps that block enterprise production adoption: security vulnerabilities and agent-driven memory.

#### Security Track (P0 — unblocks enterprise sales)

| Task | Owner Package | Effort | Acceptance Criteria |
|------|--------------|--------|---------------------|
| ShellTool: enforce `allowedCommands` default-deny | `packages/tools` | 3 days | Empty allowlist blocks all commands; docs updated |
| HttpClientTool: SSRF prevention (domain allowlist + block metadata IPs) | `packages/tools` | 3 days | `169.254.169.254` blocked by default; `allowedDomains` option works |
| Tool authorization via `TenantContext.allowedTools` | `packages/core` + `packages/production` | 5 days | Tenant without tool in allowlist receives `ToolNotAuthorizedError` |
| Secret masking in `ConsoleLogger` | `packages/observe` | 1 day | API key patterns masked as `[REDACTED]` in log output |
| `retentionDays` option on `SessionStore` and `MemoryStore` | `packages/session` + `packages/memory` | 4 days | Records expire after configured TTL |

#### Memory Track (P0 — required for Agno feature parity)

| Task | Owner Package | Effort | Acceptance Criteria |
|------|--------------|--------|---------------------|
| `AgentDrivenMemory` — `remember(fact, tags)` system tool | `packages/memory` | 8 days | Agent can call `remember` and `recall` without dev config; facts persist in MemoryStore |
| `SummaryBufferMemory` middleware | `packages/memory` | 5 days | Session automatically summarizes old messages when context exceeds threshold |
| Embedding result cache | `packages/knowledge` | 4 days | Repeated queries hit cache; configurable TTL |
| Cascade delete: `deleteSession()` removes memory + audit | `packages/session` + `packages/db` | 3 days | GDPR-compliant deletion verified by integration test |

#### Observability Track (P1)

| Task | Owner Package | Effort | Acceptance Criteria |
|------|--------------|--------|---------------------|
| `traceId`/`spanId` injection into all log lines | `packages/observe` | 2 days | Log records include OTLP trace context when span is active |
| Missing metrics: `agent.context_window.utilization`, `agent.tool.duration` | `packages/observe` | 3 days | Metrics appear in OTLP export |
| `POST /v1/feedback` endpoint + `FeedbackStore` | `packages/serve` + `packages/eval` | 5 days | Annotations persisted; queryable via `FeedbackStore.list()` |
| Native Prometheus `/metrics` endpoint | `packages/serve` | 4 days | `prometheusExporter: true` in HTTP service config |

#### Infrastructure Track (P1)

| Task | Owner Package | Effort | Acceptance Criteria |
|------|--------------|--------|---------------------|
| `PostgresAuditStore` | `packages/db` | 3 days | Full parity with `SqliteAuditStore` interface |
| `PostgresCheckpointStore` | `packages/db` | 3 days | Full parity with `SqliteCheckpointStore` interface |
| `halfOpenSuccessThreshold` in `CircuitBreakerConfig` | `packages/guard` | 1 day | Configurable N-success threshold in HALF-OPEN state |
| Session store graceful degradation (`fallback: 'in-memory'`) | `packages/session` | 4 days | Agent continues on store failure with in-memory fallback |

**v1.2 Definition of Done:**
- All P0 security items complete and verified by security review
- Agent-driven memory working in integration test with real OpenAI API
- No regressions: full CI suite passes on Node 18/20/22
- `PRODUCTION-READINESS-AUDIT.md` updated to reflect resolved items
- CHANGELOG.md updated

---

### v1.3 — Developer Experience & Ecosystem Expansion *(Target: 10 weeks post-v1.2)*

**Theme:** Reduce time-to-first-agent from 15 minutes to 2 minutes; expand the ecosystem to compete with LangChain's integration breadth.

#### DX Track

| Task | Effort | Description |
|------|--------|-------------|
| `confused-ai chat [agent-file]` CLI REPL | 6 days | Interactive terminal session with any agent |
| `defineRole()` helper for CrewAI-style role authorship | 2 days | `defineRole({ role, backstory, goal })` generates system prompt |
| `createTeam({ mode, agents })` ergonomic wrapper | 3 days | `'route' \| 'coordinate' \| 'collaborate'` modes |
| Hot-reload dev server (`confused-ai dev`) | 5 days | Watches agent file, restarts on change, opens REPL |
| Improved error messages with `Did you mean...?` suggestions | 4 days | `ToolNotFoundError` suggests closest tool name |
| `confused-ai init` project scaffolding | 4 days | Interactive setup: provider, tools, session store, deploy target |

#### Ecosystem Track

| Task | Effort | Description |
|------|--------|-------------|
| Tool-level result caching (`cache` option in `defineTool`) | 4 days | Memoize deterministic tools; reduces API cost |
| E2B sandbox integration | 8 days | `createE2BSandboxTool()` for isolated code execution |
| `EntityExtractionMemory` | 5 days | Auto-extract named entities from conversations into memory |
| Deno runtime support | 5 days | Verify and document Deno compatibility |
| Helm chart (`charts/confused-ai/`) | 6 days | Enterprise Kubernetes deployment |

#### Documentation Track

| Task | Effort | Description |
|------|--------|-------------|
| Production cookbook (10 real-world patterns) | 5 days | Step-by-step guides for: multi-tenant SaaS, cost-controlled API, etc. |
| Video walkthrough: zero to production in 30 min | External | Screencasts for top 5 use cases |
| Architecture visualization: interactive diagram | 3 days | Mermaid-based clickable architecture on docs site |
| Migration guide: LangChain → confused-ai | 3 days | Concept mapping + code translation guide |

**v1.3 Definition of Done:**
- `confused-ai chat` working with any agent file
- Time-to-first-agent benchmarked at <3 minutes for new users
- Helm chart deployed to a real Kubernetes cluster in CI
- E2B sandbox integration documented and tested

---

### v2.0 — Autonomous Agents & Platform Foundation *(Target: 6 months post-v1.3)*

**Theme:** Enable autonomous, long-running agents with persistent reasoning, self-improvement loops, and platform-as-a-service deployment.

#### Autonomous Agent Primitives

| Feature | Description | Technical Approach |
|---------|-------------|-------------------|
| **Autonomous goal decomposition** | Agent decomposes high-level goals into sub-tasks without human planning | Integrate `PlannerModule` into `AgenticRunner`; expose `mode: 'autonomous'` |
| **Self-reflection loop** | Agent evaluates its own output quality and retries with improved strategy | Post-completion evaluation hook; scoring via `runLlmAsJudge`; retry if score < threshold |
| **Persistent agent state** (beyond session) | Agent maintains state across restarts via structured memory | `AgentStateStore` backed by `AgentDrivenMemory` + `DurableExecutor` |
| **Multi-modal memory** | Agents can remember and recall images, charts, and documents | Image embedding via CLIP models; `MultiModalVectorStore` |
| **Agent-to-agent delegation** | Agents can spawn sub-agents and await results | First-class `delegateTo(agent, task)` tool; child execution tracked in parent span |

#### Platform Foundation

| Feature | Description | Technical Approach |
|---------|-------------|-------------------|
| **VS Code extension** | Syntax highlighting, agent config validation, live preview | New `packages/vscode-extension` |
| **Agent registry** | Versioned, deployable agent definitions | `AgentRegistry` with semver, rollback, A/B variants |
| **Evaluation pipeline CI** | Automated regression testing of agent behavior on every commit | `confused-ai eval --baseline` CLI; integrates with GitHub Actions |
| **Cost attribution dashboard** | Real-time cost breakdown by agent, user, tenant, model | Extends `BudgetEnforcer` with time-series storage |
| **Structured output schemas** | Agents return typed objects, not just strings | `defineAgent().outputSchema(z.object({...}))` with LLM structured output |

#### Community & Ecosystem

| Feature | Description |
|---------|-------------|
| **Plugin marketplace** | `confused-ai/plugins` registry for community-built tools and providers |
| **Agent Hub** | Public repository of shareable agent definitions |
| **LangChain adapter** | Import LangChain tools and chains directly into confused-ai |
| **Agno adapter** | Bidirectional: use Agno agents as confused-ai tools and vice versa |

---

## Non-Negotiable Quality Gates

Every release must satisfy all of the following before shipping:

### Reliability Gate
- [ ] Full test suite passes on Node.js 18, 20, 22
- [ ] No memory leaks in 1-hour load test (agent running 1000 consecutive requests)
- [ ] Circuit breaker correctly opens and recovers under simulated LLM failure
- [ ] Graceful shutdown completes within 30 seconds under concurrent requests

### Security Gate
- [ ] `ShellTool` with empty `allowedCommands` cannot execute any system command
- [ ] `HttpClientTool` cannot reach cloud metadata endpoints (`169.254.169.254`, etc.)
- [ ] No API keys appear in log output in any log level
- [ ] OWASP Top 10 scan clean (automated via CodeQL + manual review for new endpoints)

### Performance Gate
- [ ] `agent.run()` overhead (excluding LLM latency) < 5ms for single-turn, no-tool request
- [ ] Tool registry lookup O(1): verified by benchmark (`benchmarks/executor.bench.ts`)
- [ ] `DurableExecutor` can checkpoint and resume 1,000-node graph in < 100ms

### Documentation Gate
- [ ] Every new public API has JSDoc with at least one usage example
- [ ] Every new package added to `PACKAGES.md` and `CAPABILITIES.md`
- [ ] CHANGELOG.md updated with all changes
- [ ] Breaking changes documented with migration guide

---

## Documentation Architecture

The restructured documentation follows a strict separation of concerns:

```
docs/
├── index.md                        # Landing page — what is confused-ai?
│
├── guide/                          # USER-FACING: Getting started → advanced
│   ├── getting-started.md          # Installation, first agent, first tool
│   ├── concepts.md                 # Mental model: agents, tools, sessions
│   ├── agents.md                   # Creating and configuring agents
│   ├── tools.md                    # Built-in tools + custom tools
│   ├── workflows.md                # compose(), pipe(), multi-agent
│   ├── orchestration.md            # Supervisor, swarm, consensus, handoff
│   ├── session.md                  # Conversation state and persistence
│   ├── memory.md                   # Long-term semantic memory
│   ├── rag.md                      # RAG: ingest, retrieve, hybrid
│   ├── guardrails.md               # Content safety, PII, injection
│   ├── production.md               # Circuit breakers, rate limiting, retries
│   ├── observability.md            # OTLP, logging, metrics, eval
│   ├── graph.md                    # DAG execution, durable workflows
│   ├── hitl.md                     # Human-in-the-loop
│   ├── multi-tenancy.md            # Tenant isolation, per-tenant budgets
│   └── [30+ additional guides]
│
├── api/                            # REFERENCE: Precise interface contracts
│   └── index.md                    # Auto-generated from JSDoc
│
├── ARCHITECTURE-SPECIFICATION.md  # INTERNAL: Deep architectural spec (this file's sibling)
├── COMPETITIVE-ANALYSIS.md        # STRATEGIC: Gap analysis vs. Agno/LangChain/CrewAI
├── PRODUCTION-READINESS-AUDIT.md  # AUDIT: Enterprise readiness scorecard
├── GLOSSARY.md                    # REFERENCE: Unified technical glossary
└── STRATEGIC-TRANSFORMATION-ROADMAP.md  # STRATEGY: This document
```

### Documentation Domains and Audience Mapping

| Domain | Audience | Depth | Update Frequency |
|--------|----------|-------|-----------------|
| `guide/` | Application developers | Tutorial, conceptual | Each minor version |
| `api/` | Library integrators | Exhaustive reference | Each patch version |
| `ARCHITECTURE-SPECIFICATION.md` | Core contributors, enterprise architects | Deep technical | Each minor version |
| `COMPETITIVE-ANALYSIS.md` | Engineering leadership, product | Strategic | Quarterly |
| `PRODUCTION-READINESS-AUDIT.md` | SRE, security, compliance | Audit checklist | Each minor version |
| `GLOSSARY.md` | All audiences | Definitional | As terms are added |
| `STRATEGIC-TRANSFORMATION-ROADMAP.md` | Engineering leadership | Strategic + tactical | Each release cycle |

---

## Key Performance Indicators

Track these metrics quarterly to measure strategic progress:

### Adoption Metrics
| KPI | Baseline (v1.1.7) | Target (v1.2) | Target (v1.3) | Target (v2.0) |
|-----|:-----------------:|:-------------:|:-------------:|:-------------:|
| npm weekly downloads | — | +50% | +200% | +500% |
| GitHub stars | — | +500 | +2,000 | +5,000 |
| Time-to-first-agent (new user) | ~15 min | ~10 min | ~3 min | ~2 min |

### Quality Metrics
| KPI | Baseline | Target (v1.2) | Target (v2.0) |
|-----|:--------:|:-------------:|:-------------:|
| Production-readiness score | B+ (230/270) | A- (245/270) | A (260/270) |
| Competitive score | 4.25/5.0 | 4.5/5.0 | 4.75/5.0 |
| Security findings (open) | 3 critical/high | 0 critical | 0 critical/high |
| Test coverage | — | >90% packages/core | >95% all packages |

### Developer Experience Metrics
| KPI | Current | Target |
|-----|:-------:|:------:|
| Mean time to open issue (GitHub) | — | <48 hours |
| Documentation completeness score | 70% | 95% |
| API surface JSDoc coverage | ~60% | 100% |

---

## Appendix: Effort Estimation Summary

### v1.2 Engineering Budget

| Track | Tasks | Total Effort |
|-------|-------|-------------|
| Security | 5 | ~16 engineer-days |
| Memory | 4 | ~20 engineer-days |
| Observability | 4 | ~14 engineer-days |
| Infrastructure | 4 | ~11 engineer-days |
| **Total v1.2** | **17** | **~61 engineer-days** |

### v1.3 Engineering Budget

| Track | Tasks | Total Effort |
|-------|-------|-------------|
| DX | 6 | ~24 engineer-days |
| Ecosystem | 5 | ~28 engineer-days |
| Documentation | 4 | ~17 engineer-days |
| **Total v1.3** | **15** | **~69 engineer-days** |

### v2.0 Engineering Budget (estimate)

| Track | Tasks | Total Effort |
|-------|-------|-------------|
| Autonomous agents | 5 | ~60 engineer-days |
| Platform foundation | 5 | ~50 engineer-days |
| Community/ecosystem | 4 | ~40 engineer-days |
| **Total v2.0** | **14** | **~150 engineer-days** |

### Cumulative Roadmap Budget

| Release | Engineer-Days | Calendar Time | Milestone Date (estimate) |
|---------|:-------------:|:-------------:|:------------------------:|
| v1.2 | ~61 | 6 weeks | mid-June 2026 |
| v1.3 | ~69 | 10 weeks post-v1.2 | late August 2026 |
| v2.0 | ~150 | 6 months post-v1.3 | Q1 2027 |
| **Total horizon** | **~280** | **~10 months** | |

---

## Risk Register

Risks are ranked by `Severity × Likelihood`. Each risk has a designated owner package or team role.

| # | Risk | Severity | Likelihood | Score | Mitigation | Owner |
|---|------|:--------:|:----------:|:-----:|-----------|-------|
| R-01 | `ShellTool` security vulnerability exploited before v1.2 ships | Critical | Medium | 🔴 High | Patch default-deny in a hotfix (v1.1.8) immediately; do not wait for v1.2 train | `packages/tools` |
| R-02 | SSRF via `HttpClientTool` in a deployed integration | Critical | Low | 🟠 Medium | Same as R-01 — hotfix eligible; add `SECURITY.md` advisory | `packages/tools` |
| R-03 | Agno ships agent-driven memory parity before confused-ai v1.2 | High | Medium | 🟠 Medium | Accelerate `AgentDrivenMemory` sprint; publicize roadmap commitment on GitHub | `packages/memory` |
| R-04 | LangChain releases TypeScript-first rewrite targeting same audience | High | Low | 🟡 Low-Medium | Maintain production-safety moat; track langchainjs releases quarterly | Strategy |
| R-05 | Node.js 18 EOL (April 2025) creates CI matrix complexity | Medium | High | 🟠 Medium | Drop Node 18 support in v1.3; update CI matrix; document in CHANGELOG | DevOps |
| R-06 | `DurableExecutor` event-store growth unbounded in long-running graphs | High | Medium | 🟠 Medium | Implement compaction / snapshot strategy; add `maxEventAge` config in v1.2 | `packages/execution` |
| R-07 | pnpm workspace hoisting causes transitive type conflicts at build | Medium | Low | 🟡 Low | Maintain `isolatedModules: true`; pin critical shared deps in `tsconfig.base.json` | Build |
| R-08 | Anthropic / OpenAI API schema breaking change invalidates provider adapters | Medium | Medium | 🟠 Medium | Provider adapter tests run against recorded fixtures; monitor provider changelogs | `packages/models` |
| R-09 | Community fork emerges due to slow v1.2 delivery | Low | Low | 🟢 Low | Monthly public progress updates; respond to issues within 48 hours | Community |
| R-10 | Contributor bandwidth insufficient to ship v1.3 on schedule | High | Medium | 🟠 Medium | Identify two external contributors for DX track by end of v1.2; document contribution paths | Engineering lead |

### Risk Thresholds

- 🔴 **High** — Requires immediate escalation and sprint re-prioritization
- 🟠 **Medium** — Requires mitigation plan within current release cycle
- 🟡 **Low-Medium** — Monitor quarterly; mitigation optional
- 🟢 **Low** — Log and accept

---

## Dependencies & External Blockers

These are hard external dependencies that must be resolved or de-risked before the dependent task can begin.

| Dependency | Blocks | Resolution Path | ETA |
|-----------|--------|----------------|-----|
| OpenAI structured output stable API | `defineAgent().outputSchema()` (v2.0) | API is GA; adapter implementation unblocked | — |
| Pinecone / Qdrant SDK v2 stability | `AgentDrivenMemory` vector backend | Both SDKs stable; integration test suite covers v2 | — |
| E2B sandbox API key provisioning | E2B sandbox tool (v1.3) | Requires E2B account + env var; document in setup guide | Before v1.3 kickoff |
| PostgreSQL test fixture in CI | `PostgresAuditStore`, `PostgresCheckpointStore` (v1.2) | Add `postgres:16` service container to GitHub Actions matrix | v1.2 sprint 1 |
| Helm chart registry hosting | Helm chart (v1.3) | Decision needed: GitHub Container Registry vs. ArtifactHub | v1.3 planning |
| VS Code extension marketplace registration | VS Code extension (v2.0) | Microsoft publisher account required; 1–2 week approval | 6 weeks before v2.0 |
| CLIP model hosting for multi-modal memory (v2.0) | `MultiModalVectorStore` | Self-hosted vs. managed inference TBD | v2.0 planning |

---

## Governance & Review Cadence

### Document Ownership

| Section | Owner | Update Trigger |
|---------|-------|---------------|
| Roadmap tasks + acceptance criteria | Engineering lead | Before each release cycle kick-off |
| Risk Register | Engineering lead | Monthly; or after any 🔴 risk event |
| KPI baselines + targets | Engineering lead | Each quarterly review |
| Quality gates | Any contributor (PR required) | When gate definitions change |
| Effort estimates | Task owner | After sprint planning refinement |

### Review Schedule

| Review | Cadence | Participants | Output |
|--------|---------|-------------|--------|
| Sprint sync | Every 2 weeks | Engineering team | Task status update; risk re-scoring |
| Release readiness review | 1 week before each release | Engineering lead + at least one external contributor | Go/no-go decision against quality gates |
| Quarterly strategy review | Quarterly | Engineering leadership | KPI measurement; roadmap re-prioritization |
| Security gate audit | Each release | Engineering lead (security focus) | Sign-off on Security Gate checklist |
| Competitive analysis refresh | Quarterly | Engineering lead | Updated competitive scores; new gap items added to backlog |

### Change Process

Any change to a **v1.2 P0 task**, a **Non-Negotiable Quality Gate**, or a **v1.2/v1.3 Definition of Done** requires:
1. A PR updating this document with a clear rationale
2. Approval from the engineering lead
3. A corresponding entry in `CHANGELOG.md`

Additions to the v1.3 and v2.0 backlogs may be made via PR without blocking approval, but must include effort estimates and acceptance criteria.

---

## Immediate Actions (Now → Next 2 Weeks)

The following actions should begin **this sprint**, ahead of the formal v1.2 release train, due to their risk level or blocking nature.

| Priority | Action | Rationale | Owner |
|----------|--------|-----------|-------|
| **P0** | Open hotfix branch `v1.1.8-security`; patch `ShellTool` default-deny and `HttpClientTool` SSRF block | R-01, R-02 — critical vulnerabilities in current release | `packages/tools` |
| **P0** | Add `postgres:16` service container to GitHub Actions CI matrix | Unblocks `PostgresAuditStore` and `PostgresCheckpointStore` work in v1.2 sprint 1 | DevOps |
| **P0** | Draft `AgentDrivenMemory` interface contract in `packages/contracts` | Allows parallel work on memory persistence and system-tool wiring without coupling | `packages/memory` |
| **P1** | Tag v1.1.7 in GitHub; publish release notes summarizing current capability baseline | Provides clean anchor for CHANGELOG and competitive benchmarks | Engineering lead |
| **P1** | Create GitHub milestone `v1.2` and assign all P0/P1 tasks from this roadmap | Enables public progress tracking; activates community contribution surface | Engineering lead |
| **P1** | Add `halfOpenSuccessThreshold` config option to `CircuitBreakerConfig` (1-day effort) | Quick win from audit findings; directly improves production reliability score | `packages/guard` |
| **P2** | Audit and document all existing `ConsoleLogger` output for API key patterns | Prerequisite for secret-masking implementation; unblocks security track sprint | `packages/observe` |

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | April 2026 | Engineering lead | Initial draft: roadmap structure, v1.2 P0 tasks |
| 1.1.0 | April 2026 | Engineering lead | Added v1.3 DX track; expanded v2.0 platform section |
| 1.1.7 | May 2026 | Engineering lead | Aligned to v1.1.7 baseline; added KPIs, quality gates, documentation architecture |
| **1.1.8** | **May 2026** | **Engineering lead** | **Added Risk Register, Dependencies, Governance, Immediate Actions, Revision History; completed Appendix with cumulative budget table** |
