// Single circuit-breaker implementation lives in ./production/circuit-breaker;
// re-exported here so the ./guard surface keeps CircuitBreaker without a duplicate impl.
export { CircuitBreaker, CircuitOpenError, CircuitState } from '../production/circuit-breaker.js';
export type { CircuitBreakerConfig, CircuitBreakerResult } from '../production/circuit-breaker.js';
export * from './retry.js';
export * from './timeout.js';
