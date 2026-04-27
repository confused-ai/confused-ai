/**
 * confused-ai/workflow — Multi-agent pipelines, graphs, and orchestration.
 *
 * ```ts
 * import { compose, pipe, graph, orchestrate } from 'confused-ai/workflow'
 * ```
 */

// ── Compose & Pipe (lightweight pipelines) ──────────────────────────────────
export {
    compose,
    pipe,
    type ComposeOptions,
    type ComposedAgent,
} from './dx/compose.js';

// ── Graph Engine (DAG-based workflows) ──────────────────────────────────────
export {
    // Builder
    GraphBuilder,
    createGraph,

    // Engine
    DAGEngine,
    DurableExecutor,
    replayState,

    // Distributed
    DefaultScheduler,
    GraphWorker,
    DistributedEngine,
    InMemoryTaskQueue,
    computeWaves,

    // Event store
    InMemoryEventStore,
    SqliteEventStore,

    // Multi-agent
    AgentRuntime,
    MultiAgentOrchestrator,
    agentNode,

    // Memory
    InMemoryStore,
    InMemoryVectorMemory,
    ContextWindowManager,
    MemoryManager,

    // Plugins
    TelemetryPlugin,
    LoggingPlugin,
    OpenTelemetryPlugin,

    // Bridge
    wrapCoreLLM,

    // Types
    type GraphDef,
    type GraphState,
    type GraphEvent,
    type GraphPlugin,
    type AgentDef,
    type AgentResult,
    type OrchestratorResult,
    type ExecuteOptions,
    type ExecutionResult,
} from './graph/index.js';

// ── Legacy Orchestration (re-exports for compat) ────────────────────────────
export * from './orchestration/index.js';
