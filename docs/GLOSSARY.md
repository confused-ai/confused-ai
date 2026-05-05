# Technical Glossary — confused-ai

> **Purpose:** Canonical definitions for all technical terms used in confused-ai documentation, code, and communications. When a term appears in documentation or discussion, it carries exactly the meaning defined here — no more, no less.
>
> **Maintenance:** Add terms when introducing new concepts. Update definitions when semantics change. Never silently reuse a term with a different meaning.

---

## A

**AbortSignal**  
The standard Web API signal object passed to all async operations in confused-ai. All agent runs, LLM calls, tool executions, and stream operations accept an `AbortSignal`. When aborted, operations cancel cleanly without resource leaks. Propagated automatically through the execution tree.

**Agent**  
The primary unit of LLM-powered computation in confused-ai. An agent combines: a system instruction (persona), an LLM provider, a tool registry, optional session/memory stores, and production safety guards. Created via `createAgent()` or the fluent `defineAgent()` builder.

**AgenticRunner**  
The internal class implementing the ReAct loop inside `@confused-ai/agentic`. Not typically used directly by application developers — `createAgent()` and `defineAgent()` compose it with sensible defaults. Direct use is for advanced cases where full control over the execution context is required.

**Artifact**  
A structured, versioned output produced by an agent or workflow. Unlike raw text responses, artifacts have typed schemas (e.g., `TextArtifact`, `MarkdownArtifact`, `ImageArtifact`) and are stored via `ArtifactStorage`. Available from `confused-ai/artifacts`.

**Audit Log**  
An append-only record of every agent request, tool call, and response. Implemented by `AuditStore` interface with `InMemoryAuditStore` (dev) and `SqliteAuditStore` (production) implementations. All entries include timestamp, tenantId, userId, runId, and outcome. **Not a SOC2/HIPAA compliance control by itself** — see `PRODUCTION-READINESS-AUDIT.md`.

---

## B

**Background Queue**  
An asynchronous job queue for executing agent tasks outside of HTTP request/response cycles. Implemented by `BackgroundQueue` interface with adapters for BullMQ (Redis), Kafka, SQS, RabbitMQ, and Redis Pub/Sub. Used for long-running, deferrable, or high-volume agent workloads. See `confused-ai/background`.

**Backpressure Controller**  
`BackpressureController(maxConcurrency)` — a semaphore-based concurrency limiter used inside the `DAGEngine` to prevent overwhelming downstream LLM providers or databases when running parallel graph nodes. Exposes `.inflight` and `.queueDepth` for monitoring.

**Budget Enforcement**  
The mechanism by which per-run, per-user, or monthly USD spending limits are applied to agents. `BudgetEnforcer` tracks token usage, converts to USD cost using provider pricing tables, and throws `BudgetExceededError` when limits are crossed. Enforced before and after LLM calls. See `confused-ai/production`.

---

## C

**Checkpoint**  
A point-in-time snapshot of an agent's execution state, enabling crash-resume behavior. `CheckpointStore` stores checkpoints by `runId`. When an agent run fails mid-execution, passing the same `runId` to a subsequent `createAgent()` call resumes from the last checkpoint. See `InMemoryCheckpointStore`, `SqliteCheckpointStore`.

**Circuit Breaker**  
A resilience pattern that prevents cascading failures when an upstream service (e.g., OpenAI API) is unavailable. `CircuitBreaker` has three states: `CLOSED` (normal), `OPEN` (blocking requests after threshold failures), and `HALF-OPEN` (probing for recovery). See `confused-ai/guard`.

**Composition**  
The act of chaining multiple agents into a sequential pipeline where the output of one agent becomes the input of the next. Implemented via `compose(...agents)` or `createPipeline()`. Distinct from *orchestration*, which implies dynamic routing decisions.

**Context Window**  
The maximum token count that an LLM can process in a single request (system prompt + conversation history + tool definitions + response). confused-ai tracks context utilization and applies `CompressionManager` when the conversation approaches the model's limit.

**Context Window Compression**  
The process of reducing the token count of a conversation history when it approaches the model's context limit. `CompressionManager` implements sliding-window truncation by default; `SummaryBufferMemory` (v1.2+) implements LLM-based summarization of older messages.

---

## D

**DAG (Directed Acyclic Graph)**  
The graph structure used by `DAGEngine` and `DurableExecutor` to define execution dependencies between nodes. Each node can have multiple predecessors and successors, but no cycles are permitted. Wave-based scheduling ensures nodes execute as early as their dependencies allow.

**Definite Tool** (see **Tool**)

**Distributed Engine**  
`DistributedEngine` — the graph execution mode where nodes are dispatched to a pool of workers via a `TaskQueue` (Redis or in-memory). Enables horizontal scaling of graph workflows across multiple processes or machines. See `confused-ai/graph`.

**Durable Execution**  
A graph execution mode implemented by `DurableExecutor` where every state transition is persisted to an `EventStore` before being applied. If the process crashes, the execution is resumed by replaying stored events to reconstruct state. Enables long-running workflows (hours/days) that survive process restarts.

---

## E

**Embedding**  
A dense vector representation of text produced by an embedding model (e.g., `text-embedding-3-small`). Used for semantic similarity search in RAG and long-term memory. `OpenAIEmbeddingProvider` and compatible alternatives implement the `EmbeddingProvider` interface.

**Event Sourcing**  
The architectural pattern used by `DurableExecutor` where the authoritative record of system state is a sequence of immutable events, not the current mutable state. State is reconstructed by replaying events in sequence. Enables: crash-resume, time-travel debugging, execution diff, and audit trail.

**Eval / Evaluation**  
The process of measuring the quality of agent outputs against ground-truth or rubric-based criteria. confused-ai provides `ExactMatchAccuracy`, `LevenshteinAccuracy`, `wordOverlapF1`, `rougeLWords`, and `runLlmAsJudge()`. Eval runs produce scores aggregated by `EvalAggregator`. See `confused-ai/observe`.

---

## F

**Finish Reason**  
The reason an LLM call terminated. One of: `stop` (natural completion), `tool_calls` (model requested tool execution), `length` (context window exhausted), `content_filter` (moderation blocked response). Surfaced on `CompletionResult.finishReason`.

**Function Calling** (see **Tool Call**)

---

## G

**Graph**  
A `StateGraph` or `DAGEngine` instance defining the execution topology of a multi-node workflow. Nodes are agents, tools, or arbitrary async functions. Edges define dependency order. Not the same as an *orchestration pipeline* — graphs are explicit topology; pipelines are sequential chains.

**Guardrail**  
A validation rule applied to agent inputs or outputs to enforce safety and compliance policies. Implemented by `GuardrailRule` interface. Built-in rules include: `createPromptInjectionRule()`, `createPiiDetectionRule()`, `createOpenAiModerationRule()`. Custom rules implement `validate(content, context)`. See `confused-ai/guardrails`.

**Graceful Shutdown**  
The ability of the HTTP service to stop accepting new requests and wait for in-flight requests to complete before terminating, triggered by SIGTERM. Implemented by `GracefulShutdown` and `withShutdownGuard()`. Required for zero-downtime deployments (K8s rolling updates, Fly.io, Render).

---

## H

**Handoff**  
A multi-agent pattern where one agent (typically a triage or routing agent) transfers control to a specialist agent mid-conversation, passing accumulated context. Implemented by `createHandoff()`. Distinct from a *supervisor*: handoffs are one-way transfers; supervisors maintain oversight.

**HITL (Human-in-the-Loop)**  
An execution gate where an agent pauses and waits for human approval before proceeding. `waitForApproval()` stores a pending approval request and suspends execution. The approval or rejection is submitted via `POST /v1/approvals/:id`. See `confused-ai/production`.

**Hook**  
A lifecycle callback registered on an agent that fires at specific points in execution: `onRunStart`, `onRunEnd`, `onRunError`, `onToolCall`, `onToolResult`, `onChunk`. Hooks are synchronous observers — they cannot modify execution. Use guardrails for blocking/modifying behavior.

---

## I

**Idempotency**  
The property that a request can be safely retried without side effects. `IdempotencyGuard` deduplicates requests with the same `X-Idempotency-Key` header, returning the cached response for duplicate requests within the TTL window. Critical for financial and transactional agents.

**Instructions**  
The system prompt provided to an agent at creation time. Sets the agent's persona, behavior constraints, output format, and domain focus. Injected as the first `system` message in every LLM call. Best practice: specific, declarative, and testable.

---

## K

**KnowledgeEngine**  
The RAG (Retrieval-Augmented Generation) subsystem. Manages document ingestion (chunking + embedding), storage in a `VectorStore`, and query-time retrieval. The retrieved context is automatically injected into the agent's system message when `knowledgebase` is configured. See `confused-ai/knowledge`.

---

## L

**LLM Provider**  
Any class implementing the `LLMProvider` interface: `complete(messages, options)` and optional `stream(messages, options)`. confused-ai ships adapters for OpenAI, Anthropic, Google Gemini, OpenRouter, and Ollama. Custom providers implement the interface directly.

**LLM Router**  
A meta-provider that selects from multiple `LLMProvider` instances based on routing policy: `createCostOptimizedRouter()` picks cheapest model meeting capability threshold; `AgentRouter` routes to different agents based on content. See `confused-ai/router`.

**LLM-as-Judge**  
An evaluation technique where an LLM scores or ranks another LLM's output against a rubric. `runLlmAsJudge()` submits a prompt + response to a judge LLM and returns a numeric score + reasoning. Used for open-ended evaluations where exact-match scoring is insufficient.

---

## M

**MCP (Model Context Protocol)**  
An open protocol for exposing tools to LLM agents via HTTP. confused-ai supports MCP in both directions: `loadMcpToolsFromUrl()` loads tools from any MCP server; `McpHttpServer` + `createMcpServer()` expose confused-ai tools as an MCP server consumable by Claude Desktop, other agents, etc.

**Memory**  
Long-term semantic storage that persists information across sessions. Distinguished from *session memory* (conversation history) — memory stores semantic facts retrievable by similarity search. `InMemoryStore`, `PineconeVectorStore`, `QdrantVectorStore`, `PgVectorStore` implement `MemoryStore`. See `confused-ai/memory`.

**Message**  
A single turn in a conversation. Has `role` (`system` | `user` | `assistant` | `tool`) and `content` (string or multi-modal parts). The full conversation history is an ordered `Message[]` array managed by `SessionStore`.

**Multi-Tenancy**  
The ability to serve multiple independent customers (tenants) from a single deployment, with full resource isolation. In confused-ai, tenant isolation is achieved via `createTenantContext()`, `TenantScopedSessionStore`, per-tenant `BudgetEnforcer`, and per-tenant `RateLimiter`. Not process isolation — same Node.js process, isolated data and limits.

---

## O

**Orchestration**  
The coordination of multiple agents to accomplish a complex task. confused-ai provides: `createPipeline()` (sequential), `createSupervisor()` (manager + team), `createSwarm()` (parallel), `AgentRouter` (dynamic routing), `ConsensusProtocol` (majority vote), and `createHandoff()` (delegation). See `confused-ai/orchestration` and `confused-ai/workflow`.

**OTLP (OpenTelemetry Protocol)**  
The vendor-neutral telemetry protocol used by confused-ai for distributed tracing and metrics. `OTLPTraceExporter` and `OTLPMetricsExporter` export spans and metrics to any OTLP-compatible backend: Jaeger, Zipkin, Honeycomb, Datadog, Grafana Tempo, AWS X-Ray (via ADOT).

---

## P

**Peer Dependency**  
A package listed in `peerDependencies` rather than `dependencies`. confused-ai lists all heavy SDKs (`openai`, `@anthropic-ai/sdk`, `better-sqlite3`, etc.) as peer dependencies and loads them via dynamic `import()`. This means you install only the providers you use; unused providers add zero bundle cost.

**Pipeline** (see **Composition**)

**PII (Personally Identifiable Information)**  
Any data that could identify an individual: names, email addresses, phone numbers, SSNs, IP addresses, etc. `createPiiDetectionRule()` detects PII patterns in agent inputs and outputs, returning a `GuardrailViolationError` or a redacted version of the content.

**Planner**  
The `PlannerModule` in `confused-ai/planner` — decomposes high-level user goals into an ordered sequence of sub-tasks before execution begins. Distinct from the ad-hoc tool selection in the ReAct loop: planners produce explicit task lists that can be reviewed, modified, and tracked.

**Prompt Injection**  
An attack where malicious content in user input or tool results attempts to override the agent's instructions (e.g., "Ignore all previous instructions and..."). `createPromptInjectionRule()` detects common injection patterns. Defense-in-depth: also use `allowlist`/`blocklist` in guardrails and `allowedTools` in tenant context.

---

## R

**RAG (Retrieval-Augmented Generation)**  
A pattern where relevant documents are retrieved from a knowledge base and injected into the LLM prompt before generation, reducing hallucination and enabling agents to answer questions about private or current-events data. Implemented by `KnowledgeEngine`.

**Rate Limiter**  
A mechanism that restricts the number of agent runs per unit time. `RateLimiter` (in-process, fixed window) and `RedisRateLimiter` (distributed, multi-instance) implement per-agent or per-tenant request throttling. Throws `RateLimitError` when the limit is exceeded.

**ReAct Loop**  
The Reasoning + Acting execution pattern: the LLM is given tools and asked to reason step-by-step, alternating between generating text (reasoning) and invoking tools (acting) until it produces a final answer. The core execution model of `AgenticRunner`.

**Resilience**  
The set of mechanisms that maintain agent availability and correctness under failure conditions. In confused-ai, resilience is composed via `withResilience()`: circuit breaker + rate limiter + retry + health check + graceful shutdown.

**Run**  
A single invocation of `agent.run(prompt, options)` or `agent.stream(prompt, options)`. A run has a unique `runId`, spans zero or more LLM calls and tool invocations, and produces a single final result. Runs can be checkpointed and resumed.

**Run ID**  
A unique identifier for a single agent run. Used for: idempotency deduplication, checkpoint storage, audit log correlation, OTLP trace correlation, execution replay. Generated automatically if not provided; can be supplied by the caller for idempotency purposes.

---

## S

**Session**  
A persistent conversation context identified by `sessionId`. Contains the ordered message history for a conversation. Stored in a `SessionStore`. Multiple runs can share a session to maintain conversational context across requests.

**Session Memory** (see **Memory** for distinction)  
The `sessionId`-scoped message history. Short-term, structured, conversation-focused. Retrieved and injected at run start; appended to at run end.

**Span**  
A unit of work in distributed tracing. Each significant operation in a run (LLM call, tool execution, RAG retrieval, guardrail check) is represented as a span with start/end times, attributes, and parent/child relationships. Exported via `OTLPTraceExporter`.

**Stream**  
An `AsyncIterable<string>` returned by `agent.stream()` that yields text chunks as the LLM generates them. Enables real-time token-by-token display in UIs. Transported via SSE (Server-Sent Events) over HTTP or WebSocket.

**Supervisor**  
A multi-agent pattern where a "manager" agent decomposes tasks and delegates to "worker" agents, reviewing their outputs and either accepting, revising, or retrying. Created via `createSupervisor()`. See also: *handoff* (one-way delegation), *swarm* (autonomous parallel agents).

**Swarm**  
A multi-agent execution pattern where multiple specialized agents operate in parallel, each handling part of a task independently. Results are aggregated. Created via `createSwarm()`. Distinguished from *supervisor*: no central coordinator; agents are peers.

---

## T

**Tenant**  
An independent customer or organizational unit sharing a confused-ai deployment. Each tenant has isolated: sessions, memory, budget, rate limits, and tool access. Identified by `tenantId` set in `TenantContext`. See *Multi-Tenancy*.

**Tool**  
A typed, schema-validated function that an LLM agent can invoke during execution. Defined via `defineTool()` with a Zod parameter schema and an `execute` function. The Zod schema is auto-converted to JSON Schema for LLM function-calling. Tools are registered in the agent's `ToolRegistry`.

**Tool Call**  
A structured LLM output requesting execution of a specific tool with specific arguments. The LLM produces a `tool_calls` array in its response; the `AgenticRunner` dispatches each call to the matching tool, collects results, and feeds them back to the LLM.

**Tool Gateway**  
An HTTP endpoint (mounted at `/tools` and `/invoke`) that exposes the agent's tool registry for external consumption. Allows non-agent code or other services to invoke the same tools the agent uses. See `handleToolGatewayRequest()`.

**Tool Registry**  
The `Map<string, Tool>` that maps tool names to tool implementations. Lookup is O(1). The `AgenticRunner` uses the registry to dispatch tool calls. Implemented by `ToolRegistryImpl` and `MapToolRegistry`.

**Trace** (see **Span**)

---

## V

**Vector Store**  
A database optimized for storing and querying high-dimensional embedding vectors by cosine similarity. Implements the `VectorStore` interface: `upsert()` and `query()`. Adapters: `InMemoryVectorStore` (dev), `PineconeVectorStore`, `QdrantVectorStore`, `PgVectorStore` (production).

---

## W

**Wave**  
A set of graph nodes that can execute in parallel because all their predecessors have completed. `computeWaves(graph)` returns `NodeId[][]` — each inner array is one wave. The `DAGEngine` executes waves sequentially, all nodes within a wave in parallel.

**Workflow**  
An orchestrated sequence or topology of agent invocations that accomplishes a complex, multi-step task. In confused-ai, workflows are built with `compose()` (sequential), `createGraph()` (DAG), `createSupervisor()` (hierarchical), or `createSwarm()` (parallel). Created via `createWorkflow()` in the SDK layer.

---

## Z

**Zod**  
The schema validation library used throughout confused-ai as the single source of truth for data shapes. All tool parameters are Zod schemas. Zod schemas are used to: validate tool call arguments at runtime (security boundary), generate TypeScript types (DX), and generate JSON Schema for LLM function-calling (LLM interface). Required dependency — not a peer dep.
