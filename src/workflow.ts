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
export * from './graph/index.js';

// ── Orchestration ───────────────────────────────────────────────────────────
export {
    CoordinationType,
    MessageBusImpl, OrchestratorImpl,
    Team, SwarmOrchestrator,
    createSupervisor, createConsensus, createPipeline,
    createHandoff, createAgentRouter,
    createRunnableAgent,
    RalphLoop, createRalphLoop,
    GSDCoordinator, createGSDCoordinator, InMemoryGSDStorage, FilesystemGSDStorage,
    RoundRobinLoadBalancer, LeastConnectionsLoadBalancer, WeightedResponseTimeLoadBalancer,
    createHttpA2AClient, A2AServer,
    createToolkit, toolkitsToRegistry,
    extractTraceContext, generateTraceparent, injectTraceHeaders,
} from './orchestration/index.js';
export type {
    OrchestrableAgent, AgentRole, AgentRegistration,
    MCPToolDescriptor, MCPAgentMessage, MCPAgentClient,
    A2ATask, A2ATaskState, A2AAgentCard, A2AMessage, IA2AClient, A2AStreamEvent,
    TraceContext, LoadBalancer,
    RalphLoopConfig, RalphLoopContext, RalphLoopLog, RalphLoopResult,
    GSDConfig, GSDState, GSDStorage,
} from './orchestration/index.js';


