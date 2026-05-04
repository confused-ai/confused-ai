/**
 * @confused-ai/orchestration — Multi-agent coordination patterns.
 *
 * Capabilities:
 *   - Team: Named agents collaborating with shared context
 *   - Swarm: Autonomous agents with handoffs and dynamic routing  
 *   - Supervisor: Hierarchical agent with worker delegation
 *   - Pipeline: Sequential agent workflows with stage outputs
 *   - Consensus: Multi-agent voting and agreement protocols
 *   - Handoff: Agent-to-agent context transfers
 *   - Router: Semantic and keyword routing to specialized agents
 *   - A2A (Agent-to-Agent): HTTP Google protocol for distributed agents
 *   - MCP Toolkit: Model Context Protocol client/server integration
 *   - Orchestrator: Core agent registration and delegation
 *   - Message Bus: Pub/sub communication between agents
 *   - Load Balancer: Round-robin and least-loaded agent selection
 *
 * @example
 * ```ts
 * import { AgentTeam, AgentSwarm, AgentPipeline } from '@confused-ai/orchestration';
 *
 * const team = new AgentTeam([researchAgent, writeAgent, reviewAgent]);
 * const result = await team.run('Research and write a blog post about AI');
 * ```
 */

// ── Core infrastructure ────────────────────────────────────────────────────
export * from './core/types.js';
export * from './core/orchestrator.js';
export * from './core/message-bus.js';
export * from './core/load-balancer.js';
export * from './core/mcp-types.js';
export * from './core/toolkit.js';
export * from './core/agent-adapter.js';

// ── Multi-agent patterns ───────────────────────────────────────────────────
export * from './multi-agent/team.js';
export * from './multi-agent/swarm.js';
export * from './multi-agent/supervisor.js';
export * from './multi-agent/pipeline.js';
export * from './multi-agent/consensus.js';
export * from './multi-agent/handoff.js';
export * from './multi-agent/router.js';

// ── Agent-to-Agent (A2A) protocol ─────────────────────────────────────────
export * from './a2a/types.js';
export * from './a2a/client.js';
export * from './a2a/http-client.js';
export * from './a2a/server.js';

// ── Context builder ────────────────────────────────────────────────────────
export { AgentContextBuilder } from './_context-builder.js';

// ── Trace context ─────────────────────────────────────────────────────────
export {
    extractTraceContext,
    injectTraceHeaders,
    generateTraceparent,
} from './_trace-context.js';
export type { TraceContext } from './_trace-context.js';
