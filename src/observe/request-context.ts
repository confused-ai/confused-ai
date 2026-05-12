/**
 * Async-local request context propagation (correlation IDs, tenant, user).
 * Built on Node's `AsyncLocalStorage` — no external deps.
 *
 * @module
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextValue {
  requestId: string;
  traceId?: string;
  tenantId?: string;
  userId?: string;
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<RequestContextValue>();

/**
 * AsyncLocalStorage-based request context. Call `RequestContext.run()` at the
 * entry point of each request (HTTP handler, queue consumer, etc.) to propagate
 * requestId, traceId, tenantId, and userId to all downstream calls without
 * threading them explicitly.
 */
export const RequestContext = {
  /** Run `fn` inside a new context. */
  run<T>(ctx: RequestContextValue, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContextValue | undefined {
    return storage.getStore();
  },
  getRequestId(): string | undefined {
    return storage.getStore()?.requestId;
  },
  getTraceId(): string | undefined {
    return storage.getStore()?.traceId;
  },
  getTenantId(): string | undefined {
    return storage.getStore()?.tenantId;
  },
};
