/**
 * Multi-agent orchestration: swarm, team, supervisor, pipeline, router, consensus, handoff.
 *
 * @experimental The swarm and advanced multi-agent patterns are newer and not
 * yet semver-stable — their APIs (config shapes, result types) may change in a
 * minor release.
 */

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

export { RalphLoop, createRalphLoop } from './ralph.js';
export type { RalphLoopConfig, RalphLoopContext, RalphLoopLog, RalphLoopResult } from './ralph.js';

export { GSDCoordinator, createGSDCoordinator, InMemoryGSDStorage, FilesystemGSDStorage } from './gsd.js';
export type { GSDConfig, GSDState, GSDStorage } from './gsd.js';

export {
    createMixtureOfAgents,
    createActorCritic,
    createSocraticAgent,
    createPromptChain,
    createProgramOfThought,
    createSkeletonOfThought,
    createStepBackAgent,
    createRejectionSampling,
    createSelfCorrection,
} from './patterns.js';

export type {
    MoAConfig,
    ActorCriticConfig,
    SocraticConfig,
    ChainStep,
    PromptChainConfig,
    ProgramOfThoughtConfig,
    SkeletonOfThoughtConfig,
    StepBackConfig,
    RejectionSamplingConfig,
    SelfCorrectionConfig,
    AnyAgent,
} from './patterns.js';



