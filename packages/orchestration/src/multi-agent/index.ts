// Multi-agent orchestration: swarm, team, supervisor, pipeline, router, consensus, handoff
export {
    SwarmOrchestrator,
    createSwarm,
    createSwarmAgent,
} from './swarm.js';
export type {
    SwarmConfig,
    SwarmResult,
    SubagentTemplate,
    Subtask,
    SubtaskResult,
    ExecutionStage,
    CriticalPathMetrics,
    SubagentInstance,
} from './swarm.js';

export { Team, createResearchTeam, createDecisionTeam } from './team.js';
export type { TeamAgent, TeamConfig, TeamMemberResult, TeamResult } from './team.js';

export { createSupervisor, createRole } from './supervisor.js';
export type { SupervisorConfig } from './supervisor.js';

export { createPipeline } from './pipeline.js';
export type { PipelineConfig } from './pipeline.js';

export { AgentRouter, createAgentRouter } from './router.js';
export type { RoutableAgent, AgentRouterConfig, RouteResult, AgentRoutingStrategy } from './router.js';

export { HandoffProtocol, createHandoff } from './handoff.js';
export type { HandoffConfig, HandoffResult, HandoffRecord, HandoffContext } from './handoff.js';

export { ConsensusProtocol, createConsensus } from './consensus.js';
export type { ConsensusConfig, ConsensusResult, AgentVote, ConsensusStrategy } from './consensus.js';
