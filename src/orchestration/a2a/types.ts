/**
 * A2A (Agent-to-Agent) Protocol — Google A2A Spec Types
 *
 * Based on: https://google.github.io/A2A/specification/
 *
 * Covers:
 *   - AgentCard        — discovery document served at /.well-known/agent.json
 *   - Task             — unit of work sent to an agent
 *   - Message / Part   — structured content (text, file, data)
 *   - Task lifecycle   — submitted → working → completed / failed / canceled / input-required
 *   - JSON-RPC methods — tasks/send, tasks/get, tasks/cancel, tasks/sendSubscribe
 *   - Push notification config
 */

// ── Part types ─────────────────────────────────────────────────────────────

export interface A2ATextPart {
    type: 'text';
    text: string;
    metadata?: Record<string, unknown>;
}

export interface A2AFilePart {
    type: 'file';
    file: {
        name?: string;
        mimeType?: string;
        /** Inline base64-encoded content */
        data?: string;
        /** External URL */
        uri?: string;
    };
    metadata?: Record<string, unknown>;
}

export interface A2ADataPart {
    type: 'data';
    data: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export type A2APart = A2ATextPart | A2AFilePart | A2ADataPart;

// ── Message ────────────────────────────────────────────────────────────────

export interface A2AMessage {
    role: 'user' | 'agent';
    parts: A2APart[];
    metadata?: Record<string, unknown>;
}

// ── Artifact ───────────────────────────────────────────────────────────────

export interface A2AArtifact {
    name?: string;
    description?: string;
    parts: A2APart[];
    index: number;
    append?: boolean;
    lastChunk?: boolean;
    metadata?: Record<string, unknown>;
}

// ── Task status ────────────────────────────────────────────────────────────

export type A2ATaskState =
    | 'submitted'
    | 'working'
    | 'input-required'
    | 'completed'
    | 'failed'
    | 'canceled';

export interface A2ATaskStatus {
    state: A2ATaskState;
    message?: A2AMessage;
    timestamp?: string; // ISO-8601
}

// ── Task ───────────────────────────────────────────────────────────────────

export interface A2ATask {
    id: string;
    sessionId?: string;
    status: A2ATaskStatus;
    artifacts?: A2AArtifact[];
    history?: A2AMessage[];
    metadata?: Record<string, unknown>;
}

// ── AgentCard ──────────────────────────────────────────────────────────────

export interface A2AAgentSkill {
    id: string;
    name: string;
    description?: string;
    tags?: string[];
    examples?: string[];
    inputModes?: string[];
    outputModes?: string[];
}

export interface A2AAgentCapabilities {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
}

export interface A2AAgentAuthentication {
    schemes: string[];
    credentials?: string;
}

export interface A2AAgentCard {
    name: string;
    description?: string;
    url: string;
    version: string;
    provider?: {
        organization: string;
        url?: string;
    };
    documentationUrl?: string;
    iconUrl?: string;
    capabilities: A2AAgentCapabilities;
    authentication?: A2AAgentAuthentication;
    defaultInputModes?: string[];
    defaultOutputModes?: string[];
    skills: A2AAgentSkill[];
}

// ── Push notification config ───────────────────────────────────────────────

export interface A2APushNotificationConfig {
    url: string;
    token?: string;
    authentication?: {
        schemes: string[];
        credentials?: string;
    };
}

// ── JSON-RPC request/response shapes ──────────────────────────────────────

export interface A2ATaskSendParams {
    id: string;
    sessionId?: string;
    message: A2AMessage;
    historyLength?: number;
    pushNotification?: A2APushNotificationConfig;
    metadata?: Record<string, unknown>;
}

export interface A2ATaskGetParams {
    id: string;
    historyLength?: number;
}

export interface A2ATaskCancelParams {
    id: string;
    metadata?: Record<string, unknown>;
}

export interface A2ATaskPushNotificationSetParams {
    id: string;
    pushNotificationConfig: A2APushNotificationConfig;
}

export interface A2ATaskPushNotificationGetParams {
    id: string;
}

// ── SSE streaming event types ─────────────────────────────────────────────

export interface A2ATaskStatusUpdateEvent {
    id: string;
    status: A2ATaskStatus;
    final: boolean;
    metadata?: Record<string, unknown>;
}

export interface A2ATaskArtifactUpdateEvent {
    id: string;
    artifact: A2AArtifact;
    metadata?: Record<string, unknown>;
}

export type A2AStreamEvent =
    | { type: 'TaskStatusUpdateEvent'; data: A2ATaskStatusUpdateEvent }
    | { type: 'TaskArtifactUpdateEvent'; data: A2ATaskArtifactUpdateEvent };

// ── Error codes ────────────────────────────────────────────────────────────

export const A2A_ERRORS = {
    TASK_NOT_FOUND: -32001,
    TASK_NOT_CANCELABLE: -32002,
    PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
    UNSUPPORTED_OPERATION: -32004,
    CONTENT_TYPE_NOT_SUPPORTED: -32005,
    INVALID_AGENT_RESPONSE: -32006,
} as const;

// ── Builder helpers ────────────────────────────────────────────────────────

export function textPart(text: string): A2ATextPart {
    return { type: 'text', text };
}

export function dataPart(data: Record<string, unknown>): A2ADataPart {
    return { type: 'data', data };
}

export function filePart(file: A2AFilePart['file']): A2AFilePart {
    return { type: 'file', file };
}

export function userMessage(text: string, extraParts?: A2APart[]): A2AMessage {
    return { role: 'user', parts: [textPart(text), ...(extraParts ?? [])] };
}

export function agentMessage(text: string, extraParts?: A2APart[]): A2AMessage {
    return { role: 'agent', parts: [textPart(text), ...(extraParts ?? [])] };
}
