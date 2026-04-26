/**
 * Multi-agent orchestration types and interfaces
 */

// Re-export src/core types so orchestration sub-modules can import them from '../core/types.js'
export type { EntityId, Agent, AgentInput, AgentOutput, AgentContext } from '../../core/types.js';
export { AgentState } from '../../core/types.js';

// Local imports for use within this file
import type { EntityId, Agent, AgentInput, AgentOutput } from '../../core/types.js';

/**
 * Agent role definition
 */
export interface AgentRole {
    readonly id: EntityId;
    readonly name: string;
    readonly description: string;
    readonly responsibilities: string[];
    readonly permissions: RolePermissions;
    readonly canDelegate: boolean;
    readonly canCommunicateWith: string[];
}

/**
 * Role permissions
 */
export interface RolePermissions {
    readonly canExecuteTools: boolean;
    readonly canAccessMemory: boolean;
    readonly canCreateSubAgents: boolean;
    readonly canModifyPlan: boolean;
    readonly allowedTools?: string[];
    readonly restrictedTools?: string[];
}

/**
 * Agent registration in the orchestrator
 */
export interface AgentRegistration {
    readonly agent: Agent;
    readonly role: AgentRole;
    readonly capabilities: string[];
    readonly metadata: AgentMetadata;
}

/**
 * Agent metadata
 */
export interface AgentMetadata {
    readonly registeredAt: Date;
    readonly lastActiveAt?: Date;
    readonly totalTasksCompleted: number;
    readonly totalTasksFailed: number;
    readonly averageExecutionTimeMs: number;
    readonly currentLoad: number;
    readonly maxConcurrentTasks: number;
}

/**
 * Message for inter-agent communication
 */
export interface AgentMessage {
    readonly id: EntityId;
    readonly from: EntityId;
    readonly to: EntityId | 'broadcast';
    readonly type: MessageType;
    readonly payload: unknown;
    readonly timestamp: Date;
    readonly correlationId?: EntityId;
    readonly priority: MessagePriority;
}

/**
 * Message types
 */
export enum MessageType {
    TASK_REQUEST = 'task_request',
    TASK_RESPONSE = 'task_response',
    DELEGATION = 'delegation',
    NOTIFICATION = 'notification',
    QUERY = 'query',
    COMMAND = 'command',
    EVENT = 'event',
}

/**
 * Message priority
 */
export enum MessagePriority {
    CRITICAL = 0,
    HIGH = 1,
    NORMAL = 2,
    LOW = 3,
}

/**
 * Message bus for agent communication
 */
export interface MessageBus {
    /**
     * Send a message to an agent or broadcast
     */
    send(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<AgentMessage>;

    /**
     * Subscribe to messages
     */
    subscribe(
        subscriberId: EntityId,
        filter: MessageFilter,
        handler: MessageHandler
    ): Subscription;

    /**
     * Unsubscribe from messages
     */
    unsubscribe(subscription: Subscription): void;

    /**
     * Request-response pattern
     */
    request<T>(to: EntityId, payload: unknown, timeoutMs?: number): Promise<T>;
}

/**
 * Message filter
 */
export interface MessageFilter {
    readonly from?: EntityId;
    readonly types?: MessageType[];
    readonly correlationId?: EntityId;
    readonly minPriority?: MessagePriority;
}

/**
 * Message handler
 */
export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

/**
 * Subscription handle
 */
export interface Subscription {
    readonly id: EntityId;
    readonly subscriberId: EntityId;
    readonly unsubscribe: () => void;
}

/**
 * Multi-agent orchestrator
 */
export interface Orchestrator {
    /**
     * Register an agent with a role
     */
    registerAgent(agent: Agent, role: AgentRole): Promise<void>;

    /**
     * Unregister an agent
     */
    unregisterAgent(agentId: EntityId): Promise<void>;

    /**
     * Get a registered agent
     */
    getAgent(agentId: EntityId): AgentRegistration | undefined;

    /**
     * List all registered agents
     */
    listAgents(): AgentRegistration[];

    /**
     * Find agents by role
     */
    findAgentsByRole(roleName: string): AgentRegistration[];

    /**
     * Find agents by capability
     */
    findAgentsByCapability(capability: string): AgentRegistration[];

    /**
     * Delegate a task to the best available agent
     */
    delegateTask(task: DelegationTask, options?: DelegationOptions): Promise<DelegationResult>;

    /**
     * Broadcast a message to all agents
     */
    broadcast(payload: unknown, type?: MessageType): Promise<void>;

    /**
     * Get the message bus
     */
    getMessageBus(): MessageBus;

    /**
     * Start the orchestrator
     */
    start(): Promise<void>;

    /**
     * Stop the orchestrator
     */
    stop(): Promise<void>;
}

/**
 * Task delegation request
 */
export interface DelegationTask {
    readonly id: EntityId;
    readonly description: string;
    readonly requiredCapabilities: string[];
    readonly preferredRole?: string;
    readonly input: AgentInput;
    readonly priority: DelegationPriority;
    readonly deadline?: Date;
}

/**
 * Task priority for delegation
 */
export enum DelegationPriority {
    CRITICAL = 'critical',
    HIGH = 'high',
    NORMAL = 'normal',
    LOW = 'low',
}

/**
 * Delegation options
 */
export interface DelegationOptions {
    readonly timeoutMs?: number;
    readonly retryCount?: number;
    readonly requireAcknowledgment?: boolean;
    readonly loadBalance?: boolean;
}

/**
 * Delegation result
 */
export interface DelegationResult {
    readonly taskId: EntityId;
    readonly assignedAgentId: EntityId;
    readonly status: DelegationStatus;
    readonly output?: AgentOutput;
    readonly error?: string;
    readonly executionTimeMs: number;
}

/**
 * Delegation status
 */
export enum DelegationStatus {
    ASSIGNED = 'assigned',
    COMPLETED = 'completed',
    FAILED = 'failed',
    TIMEOUT = 'timeout',
    REJECTED = 'rejected',
}

/**
 * Load balancer for task distribution
 */
export interface LoadBalancer {
    /**
     * Select the best agent for a task
     */
    selectAgent(
        candidates: AgentRegistration[],
        task: DelegationTask
    ): AgentRegistration | undefined;

    /**
     * Update agent metrics after task completion
     */
    updateMetrics(agentId: EntityId, executionTimeMs: number, success: boolean): void;
}

/**
 * Coordination strategy
 */
export interface CoordinationStrategy {
    /**
     * Coordinate multiple agents for a complex task
     */
    coordinate(agents: AgentRegistration[], task: CoordinationTask): Promise<CoordinationResult>;
}

/**
 * Coordination task
 */
export interface CoordinationTask {
    readonly id: EntityId;
    readonly description: string;
    readonly subtasks: SubTask[];
    readonly coordinationType: CoordinationType;
}

/**
 * Coordination type
 */
export enum CoordinationType {
    SEQUENTIAL = 'sequential',
    PARALLEL = 'parallel',
    PIPELINE = 'pipeline',
    HIERARCHICAL = 'hierarchical',
    CONSENSUS = 'consensus',
}

/**
 * Subtask in a coordination
 */
export interface SubTask {
    readonly id: EntityId;
    readonly description: string;
    readonly requiredCapabilities: string[];
    readonly dependencies: EntityId[];
}

/**
 * Coordination result
 */
export interface CoordinationResult {
    readonly taskId: EntityId;
    readonly status: CoordinationStatus;
    readonly results: Map<EntityId, AgentOutput>;
    readonly aggregatedOutput?: unknown;
    readonly executionTimeMs: number;
}

/**
 * Coordination status
 */
export enum CoordinationStatus {
    SUCCESS = 'success',
    PARTIAL = 'partial',
    FAILED = 'failed',
}