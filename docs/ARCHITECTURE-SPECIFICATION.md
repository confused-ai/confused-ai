# confused-ai — Architecture Specification

> **Version:** 1.1.7  
> **Classification:** Internal Engineering Reference  
> **Purpose:** Authoritative architectural specification for contributors, integration engineers, and enterprise adopters. Complements the user-facing README and guide. Not a tutorial.

---

## 1. Architectural Philosophy

confused-ai is built on three non-negotiable design mandates:

1. **Progressive disclosure** — The framework scales from a 3-line prototype to a horizontally-distributed, multi-tenant, budget-capped production system without any re-architecture. Every additional capability is opt-in; nothing is forced.

2. **Interface-driven composition** — Every subsystem is defined by a minimal TypeScript interface, not a base class. The framework ships reference implementations; operators substitute their own at the boundary.

3. **Production as a first-class concern** — Budget enforcement, circuit breakers, audit logging, idempotency, and multi-tenancy are not bolt-ons. They are wired directly into the execution path.

---

## 2. Layer Architecture

```
╔══════════════════════════════════════════════════════════════════╗
║  Layer 0: Developer API (confused-ai, confused-ai/*)            ║
║                                                                  ║
║  agent()  defineAgent()  compose()  pipe()  createAgent()       ║
╚══════════════════════════════╦═══════════════════════════════════╝
                               ║
╔══════════════════════════════▼═══════════════════════════════════╗
║  Layer 1: Orchestration (confused-ai/workflow, /orchestration)  ║
║                                                                  ║
║  createPipeline()  createSupervisor()  createSwarm()            ║
║  AgentRouter  ConsensusProtocol  createHandoff()  A2AClient     ║
╚══════════════════════════════╦═══════════════════════════════════╝
                               ║
╔══════════════════════════════▼═══════════════════════════════════╗
║  Layer 2: Agentic Core (confused-ai/agentic, /core)             ║
║                                                                  ║
║  AgenticRunner (ReAct: Think → Act → Observe → Repeat)          ║
║    ├── LLMProvider interface                                     ║
║    ├── ToolRegistry (Map<string, Tool>, O(1) lookup)            ║
║    ├── GuardrailEngine (pre/post-call validators)               ║
║    ├── HITLApprovalStore (human-in-the-loop gates)              ║
║    ├── SessionStore (conversation state persistence)            ║
║    └── MemoryStore (long-term semantic recall)                  ║
╚══════════════════════════════╦═══════════════════════════════════╝
                               ║
╔══════════════════════════════▼═══════════════════════════════════╗
║  Layer 3: Graph Engine (confused-ai/graph)                      ║
║                                                                  ║
║  DAGEngine  DurableExecutor  DistributedEngine                  ║
║  BackpressureController  EventStore  TelemetryPlugin            ║
╚══════════════════════════════╦═══════════════════════════════════╝
                               ║
╔══════════════════════════════▼═══════════════════════════════════╗
║  Layer 4: Production Safety (confused-ai/guard, /production)    ║
║                                                                  ║
║  BudgetEnforcer  RateLimiter  CircuitBreaker                    ║
║  IdempotencyGuard  AuditLogger  GracefulShutdown                ║
║  TenantContext  HealthCheckManager  CheckpointStore             ║
╚══════════════════════════════╦═══════════════════════════════════╝
                               ║
╔══════════════════════════════▼═══════════════════════════════════╗
║  Layer 5: Infrastructure Adapters                               ║
║                                                                  ║
║  SQL (SQLite/Postgres/MySQL) · NoSQL (MongoDB/DynamoDB)         ║
║  Vector (Pinecone/Qdrant/pgvector) · Cache (Redis)             ║
║  Queue (BullMQ/Kafka/SQS/RabbitMQ) · Object Storage           ║
║  Observability (OTLP/Jaeger/Honeycomb/Datadog)                 ║
╚══════════════════════════════════════════════════════════════════╝
```

Each layer depends only on the layer below it. Layer 4 (Production Safety) wraps Layer 2 (Agentic Core) — production primitives are composable, not embedded inside the runner.

---

## 3. Core Execution Model — ReAct Loop

The `AgenticRunner` implements the ReAct (Reasoning + Acting) loop described in Yao et al. (2022):

```
┌─────────────────────────────────────────────────────────┐
│                    AgenticRunner.run()                   │
│                                                         │
│  1. SESSION HYDRATION                                   │
│     Load conversation history from SessionStore         │
│     Inject long-term memory context from MemoryStore    │
│     Apply context window compression (CompressionMgr)  │
│                                                         │
│  2. GUARDRAIL PRE-CHECK                                 │
│     Run input validators (PII, injection, blocklist)    │
│     Abort with GuardrailViolationError if blocked       │
│                                                         │
│  3. BUDGET CHECK                                        │
│     BudgetEnforcer.check() — throws if over cap        │
│                                                         │
│  4. LLM INVOCATION                                      │
│     Build message array + tool definitions              │
│     Call LLMProvider.complete() with AbortSignal        │
│     Parse response: text | tool_call[] | error          │
│                                                         │
│  5. TOOL DISPATCH (if tool_calls present)              │
│     For each tool_call:                                 │
│       a. Validate parameters via Zod schema             │
│       b. Check HITL approval if required               │
│       c. Execute tool with 30s timeout                  │
│       d. Record result in conversation                  │
│     Parallel execution via Promise.allSettled()         │
│                                                         │
│  6. LOOP DECISION                                       │
│     If response is final text → exit loop              │
│     If more tool_calls → return to step 4              │
│     If maxIterations reached → return partial result   │
│                                                         │
│  7. GUARDRAIL POST-CHECK                                │
│     Run output validators on final text                 │
│                                                         │
│  8. SESSION PERSISTENCE                                 │
│     Append messages to SessionStore                     │
│     Record cost/tokens in BudgetEnforcer               │
│     Write AuditLog entry                               │
│     Emit OTLP span                                     │
└─────────────────────────────────────────────────────────┘
```

### Iteration Limits and Safety

| Parameter | Default | Override |
|-----------|---------|---------|
| `maxIterations` | 10 | `createAgent({ maxIterations: N })` |
| Tool execution timeout | 30,000ms | `defineTool({ timeout: N })` |
| LLM call timeout | 60,000ms | `circuitBreaker.callTimeoutMs` |
| Context window truncation | Model-dependent | `CompressionManager` |

---

## 4. Interface Contracts

All pluggable interfaces are exported from `confused-ai/contracts`. No concrete implementations are imported from contracts — it is purely a type boundary.

### LLMProvider

```typescript
interface LLMProvider {
  readonly model: string;
  complete(messages: Message[], options: CompletionOptions): Promise<CompletionResult>;
  stream?(messages: Message[], options: CompletionOptions): AsyncIterable<StreamChunk>;
}

interface CompletionOptions {
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  responseFormat?: 'text' | 'json_object';
}

interface CompletionResult {
  text: string;
  toolCalls?: ToolCall[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}
```

### SessionStore

```typescript
interface SessionStore {
  get(sessionId: string): Promise<Session | null>;
  set(sessionId: string, session: Session): Promise<void>;
  delete(sessionId: string): Promise<void>;
  list(userId?: string): Promise<SessionSummary[]>;
  close?(): Promise<void>;
}
```

### VectorStore

```typescript
interface VectorStore {
  upsert(vectors: VectorRecord[]): Promise<void>;
  query(embedding: number[], topK: number, filter?: Record<string, unknown>): Promise<VectorRecord[]>;
  delete?(ids: string[]): Promise<void>;
}
```

### Tool

```typescript
interface Tool<TParams = unknown, TResult = unknown> {
  readonly name: string;
  readonly description: string;
  readonly parameters: z.ZodSchema<TParams>;
  execute(params: TParams, context: ToolContext): Promise<TResult>;
  timeout?: number;
  requiresApproval?: boolean;
}

interface ToolContext {
  agentName: string;
  runId: string;
  sessionId?: string;
  tenantId?: string;
  signal: AbortSignal;
}
```

### GuardrailRule

```typescript
interface GuardrailRule {
  readonly name: string;
  readonly phase: 'input' | 'output' | 'both';
  validate(content: string, context: GuardrailContext): Promise<GuardrailResult>;
}

interface GuardrailResult {
  allowed: boolean;
  reason?: string;
  modified?: string;  // optional content rewrite
}
```

---

## 5. Package Dependency Graph

```
confused-ai (root export barrel)
    ├── @confused-ai/dx           (agent(), defineAgent(), compose())
    │       └── @confused-ai/core
    ├── @confused-ai/core         (createAgent(), AgenticRunner)
    │       ├── @confused-ai/contracts
    │       ├── @confused-ai/shared
    │       └── @confused-ai/agentic
    ├── @confused-ai/models       (openai(), anthropic(), google(), ollama())
    │       └── @confused-ai/contracts
    ├── @confused-ai/tools        (100+ built-in tools)
    │       └── @confused-ai/contracts
    ├── @confused-ai/workflow     (compose, supervisor, swarm)
    │       ├── @confused-ai/core
    │       └── @confused-ai/orchestration
    ├── @confused-ai/graph        (DAGEngine, DurableExecutor)
    │       ├── @confused-ai/contracts
    │       └── @confused-ai/shared
    ├── @confused-ai/production   (BudgetEnforcer, CircuitBreaker, ...)
    │       └── @confused-ai/contracts
    ├── @confused-ai/knowledge    (KnowledgeEngine, RAG)
    │       ├── @confused-ai/memory
    │       └── @confused-ai/contracts
    ├── @confused-ai/session      (session stores)
    │       └── @confused-ai/contracts
    ├── @confused-ai/memory       (vector memory stores)
    │       └── @confused-ai/contracts
    ├── @confused-ai/guardrails   (safety rules)
    │       └── @confused-ai/contracts
    ├── @confused-ai/observe      (logging, tracing, metrics)
    │       └── @confused-ai/contracts
    └── @confused-ai/serve / @confused-ai/runtime
            ├── @confused-ai/core
            └── @confused-ai/production
```

**Circular dependency rule:** `contracts` depends on nothing. `shared` depends only on `contracts`. All other packages may depend on `contracts` and `shared` but not on each other without an explicit dependency declared in `package.json`.

---

## 6. Graph Engine Architecture

The `@confused-ai/graph` package implements a directed acyclic graph (DAG) execution engine with durable state and distributed worker support.

### Execution Modes

| Mode | Class | Use Case |
|------|-------|---------|
| In-process | `DAGEngine` | Development, single-server |
| Durable | `DurableExecutor` | Crash-resume, long-running workflows |
| Distributed | `DistributedEngine` | Horizontal scaling, high throughput |

### State Machine (DurableExecutor)

```
Node State Transitions:
  PENDING → RUNNING → COMPLETED
                   ↘ FAILED → RETRYING → RUNNING
                                       ↘ FAILED (max retries)

Execution State:
  CREATED → RUNNING → COMPLETED
                   ↘ FAILED
                   ↘ SUSPENDED (HITL waiting)
                   ↘ RESUMED (from checkpoint)
```

### Event Sourcing Schema

Every state transition is recorded as an immutable event in `EventStore`:

```typescript
interface GraphEvent {
  seq: number;           // monotonic sequence number
  executionId: string;
  nodeId: string;
  type: 'node_started' | 'node_completed' | 'node_failed' | 'tool_called' | 'llm_called';
  timestamp: Date;
  data: Record<string, unknown>;
  graphVersion: string;  // graph hash for mismatch detection
}
```

The CLI `confused-ai replay --run-id <id>` reconstructs execution history from these events. `confused-ai diff` compares two execution traces for regression detection.

---

## 7. HTTP Runtime API Contract

When `createHttpService()` is called, it mounts the following endpoints:

### Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/health` | Liveness check | None |
| `GET` | `/v1/health` | Readiness check (includes DB probe) | None |
| `POST` | `/v1/chat` | Single-turn agent run (JSON response) | Required |
| `POST` | `/v1/chat/stream` | Single-turn agent run (SSE stream) | Required |
| `GET` | `/v1/sessions` | List sessions for authenticated user | Required |
| `GET` | `/v1/sessions/:id` | Get session history | Required |
| `DELETE` | `/v1/sessions/:id` | Delete session | Required |
| `POST` | `/v1/approvals/:id` | Submit HITL approval decision | Required |
| `GET` | `/v1/openapi.json` | OpenAPI 3.1 specification | None |
| `GET` | `/metrics` | Prometheus metrics (if enabled) | None |
| `WS` | `/v1/ws` | WebSocket bidirectional stream (if enabled) | Required |

### Request/Response Schema

```typescript
// POST /v1/chat
interface ChatRequest {
  message: string;
  sessionId?: string;
  runId?: string;        // for idempotency
  userId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

interface ChatResponse {
  text: string;
  sessionId: string;
  runId: string;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
  toolCalls?: { name: string; args: unknown; result: unknown }[];
  finishReason: 'stop' | 'budget_exceeded' | 'guardrail_blocked' | 'error';
}
```

### SSE Stream Format

```
event: chunk
data: {"text":"The weather"}

event: chunk
data: {"text":" in London"}

event: tool_call
data: {"name":"getWeather","args":{"city":"London"}}

event: tool_result
data: {"name":"getWeather","result":{"temp":15,"condition":"cloudy"}}

event: done
data: {"sessionId":"sess_abc","runId":"run_xyz","usage":{"inputTokens":45,"outputTokens":123}}
```

---

## 8. Multi-Tenancy Architecture

The multi-tenancy model provides resource isolation per tenant without running separate processes:

```typescript
// Tenant context propagates through the entire execution stack
const tenantCtx = createTenantContext({
  tenantId: 'acme-corp',
  budget: { monthlyUsdLimit: 500 },
  rateLimit: { maxRpm: 60 },
  allowedTools: ['getWeather', 'searchWeb'],  // tool allowlist (recommended)
});

const agent = createAgent({
  ...agentConfig,
  tenantContext: tenantCtx,
});
```

### Isolation Guarantees

| Resource | Isolation Level | Mechanism |
|----------|----------------|-----------|
| Session data | Full | `TenantScopedSessionStore` prefixes keys with `tenantId` |
| Memory data | Full | Same key prefixing strategy |
| Budget | Full | `BudgetEnforcer` is per-tenant instance |
| Rate limit | Full | `RateLimiter` is per-tenant instance |
| Tool access | Full (if configured) | `allowedTools` enforcement at dispatch |
| Audit log | Full | `tenantId` indexed in all audit records |
| LLM model | Configurable | Per-tenant model override supported |

### Tenant Data Flow

```
HTTP Request
    │
    ▼
┌───────────────────────────────────┐
│  Auth middleware (identifies      │
│  tenant from JWT / API key)       │
└───────────────┬───────────────────┘
                │ tenantId extracted
                ▼
┌───────────────────────────────────┐
│  createTenantContext(tenantId)    │
│  ├── tenant-scoped SessionStore   │
│  ├── tenant-scoped BudgetEnforcer │
│  └── tenant-scoped RateLimiter    │
└───────────────┬───────────────────┘
                │ context passed to agent
                ▼
┌───────────────────────────────────┐
│  AgenticRunner                    │
│  (all operations scoped to tenant)│
└───────────────────────────────────┘
```

---

## 9. Data Flow Diagram — Full Execution Path

```
User Input (string | MessageArray)
    │
    ▼
[Rate Limiter Check] ──────── reject if over RPM ──→ RateLimitError
    │
    ▼
[Idempotency Check] ───────── duplicate request ──→ cached response
    │
    ▼
[Budget Pre-Check] ────────── over limit ──────────→ BudgetExceededError
    │
    ▼
[Session Hydration] ←──────── SessionStore.get()
    │
    ▼
[Memory Injection] ←───────── MemoryStore.query()
    │
    ▼
[Context Compression] ←────── CompressionManager (if over threshold)
    │
    ▼
[Guardrail Pre-Check] ──────── violation ─────────→ GuardrailViolationError
    │
    ▼
[LLM Provider Call] ←───────── builds tool definitions, messages
    │
    ├── text response ─────────────────────────────→ [Guardrail Post-Check]
    │                                                         │
    └── tool_calls ──→ [Tool Dispatch]                       ▼
             │              ├── HITL gate (if required)  [Session Write]
             │              ├── Zod validation                │
             │              ├── Tool execute()                ▼
             │              └── results appended          [Audit Log]
             │                                               │
             └── loop back to LLM ───────────────────────── ▼
                                                        [OTLP Span]
                                                             │
                                                             ▼
                                                    Final Result returned
```

---

## 10. Architecture Decision Records (ADRs)

### ADR-001: Peer Dependencies over Bundled Dependencies

**Decision:** All LLM SDK dependencies (`openai`, `@anthropic-ai/sdk`, `better-sqlite3`, etc.) are `peerDependencies`, dynamically imported only when the specific adapter is used.

**Rationale:** Bundling all providers increases initial install size by 200–500MB. Projects using only OpenAI should not pay the cost of Anthropic/Google SDKs. Dynamic import enables true pay-for-what-you-use semantics.

**Consequence:** Consumers must install provider SDKs explicitly. Error messages guide installation when a provider is missing.

### ADR-002: Zod as the Single Schema Source of Truth

**Decision:** Tool parameters are defined as Zod schemas. JSON Schema for LLM function-calling is auto-derived from Zod via `zodToJsonSchema`.

**Rationale:** Zod provides runtime validation (security boundary), TypeScript types (DX), and JSON Schema (LLM interface) from a single definition. Maintaining separate schema files for each would be error-prone.

**Consequence:** Zod is a required dependency (not peer). Tool authors must use Zod, not raw JSON Schema or other validators.

### ADR-003: Event Sourcing for Graph Execution

**Decision:** All state transitions in `DurableExecutor` are stored as append-only events rather than updating mutable state.

**Rationale:** Enables crash-resume (replay events to reconstruct state), diff analysis (compare two execution traces), and complete audit trail without separate logging.

**Consequence:** Execution storage grows proportionally with run duration and tool call count. Compaction strategy required for very long-running workflows.

### ADR-004: Interface-First, Implementation-Agnostic Core

**Decision:** `@confused-ai/core` imports only from `@confused-ai/contracts`. No concrete session stores, LLM providers, or vector databases are imported into core.

**Rationale:** Prevents dependency hell. Consumers can test core behavior with pure in-memory mocks. No testing requires network access or database setup.

**Consequence:** Slightly more wiring required at the composition root (where real adapters are injected).

### ADR-005: Multi-Tenancy as Context, Not Process Isolation

**Decision:** Tenant isolation is implemented via context propagation and key namespacing within shared infrastructure, not via separate process/container per tenant.

**Rationale:** Per-tenant processes are operationally expensive and unnecessary for most SaaS use cases. Context propagation achieves isolation at <1ms overhead.

**Consequence:** Tenants share the same Node.js process, CPU, and memory. For extreme isolation requirements (compliance mandates), separate deployments are still possible by instantiating one service per tenant.
