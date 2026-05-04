/**
 * Standard OpenTelemetry metric counters/histograms used across confused-ai.
 *
 * Importers should ensure an OTEL meter provider is registered before reading
 * these — without one, the no-op default provider is used and writes are
 * silently discarded.
 *
 * @module
 */
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('confused-ai');

export const Metrics = {
  // ── Agent runs ──────────────────────────────────────────────────────────
  /** Total agent runs initiated. Attributes: `agent_name`. */
  agentRunsTotal: meter.createCounter('agent.runs.total', {
    description: 'Total agent runs initiated',
  }),
  /** Wall-clock duration of each agent run. Attributes: `agent_name`. */
  agentRunDurationMs: meter.createHistogram('agent.run.duration_ms', {
    description: 'Wall-clock duration of agent runs',
    unit: 'ms',
  }),

  // ── Tools ───────────────────────────────────────────────────────────────
  /** Total tool invocations. Attributes: `tool_name`, `agent_name`. */
  toolCallsTotal: meter.createCounter('agent.tool_calls.total'),
  /** Tool invocations that resulted in an error. Attributes: `tool_name`. */
  toolErrorsTotal: meter.createCounter('agent.tool_errors.total'),
  /** Tool execution duration. Attributes: `tool_name`. */
  toolDurationMs: meter.createHistogram('agent.tool.duration_ms', { unit: 'ms' }),

  // ── LLM ─────────────────────────────────────────────────────────────────
  /** LLM token usage. Attributes: `model`, `token_type` (`input`|`output`). */
  llmTokensTotal: meter.createCounter('llm.tokens.total'),
  /** Cumulative LLM spend in USD. Attributes: `model`. */
  llmCostUsd: meter.createCounter('llm.cost.usd'),
  /** LLM provider errors. Attributes: `provider`, `error_type`. */
  llmErrorsTotal: meter.createCounter('llm.errors.total'),

  // ── Resilience ───────────────────────────────────────────────────────────
  /** Number of times a circuit breaker has transitioned to OPEN. Attributes: `service`. */
  circuitBreakerOpensTotal: meter.createCounter('circuit_breaker.opens.total'),
  /** Budget limit violations. Attributes: `scope` (`user`|`tenant`). */
  budgetExceededTotal: meter.createCounter('budget.exceeded.total'),
  /** Guardrail rule violations. Attributes: `rule`, `severity`. */
  guardrailViolationsTotal: meter.createCounter('guardrail.violations.total'),

  // ── HTTP ─────────────────────────────────────────────────────────────────
  /** Total inbound HTTP requests. Attributes: `agent_name`, `status_code`, `method`. */
  httpRequestsTotal: meter.createCounter('http.requests.total'),
  /** HTTP request duration histogram. Attributes: `route`, `method`, `status_code`. */
  httpRequestDurationMs: meter.createHistogram('http.request.duration_ms', { unit: 'ms' }),
  /** Number of active SSE / streaming connections. */
  httpActiveStreams: meter.createUpDownCounter('http.active_streams'),
} as const;
