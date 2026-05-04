/**
 * Circuit breaker for failing dependencies (LLM, tools, external APIs)
 *
 * Prevents cascading failures by tracking error rates and temporarily
 * blocking calls to failing services. Supports:
 * - Configurable failure thresholds
 * - Automatic recovery with half-open state
 * - Metrics integration for observability
 * - Event callbacks for monitoring
 */

import type { MetricsCollector } from '../observability/types.js';
import { AgentError, ErrorCode, type ErrorCodeType } from '@confused-ai/shared';

/** Circuit breaker states */
export enum CircuitState {
    /** Normal operation - requests pass through */
    CLOSED = 'CLOSED',
    /** Circuit tripped - requests are rejected immediately */
    OPEN = 'OPEN',
    /** Testing recovery - limited requests allowed */
    HALF_OPEN = 'HALF_OPEN',
}

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
    /** Unique name for this circuit (for metrics/logging) */
    readonly name: string;
    /** Number of failures before opening circuit (default: 5) */
    readonly failureThreshold?: number;
    /** Number of successes in half-open before closing (default: 2) */
    readonly successThreshold?: number;
    /** Time in ms before attempting recovery (default: 30000) */
    readonly resetTimeoutMs?: number;
    /** Time window in ms for counting failures (default: 60000) */
    readonly failureWindowMs?: number;
    /** Optional metrics collector for observability */
    readonly metrics?: MetricsCollector;
    /** Callback when state changes */
    readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/** Circuit breaker execution result */
export interface CircuitBreakerResult<T> {
    readonly success: boolean;
    readonly value?: T;
    readonly error?: Error;
    readonly state: CircuitState;
    readonly executionTimeMs: number;
}

/** Error thrown when circuit is open */
export class CircuitOpenError extends AgentError {
    readonly circuitName: string;
    readonly state: CircuitState;
    readonly resetAt: Date;

    constructor(name: string, resetAt: Date) {
        super(`Circuit '${name}' is OPEN. Retry after ${resetAt.toISOString()}`, {
            code: ErrorCode.CIRCUIT_OPEN as ErrorCodeType,
            retryable: true,
            context: { circuitName: name, resetAt: resetAt.toISOString() },
        });
        this.name = 'CircuitOpenError';
        this.circuitName = name;
        this.state = CircuitState.OPEN;
        this.resetAt = resetAt;
        Object.setPrototypeOf(this, CircuitOpenError.prototype);
    }
}

/** Failure record for sliding window */
interface FailureRecord {
    readonly timestamp: number;
    readonly error: Error;
}

/**
 * Circuit Breaker implementation with sliding window failure tracking.
 *
 * @example
 * const breaker = new CircuitBreaker({
 *   name: 'openai-api',
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 * });
 *
 * const result = await breaker.execute(() => openai.chat(...));
 * if (result.success) {
 *   console.log(result.value);
 * } else {
 *   console.error('Blocked or failed:', result.error);
 * }
 */
export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failures: FailureRecord[] = [];
    private successCount = 0;
    private lastFailureTime = 0;
    private openedAt = 0;

    private readonly config: Required<
        Omit<CircuitBreakerConfig, 'metrics' | 'onStateChange'>
    > & Pick<CircuitBreakerConfig, 'metrics' | 'onStateChange'>;

    constructor(config: CircuitBreakerConfig) {
        this.config = {
            name: config.name,
            failureThreshold: config.failureThreshold ?? 5,
            successThreshold: config.successThreshold ?? 2,
            resetTimeoutMs: config.resetTimeoutMs ?? 30_000,
            failureWindowMs: config.failureWindowMs ?? 60_000,
            metrics: config.metrics,
            onStateChange: config.onStateChange,
        };
    }

    /** Get current circuit state */
    getState(): CircuitState {
        return this.state;
    }

    /** Get circuit name */
    getName(): string {
        return this.config.name;
    }

    /** Check if circuit allows requests */
    isAllowed(): boolean {
        this.checkStateTransition();
        return this.state !== CircuitState.OPEN;
    }

    /** Get time until circuit resets (if open) */
    getResetTime(): Date | null {
        if (this.state !== CircuitState.OPEN) return null;
        return new Date(this.openedAt + this.config.resetTimeoutMs);
    }

    /**
     * Execute a function through the circuit breaker.
     * Tracks success/failure and manages state transitions.
     */
    async execute<T>(fn: () => Promise<T>): Promise<CircuitBreakerResult<T>> {
        const startTime = Date.now();

        // Check if we should allow this request
        this.checkStateTransition();

        if (this.state === CircuitState.OPEN) {
            const resetAt = this.getResetTime()!;
            this.recordMetric('circuit_rejected', 1);
            return {
                success: false,
                error: new CircuitOpenError(this.config.name, resetAt),
                state: this.state,
                executionTimeMs: Date.now() - startTime,
            };
        }

        try {
            const value = await fn();
            this.recordSuccess();
            return {
                success: true,
                value,
                state: this.state,
                executionTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            this.recordFailure(error as Error);
            return {
                success: false,
                error: error as Error,
                state: this.state,
                executionTimeMs: Date.now() - startTime,
            };
        }
    }

    /** Force reset the circuit to closed state */
    reset(): void {
        this.transitionTo(CircuitState.CLOSED);
        this.failures = [];
        this.successCount = 0;
        this.lastFailureTime = 0;
        this.openedAt = 0;
    }

    /** Get current failure count within window */
    getFailureCount(): number {
        this.pruneOldFailures();
        return this.failures.length;
    }

    /** Get circuit statistics */
    getStats(): {
        state: CircuitState;
        failureCount: number;
        successCount: number;
        lastFailure: Date | null;
    } {
        return {
            state: this.state,
            failureCount: this.getFailureCount(),
            successCount: this.successCount,
            lastFailure: this.lastFailureTime > 0 ? new Date(this.lastFailureTime) : null,
        };
    }

    // --- Private methods ---

    private checkStateTransition(): void {
        const now = Date.now();

        if (this.state === CircuitState.OPEN) {
            // Check if reset timeout has passed
            if (now - this.openedAt >= this.config.resetTimeoutMs) {
                this.transitionTo(CircuitState.HALF_OPEN);
                this.successCount = 0;
            }
        }
    }

    private recordSuccess(): void {
        this.recordMetric('circuit_success', 1);

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.transitionTo(CircuitState.CLOSED);
                this.failures = [];
            }
        }
    }

    private recordFailure(error: Error): void {
        const now = Date.now();
        this.lastFailureTime = now;
        this.failures.push({ timestamp: now, error });
        this.recordMetric('circuit_failure', 1);

        this.pruneOldFailures();

        if (this.state === CircuitState.HALF_OPEN) {
            // Any failure in half-open immediately opens
            this.transitionTo(CircuitState.OPEN);
            this.openedAt = now;
        } else if (this.state === CircuitState.CLOSED) {
            if (this.failures.length >= this.config.failureThreshold) {
                this.transitionTo(CircuitState.OPEN);
                this.openedAt = now;
            }
        }
    }

    private pruneOldFailures(): void {
        const cutoff = Date.now() - this.config.failureWindowMs;
        this.failures = this.failures.filter(f => f.timestamp > cutoff);
    }

    private transitionTo(newState: CircuitState): void {
        if (this.state === newState) return;

        const oldState = this.state;
        this.state = newState;

        this.recordMetric('circuit_state_change', 1, { from: oldState, to: newState });
        this.config.onStateChange?.(oldState, newState);
    }

    private recordMetric(name: string, value: number, labels: Record<string, string> = {}): void {
        this.config.metrics?.counter(`${this.config.name}.${name}`, value, {
            circuit: this.config.name,
            ...labels,
        });
    }
}

/**
 * Create a circuit breaker with common defaults for LLM providers.
 */
export function createLLMCircuitBreaker(
    name: string,
    options?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
    return new CircuitBreaker({
        name,
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeoutMs: 30_000,
        failureWindowMs: 60_000,
        ...options,
    });
}
