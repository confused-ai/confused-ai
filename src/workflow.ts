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
export * from '@confused-ai/graph';

// ── Orchestration ───────────────────────────────────────────────────────────
export {
    CoordinationType,
    MessageBusImpl, OrchestratorImpl,
    Team, SwarmOrchestrator,
    createSupervisor, createConsensus, createPipeline,
    createHandoff, createAgentRouter,
    createRunnableAgent,
    RoundRobinLoadBalancer, LeastConnectionsLoadBalancer, WeightedResponseTimeLoadBalancer,
    createHttpA2AClient, A2AServer,
    createToolkit, toolkitsToRegistry,
    extractTraceContext, generateTraceparent, injectTraceHeaders,
} from '@confused-ai/orchestration';
export type {
    OrchestrableAgent, AgentRole, AgentRegistration,
    MCPToolDescriptor, MCPAgentMessage, MCPAgentClient,
    A2ATask, A2ATaskState, A2AAgentCard, A2AMessage, IA2AClient, A2AStreamEvent,
    TraceContext, LoadBalancer,
} from '@confused-ai/orchestration';
