/**
 * Orchestration module — multi-agent coordination, A2A protocol, and core infrastructure.
 *
 * Sub-modules:
 *   core/        Message bus, load balancer, orchestrator, toolkit, agent adapter, MCP types
 *   multi-agent/ Swarm, team, supervisor, pipeline, router, consensus, handoff
 *   a2a/         Google Agent-to-Agent protocol: types, client, server, HTTP client
 */

export * from './core/index.js';
export * from './multi-agent/index.js';
export * from './a2a/index.js';
