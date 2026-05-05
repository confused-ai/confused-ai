import { CircuitOpenError } from '@confused-ai/contracts';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Failures that flip the circuit to OPEN. */
  threshold: number;
  /** Time in ms to remain OPEN before transitioning to HALF_OPEN. */
  timeout: number;
  /** Service name used in `CircuitOpenError`. */
  service: string;
  /**
   * Number of consecutive successes in HALF_OPEN state before returning to CLOSED.
   * Defaults to 1 (single successful probe closes the circuit).
   * Increase for high-reliability scenarios that require N consecutive successes.
   * @default 1
   */
  halfOpenSuccessThreshold?: number;
  /** Optional clock — useful for tests. */
  now?: () => number;
}

/**
 * Three-state circuit breaker:
 *
 *   CLOSED    ──[failures ≥ threshold]──────────────▶ OPEN
 *   OPEN      ──[timeout elapsed]──────────────────▶ HALF_OPEN  (probe calls)
 *   HALF_OPEN ──[successes ≥ halfOpenSuccessThreshold]─▶ CLOSED
 *   HALF_OPEN ──[failure]──────────────────────────▶ OPEN
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureAt = 0;
  private halfOpenSuccesses = 0;
  private readonly now: () => number;
  private readonly halfOpenSuccessThreshold: number;

  constructor(private readonly opts: CircuitBreakerOptions) {
    this.now = opts.now ?? Date.now;
    this.halfOpenSuccessThreshold = opts.halfOpenSuccessThreshold ?? 1;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = this.now() - this.lastFailureAt;
      if (elapsed < this.opts.timeout) {
        throw new CircuitOpenError(this.opts.service, this.opts.timeout - elapsed);
      }
      this.state = 'HALF_OPEN';
      this.halfOpenSuccesses = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
        this.failures = 0;
        this.halfOpenSuccesses = 0;
        this.state = 'CLOSED';
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureAt = this.now();
    this.halfOpenSuccesses = 0;
    if (this.state === 'HALF_OPEN' || this.failures >= this.opts.threshold) {
      this.state = 'OPEN';
    }
  }

  getState(): CircuitState { return this.state; }

  getMetrics(): { state: CircuitState; failures: number; lastFailureAt: number; halfOpenSuccesses: number } {
    return { state: this.state, failures: this.failures, lastFailureAt: this.lastFailureAt, halfOpenSuccesses: this.halfOpenSuccesses };
  }

  /** Test helper — force-reset to CLOSED. */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureAt = 0;
    this.halfOpenSuccesses = 0;
  }
}
