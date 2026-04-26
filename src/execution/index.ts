/**
 * Execution module exports
 */

export * from './types.js';
export { ExecutionEngineImpl } from './engine.js';
export { ExecutionGraphBuilder } from './graph-builder.js';
export { WorkerPool } from './worker-pool.js';

// Workflow — step-chaining workflows
export {
    createWorkflow as createStepWorkflow,
    createStep,
    Workflow as StepWorkflow,
    WorkflowBuilder as StepWorkflowBuilder,
} from './workflow.js';
export type {
    WorkflowConfig as StepWorkflowConfig,
    StepConfig,
    WorkflowStep as StepWorkflowStep,
    ParallelStepGroup,
    StepResult,
    WorkflowExecutionResult,
    WorkflowStepStatus,
    StepExecutionContext,
} from './workflow.js';

// Graph-based state management
export {
    StateGraph,
    StateNode,
    WorkflowStatus,
    NodeType,
    TransitionType,
} from './state-graph.js';
export type {
    NodeExecutionRecord,
    WorkflowError,
} from './state-graph.js';
export { WorkflowExecutor } from './state-graph.js';
export type {
    StateNodeConfig,
    TransitionConfig,
    WorkflowConfig,
    WorkflowExecutorConfig,
    StateGraphSnapshot,
    RetryPolicyConfig,
    CheckpointStore,
    WorkflowContext,
    WorkflowExecutorResult,
} from './state-graph.js';

// Note: InMemoryCheckpointStore is already exported from production module
// Re-export with alias to avoid conflict
export { InMemoryCheckpointStore as GraphCheckpointStore } from './state-graph.js';

// Event-driven execution engine v2
export {
    StepExecutor,
    PipelineBuilder,
    executeParallel,
    BackpressureQueue,
    EngineEvent,
    StepPriority,
} from './engine-v2.js';
export type {
    StepConfig as StepExecutorStepConfig,
    StepContext,
    StepResult as StepExecutorResult,
    StepErrorPolicy,
    StepExecutorConfig,
    WorkflowExecutionResultV2,
    ExecutionStatus,
    QueuedStep,
    EngineEventPayload,
    EngineEventType,
} from './engine-v2.js';