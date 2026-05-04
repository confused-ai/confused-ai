import { describe, it, expect, vi, afterEach } from 'vitest';
import { setupGracefulShutdown, makeCleanup } from '../src/lifecycle.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeMockServer() {
  let closeCallback: ((err?: Error) => void) | undefined;
  return {
    close(cb?: (err?: Error) => void) {
      closeCallback = cb;
    },
    simulateClose() {
      closeCallback?.();
    },
  };
}

// ── makeCleanup ────────────────────────────────────────────────────────────

describe('makeCleanup', () => {
  it('calls the inner function and resolves', async () => {
    let called = false;
    const cleanup = makeCleanup('test', async () => { called = true; });
    await cleanup();
    expect(called).toBe(true);
  });

  it('does not throw when the inner function rejects', async () => {
    const cleanup = makeCleanup('failing', async () => { throw new Error('oops'); });
    await expect(cleanup()).resolves.toBeUndefined();
  });
});

// ── setupGracefulShutdown ──────────────────────────────────────────────────

describe('setupGracefulShutdown', () => {
  afterEach(() => {
    // Remove listeners added by the test so they don't leak across tests
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('registers SIGTERM and SIGINT handlers', () => {
    const server = makeMockServer();
    const before = {
      term: process.listenerCount('SIGTERM'),
      int: process.listenerCount('SIGINT'),
    };
    setupGracefulShutdown(server, [], 1000);
    expect(process.listenerCount('SIGTERM')).toBe(before.term + 1);
    expect(process.listenerCount('SIGINT')).toBe(before.int + 1);
  });

  it('calls server.close() when SIGTERM is emitted', async () => {
    const server = makeMockServer();
    const closeSpy = vi.spyOn(server, 'close');

    // Override process.exit to prevent test runner from dying
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    setupGracefulShutdown(server, [], 500);
    process.emit('SIGTERM');

    // server.close() should have been invoked
    expect(closeSpy).toHaveBeenCalledOnce();

    exitSpy.mockRestore();
  });

  it('runs cleanup hooks when server closes', async () => {
    const server = makeMockServer();
    let cleanupRan = false;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    setupGracefulShutdown(server, [async () => { cleanupRan = true; }], 500);
    process.emit('SIGTERM');

    // Simulate server finishing
    server.simulateClose();

    // Wait a tick for the Promise.allSettled chain to resolve
    await new Promise<void>((r) => setTimeout(r, 10));

    expect(cleanupRan).toBe(true);
    exitSpy.mockRestore();
  });

  it('is idempotent — second SIGTERM is ignored', () => {
    const server = makeMockServer();
    const closeSpy = vi.spyOn(server, 'close');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    setupGracefulShutdown(server, [], 500);
    process.emit('SIGTERM');
    // The handler was registered with `once`, so the second emit is a no-op
    process.emit('SIGTERM');

    expect(closeSpy).toHaveBeenCalledOnce();
    exitSpy.mockRestore();
  });
});
