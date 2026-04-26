/**
 * Handoff Protocol — Structured agent-to-agent task handoff.
 *
 * Enables typed, traceable handoffs between agents with context preservation.
 *
 * @example
 * ```ts
 * import { createHandoff, HandoffProtocol } from 'fluxion/orchestration';
 *
 * const handoff = createHandoff({
 *   from: triageAgent,
 *   to: { billing: billingAgent, technical: techAgent },
 *   router: async (context) => {
 *     if (context.prompt.includes('bill')) return 'billing';
 *     return 'technical';
 *   },
 * });
 *
 * const result = await handoff.execute('I need help with my invoice');
 * ```
 */

import type { AgentInput, AgentOutput } from '../../contracts/index.js';
import { AgentState } from '../../contracts/index.js';
import { Agent as CoreAgent } from '../core/types.js';
import type { AgentContext } from '../core/types.js';

// ── Types ──────────────────────────────────────────────────────────────────

/** Context available during handoff routing decisions. */
export interface HandoffContext {
    readonly prompt: string;
    readonly fromAgent: string;
    readonly conversationHistory?: string[];
    readonly metadata?: Record<string, unknown>;
}

/** A single handoff record for tracing. */
export interface HandoffRecord {
    readonly id: string;
    readonly fromAgent: string;
    readonly toAgent: string;
    readonly reason: string;
    readonly timestamp: Date;
    readonly context: HandoffContext;
    readonly result?: AgentOutput;
    readonly executionTimeMs?: number;
}

/** Configuration for handoff protocol. */
export interface HandoffConfig {
    /** Source agent that initiates the handoff. */
    readonly from: CoreAgent;
    /** Named target agents. */
    readonly to: Record<string, CoreAgent>;
    /** Router function that decides which target agent to hand off to. */
    readonly router: (context: HandoffContext) => Promise<string> | string;
    /** Optional: transform the input before handing off. */
    readonly transformInput?: (input: AgentInput, targetName: string) => AgentInput;
    /** Optional: aggregate results from the handoff chain. */
    readonly aggregateResults?: (results: HandoffRecord[]) => unknown;
    /** Max handoff depth to prevent infinite loops. Default: 5. */
    readonly maxDepth?: number;
    /** Enable conversation context forwarding. Default: true. */
    readonly forwardContext?: boolean;
}

/** Result of a handoff execution. */
export interface HandoffResult {
    readonly finalOutput: AgentOutput;
    readonly handoffChain: HandoffRecord[];
    readonly totalExecutionTimeMs: number;
}

// ── Implementation ─────────────────────────────────────────────────────────

export class HandoffProtocol {
    private readonly config: HandoffConfig;
    private handoffHistory: HandoffRecord[] = [];

    constructor(config: HandoffConfig) {
        this.config = config;
    }

    /** Execute a handoff: route → transform → execute → trace. */
    async execute(prompt: string, metadata?: Record<string, unknown>): Promise<HandoffResult> {
        const maxDepth = this.config.maxDepth ?? 5;
        const chain: HandoffRecord[] = [];
        const start = Date.now();

        let currentPrompt = prompt;
        let currentFrom = this.config.from.name;
        let depth = 0;

        while (depth < maxDepth) {
            const context: HandoffContext = {
                prompt: currentPrompt,
                fromAgent: currentFrom,
                conversationHistory: chain.map(h => `[${h.fromAgent} → ${h.toAgent}]: ${h.context.prompt}`),
                metadata,
            };

            const targetName = await this.config.router(context);
            const targetAgent = this.config.to[targetName];

            if (!targetAgent) {
                throw new Error(`Handoff target '${targetName}' not found. Available: ${Object.keys(this.config.to).join(', ')}`);
            }

            let input: AgentInput = { prompt: currentPrompt, context: metadata };
            if (this.config.transformInput) {
                input = this.config.transformInput(input, targetName);
            }

            const stepStart = Date.now();
            const ctx = createMinimalContext(targetAgent.id);
            const output = await targetAgent.run(input, ctx);

            const record: HandoffRecord = {
                id: `handoff-${Date.now()}-${depth}`,
                fromAgent: currentFrom,
                toAgent: targetName,
                reason: `Routed by handoff protocol (depth ${depth})`,
                timestamp: new Date(),
                context,
                result: output,
                executionTimeMs: Date.now() - stepStart,
            };
            chain.push(record);
            this.handoffHistory.push(record);

            // If the agent completed, return the result
            if (output.state === AgentState.COMPLETED || output.state === AgentState.FAILED) {
                return {
                    finalOutput: output,
                    handoffChain: chain,
                    totalExecutionTimeMs: Date.now() - start,
                };
            }

            depth++;
            currentFrom = targetName;
        }

        // Max depth reached
        const lastRecord = chain[chain.length - 1];
        return {
            finalOutput: lastRecord?.result ?? {
                result: 'Handoff chain exceeded max depth',
                state: AgentState.FAILED,
                metadata: { startTime: new Date(), iterations: depth, durationMs: Date.now() - start },
            },
            handoffChain: chain,
            totalExecutionTimeMs: Date.now() - start,
        };
    }

    /** Get the full handoff history. */
    getHistory(): HandoffRecord[] {
        return [...this.handoffHistory];
    }

    /** Clear handoff history. */
    clearHistory(): void {
        this.handoffHistory = [];
    }
}

/** Create a handoff protocol instance. */
export function createHandoff(config: HandoffConfig): HandoffProtocol {
    return new HandoffProtocol(config);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function createMinimalContext(agentId: string): AgentContext {
    const { InMemoryStore } = require('../../memory/in-memory-store.js');
    const { ToolRegistryImpl } = require('../../tools/core/registry.js');

    return {
        agentId,
        memory: new InMemoryStore(),
        tools: new ToolRegistryImpl(),
        planner: null as any,
        metadata: {},
    };
}
