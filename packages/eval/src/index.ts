/**
 * @confused-ai/eval — Evaluation framework for AI agents.
 *
 * Provides:
 * - LLM-as-judge rubric scoring
 * - Text metrics: word overlap F1, ROUGE-L
 * - Eval store: persist and query eval results
 * - Dataset loader: JSON, JSON lines, CSV
 * - Regression runner: CI/CD pass/fail
 */

// Core eval framework (eval result types, text metrics)
export * from './eval.js';

// Eval store (persistence + querying)
export * from './eval-store.js';

// LLM-as-judge
export * from './llm-judge.js';

// Metrics (latency, cost, token stats)
export * from './metrics.js';

// Dataset loading
export * from './dataset.js';

// Regression runner
export * from './regression.js';

// Observability types (MetricsCollector, MetricValue, MetricType)
export * from './obs-types.js';
