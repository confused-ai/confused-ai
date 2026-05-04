/**
 * @confused-ai/sdk — High-level SDK for the confused-ai agent framework.
 *
 * Provides typed agent definitions, multi-step workflows, and orchestration adapters.
 */

export type { AgentDefinitionConfig, AgentRunConfig, WorkflowResult } from './types.js';
export { defineAgent, DefinedAgent } from './defined-agent.js';
export { createWorkflow, WorkflowBuilder, Workflow } from './workflow.js';
export type { WorkflowStep } from './workflow.js';
export { asOrchestratorAgent } from './orchestrator-adapter.js';

// Re-export core types for convenience (explicit to avoid ambiguity with tools/planner/execution)
export type {
    Agent,
    AgentRunOptions,
    AgentRunResult,
    AgentLifecycleHooks,
    Message,
    MultiModalInput,
    EntityId,
    LLMProvider,
    GenerateOptions,
    GenerateResult,
    StreamChunk,
    AgentState,
    AgentInput,
    AgentOutput,
    AgentContext,
    ITextGenerator,
    IStreamingProvider,
    IToolCallProvider,
    IEmbeddingProvider,
    IFullLLMProvider,
} from '@confused-ai/core';
export { createAgent, generateEntityId } from '@confused-ai/core';
// Tools
export * from '@confused-ai/tools';
// Planner, memory, execution — only unique members
export * from '@confused-ai/memory';
export * from '@confused-ai/planner';
export * from '@confused-ai/execution';
