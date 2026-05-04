 
import { ConfusedAIError, isConfusedAIError } from '@confused-ai/contracts';

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: boolean;
  /** Predicate decides whether to retry on a given error. Defaults to `e.retryable`. */
  retryOn?: (error: unknown) => boolean;
  /** Custom sleep — useful for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  multiplier: 2,
  jitter: true,
  retryOn: (e) => isConfusedAIError(e) && e.retryable,
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const defaultRetryOn = (error: unknown): boolean => isConfusedAIError(error) && error.retryable;

/**
 * Retry `fn` according to `policy`.
 *
 * Exponential back-off with full jitter is applied between attempts.
 * The call is **not** retried when `policy.retryOn` returns `false` (default:
 * only retries `ConfusedAIError`s with `retryable: true`).
 *
 * @param fn     - Async operation to retry.
 * @param policy - Partial override of {@link DEFAULT_RETRY_POLICY}.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: Partial<RetryPolicy> = {},
): Promise<T> {
  const p: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...policy };
  const sleep = p.sleep ?? defaultSleep;
  const retryOn = p.retryOn ?? defaultRetryOn;

  let lastError: unknown;
  for (let attempt = 1; attempt <= p.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!retryOn(e)) throw e;
      if (attempt === p.maxAttempts) break;
      const base = p.initialDelayMs * Math.pow(p.multiplier, attempt - 1);
      const capped = Math.min(base, p.maxDelayMs);
      const delay = p.jitter ? capped * (0.5 + Math.random() * 0.5) : capped;
      await sleep(delay);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ConfusedAIError({
        code: 'LLM_PROVIDER_ERROR',
        message: 'Retry exhausted with non-error throw',
        retryable: false,
        context: { thrown: String(lastError) },
      });
}
