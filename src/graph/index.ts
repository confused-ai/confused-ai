/**
 * Graph Execution Engine — Public API
 *
 * This is the main entry point for the graph-based execution engine.
 * Import from 'confused-ai/graph' to access all graph engine capabilities.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createGraph, DAGEngine } from 'confused-ai/graph';
 *
 * const graph = createGraph('my-workflow')
 *   .addNode('start', { kind: 'start' })
 *   .addNode('process', { kind: 'task', execute: async (ctx) => { ... } })
 *   .addNode('end', { kind: 'end' })
 *   .chain('start', 'process', 'end')
 *   .build();
 *
 * const engine = new DAGEngine(graph);
 * const result = await engine.execute();
 * ```
 *
 * ## Architecture
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                     Graph Builder (Fluent API)                    │
 * │   createGraph() → addNode() → addEdge() → chain() → build()     │
 * └───────────────────────────┬──────────────────────────────────────┘
 *                             │ produces GraphDef
 * ┌───────────────────────────▼──────────────────────────────────────┐
 * │                     DAG Engine (Single-Process)                   │
 * │   Topological ordering → parallel execution → event emission      │
 * │   OR                                                              │
 * │                  Distributed Engine (Multi-Worker)                 │
 * │   Scheduler → TaskQueue → Worker(s) → result aggregation         │
 * └───────────────────────────┬──────────────────────────────────────┘
 *                             │ emits GraphEvents
 * ┌───────────────────────────▼──────────────────────────────────────┐
 * │                     Event Store (Durability)                      │
 * │   InMemory │ SQLite │ Postgres │ Redis │ Kafka                    │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 */

// ── Core Types ──────────────────────────────────────────────────────────────

export {
  // ID types and factories
  type NodeId,
  type EdgeId,
  type GraphId,
  type ExecutionId,
  type WorkerId,
  nodeId,
  edgeId,
  graphId,
  executionId,
  workerId,
  uid,

  // Enums
  NodeKind,
  NodeStatus,
  ExecutionStatus,
  GraphEventType,

  // Node & Edge definitions
  type GraphNodeDef,
  type GraphEdgeDef,
  type RetryPolicy,
  type TimeoutPolicy,
  type AgentNodeConfig,
  type WaitConfig,

  // Graph definition
  type GraphDef,

  // Execution state
  type GraphState,
  type NodeState,

  // Node execution context
  type NodeContext,
  type NodeLogger,

  // Events
  type GraphEvent,

  // Event store / checkpoints
  type EventStore,
  type Checkpoint,

  // Scheduler / Worker contracts
  type TaskEnvelope,
  type TaskResult,
  type StateMutation,
  type TaskQueue,
  type Scheduler,

  // Plugin
  type GraphPlugin,

  // Memory
  type MemoryStore,
  type VectorMemory,
  type VectorSearchResult,

  // LLM
  type LLMProvider,
  type LLMMessage,
  type LLMOptions,
  type LLMToolDef,
  type LLMToolCall,
  type LLMResponse,
  type LLMChunk,

  // Tools
  type ToolDef,
  type ToolContext,
} from './types.js';

// ── Graph Builder ───────────────────────────────────────────────────────────

export {
  GraphBuilder,
  createGraph,
  type TaskNodeConfig,
  type RouterNodeConfig,
  type ParallelNodeConfig,
  type JoinNodeConfig,
  type AgentNodeShortConfig,
  type WaitNodeShortConfig,
  type NodeConfig,
  type EdgeConfig,
} from './builder.js';

// ── DAG Engine ──────────────────────────────────────────────────────────────

export {
  DAGEngine,
  replayState,
  DurableExecutor,
  type ExecuteOptions,
  type ExecutionResult,
} from './engine.js';

// ── Event Store ─────────────────────────────────────────────────────────────

export {
  InMemoryEventStore,
  SqliteEventStore,
} from './event-store.js';

// ── Scheduler & Workers ─────────────────────────────────────────────────────

export {
  InMemoryTaskQueue,
  RedisTaskQueue,
  DefaultScheduler,
  GraphWorker,
  DistributedEngine,
  computeWaves,
  BackpressureController,
  type WorkerStats,
} from './scheduler.js';

// ── Multi-Agent Orchestration ───────────────────────────────────────────────

export {
  AgentRuntime,
  MultiAgentOrchestrator,
  agentNode,
  type AgentDef,
  type AgentStep,
  type AgentResult,
  type ToolCallResult,
  type AgentMessage,
  type OrchestratorResult,
  type OrchestratorRound,
} from './orchestrator.js';

// ── Memory System ───────────────────────────────────────────────────────────

export {
  InMemoryStore,
  InMemoryVectorMemory,
  ContextWindowManager,
  MemoryManager,
} from './memory.js';

// ── Plugins ─────────────────────────────────────────────────────────────────

export {
  TelemetryPlugin,
  LoggingPlugin,
  OpenTelemetryPlugin,
  AuditPlugin,
  RateLimitPlugin,
  type MetricsSummary,
  type LogLevel,
  type LogEntry,
} from './plugins.js';

// ── Core ↔ Graph Bridge ─────────────────────────────────────────────────────

import type { LLMProvider as CoreLLMProvider, Message as CoreMessage, GenerateResult } from '../providers/types.js';
import type { LLMProvider as GraphLLMProvider, LLMMessage, LLMResponse } from './types.js';

/**
 * Bridge a canonical `providers/types.ts` LLMProvider into the graph engine's
 * `LLMProvider` interface. Use this when you want to pass the same LLM provider
 * you use with `createAgent()` into the graph engine or `AgentRuntime`.
 *
 * @example
 * ```ts
 * import { wrapCoreLLM } from 'confused-ai/graph';
 * import { OpenAIProvider } from 'confused-ai';
 *
 * const core = new OpenAIProvider({ model: 'gpt-4o' });
 * const graphLlm = wrapCoreLLM('gpt-4o', core);
 *
 * const agent: AgentDef = {
 *   name: 'Researcher',
 *   instructions: '...',
 *   llm: graphLlm,
 * };
 * ```
 */
export function wrapCoreLLM(name: string, provider: CoreLLMProvider): GraphLLMProvider {
  return {
    name,
    async generate(messages: LLMMessage[], options): Promise<LLMResponse> {
      // Bridge LLMMessage → core Message (compatible role + content)
      const coreMessages: CoreMessage[] = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const result: GenerateResult = await provider.generateText(coreMessages, {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        stop: options?.stop,
        tools: options?.tools?.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      });

      return {
        content: result.text,
        toolCalls: result.toolCalls?.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
        usage: result.usage ? {
          promptTokens: result.usage.promptTokens ?? 0,
          completionTokens: result.usage.completionTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        } : undefined,
        finishReason: result.finishReason === 'stop' ? 'stop' : undefined,
      };
    },
  };
}
