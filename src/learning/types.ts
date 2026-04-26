/**
 * Learning: user profiles, memories that accumulate, knowledge that transfers.
 * Supports always-on or agentic learning modes.
 */

import type { EntityId } from '../core/types.js';

/** Learning mode: always persist/learn vs. only when agent explicitly stores */
export enum LearningMode {
    /** Always: persist session, accumulate memories, update profiles automatically */
    ALWAYS = 'always',
    /** Agentic: agent decides when to store/update (e.g. via tools) */
    AGENTIC = 'agentic',
    /** Propose: agent proposes updates, human must confirm before persistence */
    PROPOSE = 'propose',
    /** Human-in-the-Loop: reserved for future multi-turn confirmation flows */
    HITL = 'hitl',
}

// ── Extended Learning Schemas ────────────────────────────────────────────────

/** Unstructured observations about a user — long-term memories across sessions */
export interface UserMemoryEntry {
    readonly id: string;
    readonly content: string;
    readonly createdAt?: string;
    [key: string]: unknown;
}

export interface UserMemory {
    readonly userId: string;
    readonly memories: UserMemoryEntry[];
    readonly agentId?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
}

/** Session-scoped state: what happened, goals, plan, progress */
export interface SessionContext {
    readonly sessionId: string;
    readonly userId?: string;
    readonly summary?: string;
    readonly goal?: string;
    readonly plan?: string[];
    readonly progress?: string[];
    readonly agentId?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
}

/** Reusable insight that can be shared across users/agents */
export interface LearnedKnowledge {
    readonly title: string;
    readonly learning: string;
    readonly context?: string;
    readonly tags?: string[];
    readonly namespace?: string;
    readonly agentId?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
}

/** A fact about a third-party entity (company, project, person, system…) */
export interface EntityFact {
    readonly id: string;
    readonly content: string;
    readonly confidence?: number;
    readonly source?: string;
    [key: string]: unknown;
}

export interface EntityEvent {
    readonly id: string;
    readonly content: string;
    readonly date?: string;
    [key: string]: unknown;
}

export interface EntityRelationship {
    readonly id: string;
    readonly entityId: string;
    readonly relation: string;
    readonly direction?: 'outgoing' | 'incoming';
    [key: string]: unknown;
}

export interface EntityMemory {
    readonly entityId: string;
    readonly entityType: string;
    readonly name?: string;
    readonly description?: string;
    readonly properties?: Record<string, string>;
    readonly facts: EntityFact[];
    readonly events: EntityEvent[];
    readonly relationships: EntityRelationship[];
    readonly namespace?: string;
    readonly agentId?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
}

/** A decision made by the agent with its reasoning and outcome */
export interface DecisionLog {
    readonly id: string;
    readonly decision: string;
    readonly reasoning?: string;
    readonly decisionType?: string;
    readonly context?: string;
    readonly alternatives?: string[];
    readonly confidence?: number;
    readonly outcome?: string;
    readonly outcomeQuality?: 'good' | 'bad' | 'neutral';
    readonly tags?: string[];
    readonly sessionId?: string;
    readonly agentId?: string;
    readonly createdAt?: string;
}

// ── Store Interfaces ─────────────────────────────────────────────────────────

/** Store for unstructured user memories */
export interface UserMemoryStore {
    get(userId: string, agentId?: string): Promise<UserMemory | null>;
    set(memory: UserMemory): Promise<UserMemory>;
    addMemory(userId: string, content: string, agentId?: string, extra?: Record<string, unknown>): Promise<string>;
    updateMemory(userId: string, memoryId: string, content: string, agentId?: string): Promise<boolean>;
    deleteMemory(userId: string, memoryId: string, agentId?: string): Promise<boolean>;
    clearMemories(userId: string, agentId?: string): Promise<void>;
}

/** Store for per-session context (summary, goal, plan, progress) */
export interface SessionContextStore {
    get(sessionId: string, agentId?: string): Promise<SessionContext | null>;
    set(context: SessionContext): Promise<SessionContext>;
    clear(sessionId: string, agentId?: string): Promise<boolean>;
}

/** Store for reusable learned knowledge with search */
export interface LearnedKnowledgeStore {
    search(query: string, namespace?: string, limit?: number): Promise<LearnedKnowledge[]>;
    save(knowledge: LearnedKnowledge): Promise<LearnedKnowledge>;
    delete(title: string, namespace?: string): Promise<boolean>;
}

/** Store for entity memories (facts, events, relationships) */
export interface EntityMemoryStore {
    get(entityId: string, namespace?: string): Promise<EntityMemory | null>;
    search(query: string, namespace?: string, limit?: number): Promise<EntityMemory[]>;
    set(entity: EntityMemory): Promise<EntityMemory>;
    addFact(entityId: string, content: string, namespace?: string, extra?: Record<string, unknown>): Promise<string>;
    updateFact(entityId: string, factId: string, content: string): Promise<boolean>;
    deleteFact(entityId: string, factId: string): Promise<boolean>;
    addEvent(entityId: string, content: string, date?: string, namespace?: string): Promise<string>;
    addRelationship(entityId: string, relatedEntityId: string, relation: string, direction?: 'outgoing' | 'incoming', namespace?: string): Promise<string>;
    delete(entityId: string, namespace?: string): Promise<boolean>;
}

/** Generic learning store — every specialised store satisfies this for recall/process */
export interface LearningStore {
    recall(opts: LearningRecallOptions): Promise<unknown>;
    process(opts: LearningProcessOptions): Promise<void>;
    buildContext(data: unknown): string;
    getTools?(opts: LearningToolOptions): LearningTool[];
}

// ── LearningMachine Options ──────────────────────────────────────────────────

export interface LearningRecallOptions {
    userId?: string;
    sessionId?: string;
    message?: string;
    entityId?: string;
    entityType?: string;
    namespace?: string;
    agentId?: string;
    [key: string]: unknown;
}

export interface LearningProcessOptions {
    messages: Array<{ role: string; content: string }>;
    userId?: string;
    sessionId?: string;
    namespace?: string;
    agentId?: string;
    [key: string]: unknown;
}

export interface LearningToolOptions {
    userId?: string;
    sessionId?: string;
    namespace?: string;
    agentId?: string;
    [key: string]: unknown;
}

export type LearningTool = (...args: unknown[]) => unknown;

/** User profile that persists across sessions */
export interface UserProfile {
    readonly id: EntityId;
    readonly userId: string;
    readonly agentId?: EntityId;
    readonly displayName?: string;
    readonly preferences?: Record<string, unknown>;
    readonly metadata: Record<string, unknown>;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

/** Query for user profiles */
export interface UserProfileQuery {
    readonly userId?: string;
    readonly agentId?: EntityId;
    readonly limit?: number;
}

/** Store for user profiles (plug any DB) */
export interface UserProfileStore {
    get(userId: string, agentId?: EntityId): Promise<UserProfile | null>;
    set(profile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserProfile>;
    update(userId: string, updates: Partial<Omit<UserProfile, 'id' | 'userId' | 'createdAt'>>, agentId?: EntityId): Promise<UserProfile>;
    list(query?: UserProfileQuery): Promise<UserProfile[]>;
    delete(userId: string, agentId?: EntityId): Promise<boolean>;
}
