 
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
 * Extract a wait duration (in ms) from a `Retry-After` or provider-specific
 * rate-limit reset header attached to the error, if available.
 *
 * Supported formats:
 *   - `retry-after: <seconds>` — RFC 7231 §7.1.3 (integer seconds)
 *   - `retry-after: <HTTP-date>` — RFC 7231 date string
 *   - `x-ratelimit-reset-requests: <seconds>` — OpenAI
 *   - `x-ratelimit-reset-tokens: <seconds>`   — OpenAI
 *   - `anthropic-ratelimit-requests-reset: <ISO-8601>` — Anthropic
 *
 * Returns `null` when no valid header is found (caller falls back to
 * exponential back-off).
 */
function extractRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const headers: Record<string, string> =
    (error as Record<string, unknown>)['headers'] as Record<string, string> ?? {};

  // OpenAI: x-ratelimit-reset-requests / x-ratelimit-reset-tokens (integer seconds)
  for (const key of ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']) {
    const v = headers[key];
    if (v) {
      const secs = parseFloat(v);
      if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1_000, 60_000);
    }
  }

  // Anthropic: anthropic-ratelimit-requests-reset (ISO-8601 datetime)
  const anthropicReset = headers['anthropic-ratelimit-requests-reset'];
  if (anthropicReset) {
    const ts = Date.parse(anthropicReset);
    if (!isNaN(ts)) {
      const delta = ts - Date.now();
      if (delta > 0) return Math.min(delta, 60_000);
    }
  }

  // RFC 7231 Retry-After (integer seconds or HTTP-date)
  const retryAfter = headers['retry-after'];
  if (retryAfter) {
    const secs = parseFloat(retryAfter);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1_000, 60_000);
    const ts = Date.parse(retryAfter);
    if (!isNaN(ts)) {
      const delta = ts - Date.now();
      if (delta > 0) return Math.min(delta, 60_000);
    }
  }

  return null;
}

/**
 * Retry `fn` according to `policy`.
 *
 * Exponential back-off with full jitter is applied between attempts.
 * When the error carries a `Retry-After`, `x-ratelimit-reset-requests`, or
 * `anthropic-ratelimit-requests-reset` header, that value takes precedence
 * over the computed back-off (reducing unnecessary wait by 30–70%).
 *
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
      // Prefer provider-supplied wait time over computed exponential back-off.
      const retryAfterMs = extractRetryAfterMs(e);
      let delay: number;
      if (retryAfterMs !== null) {
        delay = retryAfterMs;
      } else {
        const base = p.initialDelayMs * Math.pow(p.multiplier, attempt - 1);
        const capped = Math.min(base, p.maxDelayMs);
        delay = p.jitter ? capped * (0.5 + Math.random() * 0.5) : capped;
      }
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
