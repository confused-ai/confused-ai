import { ToolTimeoutError, ExecutionTimeoutError } from '@confused-ai/contracts';

/**
 * Race a promise against a timeout, throwing `ToolTimeoutError` on expiry.
 * The underlying work is **not** cancelled — pass an `AbortSignal` to your
 * tool implementation if you need true cancellation.
 */
export async function runToolWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  toolName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new ToolTimeoutError(toolName, timeoutMs)); }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Wall-clock deadline guard for a multi-step run loop.
 *
 *   const deadline = createDeadline(30_000, 'agent.run');
 *   while (...) { deadline.assert(); ... }
 */
export interface Deadline {
  readonly deadlineMs: number;
  readonly scope: string;
  remainingMs(): number;
  expired(): boolean;
  assert(): void;
}

export function createDeadline(timeoutMs: number, scope: string, now: () => number = Date.now): Deadline {
  const start = now();
  const deadlineMs = start + timeoutMs;
  return {
    deadlineMs,
    scope,
    remainingMs: () => Math.max(0, deadlineMs - now()),
    expired: () => now() >= deadlineMs,
    assert: () => {
      if (now() >= deadlineMs) {
        throw new ExecutionTimeoutError(timeoutMs, scope);
      }
    },
  };
}
