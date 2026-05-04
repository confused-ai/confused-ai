import { CircuitOpenError } from '@confused-ai/contracts';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Failures that flip the circuit to OPEN. */
  threshold: number;
  /** Time in ms to remain OPEN before transitioning to HALF_OPEN. */
  timeout: number;
  /** Service name used in `CircuitOpenError`. */
  service: string;
  /** Optional clock — useful for tests. */
  now?: () => number;
}

/**
 * Three-state circuit breaker:
 *
 *   CLOSED  ──[failures ≥ threshold]──▶ OPEN
 *   OPEN    ──[timeout elapsed]──────▶ HALF_OPEN  (single probe call)
 *   HALF_OPEN ─[success]─▶ CLOSED
 *   HALF_OPEN ─[failure]─▶ OPEN
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureAt = 0;
  private readonly now: () => number;

  constructor(private readonly opts: CircuitBreakerOptions) {
    this.now = opts.now ?? Date.now;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = this.now() - this.lastFailureAt;
      if (elapsed < this.opts.timeout) {
        throw new CircuitOpenError(this.opts.service, this.opts.timeout - elapsed);
      }
      this.state = 'HALF_OPEN';
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
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureAt = this.now();
    if (this.state === 'HALF_OPEN' || this.failures >= this.opts.threshold) {
      this.state = 'OPEN';
    }
  }

  getState(): CircuitState { return this.state; }

  getMetrics(): { state: CircuitState; failures: number; lastFailureAt: number } {
    return { state: this.state, failures: this.failures, lastFailureAt: this.lastFailureAt };
  }

  /** Test helper — force-reset to CLOSED. */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureAt = 0;
  }
}
