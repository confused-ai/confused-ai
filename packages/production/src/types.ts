/**
 * Production: runtime, control plane, evals for accuracy, performance, latency.
 */

import type { EntityId } from '@confused-ai/core';

/** HTTP runtime: serve agents over HTTP (FastAPI-style; use Express/Hono/Fastify impl) */
export interface AgentRuntime {
    /** Start the server (e.g. listen on port) */
    start(): Promise<void>;

    /** Stop the server */
    stop(): Promise<void>;

    /** Register an agent route (e.g. POST /agents/:id/run) */
    registerAgent?(agentId: EntityId, handler: (body: unknown) => Promise<unknown>): void;
}

/** Control plane: monitor and manage agents (optional UI backend) */
export interface ControlPlane {
    /** List agents */
    listAgents(): Promise<{ id: EntityId; name: string; status?: string }[]>;

    /** Get agent stats (runs, latency, errors) */
    getAgentStats?(agentId: EntityId): Promise<ProductionAgentStats>;

    /** Optional: get runs/sessions for an agent */
    getRuns?(agentId: EntityId, options?: { limit?: number }): Promise<RunSummary[]>;
}

export interface ProductionAgentStats {
    readonly agentId: EntityId;
    readonly totalRuns: number;
    readonly successCount: number;
    readonly failureCount: number;
    readonly avgLatencyMs: number;
    readonly p95LatencyMs?: number;
}

export interface RunSummary {
    readonly id: string;
    readonly agentId: EntityId;
    readonly sessionId?: string;
    readonly status: string;
    readonly latencyMs?: number;
    readonly startedAt: Date;
}

/** Eval: accuracy, performance, latency */
export interface EvalSuite {
    readonly id: string;
    readonly name: string;
    /** Run eval and return metrics */
    run(options?: EvalRunOptions): Promise<EvalResult>;
}

export interface EvalRunOptions {
    readonly agentId?: EntityId;
    readonly dataset?: EvalSample[];
    readonly maxSamples?: number;
}

export interface EvalSample {
    readonly id: string;
    readonly input: string | Record<string, unknown>;
    readonly expectedOutput?: string | Record<string, unknown>;
    readonly metadata?: Record<string, unknown>;
}

export interface EvalResult {
    readonly suiteId: string;
    readonly accuracy?: number;
    readonly latencyMs?: number;
    readonly latencyP95Ms?: number;
    readonly latencyP99Ms?: number;
    readonly throughputPerMin?: number;
    readonly errorRate?: number;
    readonly samplesTotal: number;
    readonly samplesPassed?: number;
    readonly details?: Record<string, unknown>;
}
