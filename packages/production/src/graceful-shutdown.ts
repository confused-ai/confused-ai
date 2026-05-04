/**
 * Graceful shutdown: drain inflight work and run cleanup hooks
 *
 * Handles process termination signals gracefully:
 * - SIGTERM/SIGINT signal handling
 * - In-flight request draining
 * - Resource cleanup callbacks
 * - Configurable shutdown timeout
 */

import type { Logger } from './_types.js';

/** Shutdown handler configuration */
export interface GracefulShutdownConfig {
    /** Timeout for shutdown in ms (default: 30000) */
    readonly timeoutMs?: number;
    /** Signals to handle (default: ['SIGTERM', 'SIGINT']) */
    readonly signals?: NodeJS.Signals[];
    /** Optional logger */
    readonly logger?: Logger;
    /** Force exit after timeout (default: true) */
    readonly forceExitOnTimeout?: boolean;
}

/** Cleanup handler function */
export type CleanupHandler = () => Promise<void> | void;

/** Shutdown event */
export interface ShutdownEvent {
    readonly signal?: NodeJS.Signals;
    readonly reason?: string;
    readonly timestamp: Date;
}

/**
 * Graceful Shutdown Manager - handles process termination cleanly.
 *
 * @example
 * const shutdown = new GracefulShutdown({ timeoutMs: 30000 });
 *
 * // Register cleanup handlers
 * shutdown.addHandler('database', async () => {
 *   await db.close();
 * });
 *
 * shutdown.addHandler('http-server', async () => {
 *   await server.close();
 * });
 *
 * // Start listening for signals
 * shutdown.listen();
 */
export class GracefulShutdown {
    private readonly config: Required<Omit<GracefulShutdownConfig, 'logger'>> &
        Pick<GracefulShutdownConfig, 'logger'>;
    private readonly handlers = new Map<string, CleanupHandler>();
    private isShuttingDown = false;
    private shutdownPromise: Promise<void> | null = null;

    constructor(config: GracefulShutdownConfig = {}) {
        this.config = {
            timeoutMs: config.timeoutMs ?? 30_000,
            signals: config.signals ?? ['SIGTERM', 'SIGINT'],
            logger: config.logger,
            forceExitOnTimeout: config.forceExitOnTimeout ?? true,
        };
    }

    /** Check if shutdown is in progress */
    isInProgress(): boolean {
        return this.isShuttingDown;
    }

    /** Add a cleanup handler */
    addHandler(name: string, handler: CleanupHandler): void {
        if (this.handlers.has(name)) {
            this.log('warn', `Replacing existing handler: ${name}`);
        }
        this.handlers.set(name, handler);
    }

    /** Remove a cleanup handler */
    removeHandler(name: string): boolean {
        return this.handlers.delete(name);
    }

    /** Get registered handler names */
    getHandlerNames(): string[] {
        return Array.from(this.handlers.keys());
    }

    /**
     * Start listening for shutdown signals.
     * Only call this once.
     */
    listen(): void {
        for (const signal of this.config.signals) {
            process.on(signal, () => {
                this.log('info', `Received ${signal}, initiating graceful shutdown...`);
                this.shutdown({ signal, timestamp: new Date() });
            });
        }

        this.log('debug', `Listening for signals: ${this.config.signals.join(', ')}`);
    }

    /**
     * Programmatically trigger shutdown.
     * Safe to call multiple times - subsequent calls return the same promise.
     */
    async shutdown(event?: Partial<ShutdownEvent>): Promise<void> {
        if (this.shutdownPromise) {
            return this.shutdownPromise;
        }

        this.isShuttingDown = true;
        const shutdownEvent: ShutdownEvent = {
            signal: event?.signal,
            reason: event?.reason,
            timestamp: event?.timestamp ?? new Date(),
        };

        this.shutdownPromise = this.executeShutdown(shutdownEvent);
        return this.shutdownPromise;
    }

    /**
     * Wait for shutdown to complete (for tests or manual control).
     */
    async waitForShutdown(): Promise<void> {
        if (this.shutdownPromise) {
            await this.shutdownPromise;
        }
    }

    // --- Private methods ---

    private async executeShutdown(event: ShutdownEvent): Promise<void> {
        this.log('info', 'Starting graceful shutdown...');

        const timeout = this.createTimeout();

        try {
            await Promise.race([
                this.runHandlers(),
                timeout.promise,
            ]);

            this.log('info', 'Graceful shutdown completed');
        } catch (error) {
            this.log('error', `Shutdown error: ${error instanceof Error ? error.message : error}`);
        } finally {
            timeout.clear();

            if (this.config.forceExitOnTimeout) {
                // Give a moment for logs to flush
                setTimeout(() => {
                    process.exit(event.signal === 'SIGTERM' ? 0 : 1);
                }, 100);
            }
        }
    }

    private async runHandlers(): Promise<void> {
        const handlerEntries = Array.from(this.handlers.entries());
        const results: { name: string; success: boolean; error?: Error }[] = [];

        // Run handlers in parallel
        await Promise.all(
            handlerEntries.map(async ([name, handler]) => {
                const startTime = Date.now();
                try {
                    await handler();
                    this.log('debug', `Handler '${name}' completed in ${Date.now() - startTime}ms`);
                    results.push({ name, success: true });
                } catch (error) {
                    this.log('error', `Handler '${name}' failed: ${error instanceof Error ? error.message : error}`);
                    results.push({ name, success: false, error: error as Error });
                }
            })
        );

        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            this.log('warn', `${failed.length}/${results.length} handlers failed during shutdown`);
        }
    }

    private createTimeout(): { promise: Promise<never>; clear: () => void } {
        let timeoutId: NodeJS.Timeout;

        const promise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                this.log('warn', `Shutdown timeout (${this.config.timeoutMs}ms) reached, forcing exit`);
                reject(new Error('Shutdown timeout'));
            }, this.config.timeoutMs);
        });

        return {
            promise,
            clear: () => clearTimeout(timeoutId),
        };
    }

    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
        if (this.config.logger) {
            this.config.logger[level](message);
        } else {
            const prefix = `[GracefulShutdown] [${level.toUpperCase()}]`;
            if (level === 'error') {
                console.error(prefix, message);
            } else if (level === 'warn') {
                console.warn(prefix, message);
            } else {
                console.log(prefix, message);
            }
        }
    }
}

/**
 * Create a simple shutdown manager with common defaults.
 */
export function createGracefulShutdown(
    handlers?: Record<string, CleanupHandler>,
    config?: GracefulShutdownConfig
): GracefulShutdown {
    const shutdown = new GracefulShutdown(config);

    if (handlers) {
        for (const [name, handler] of Object.entries(handlers)) {
            shutdown.addHandler(name, handler);
        }
    }

    return shutdown;
}

/**
 * Wrap an async operation with shutdown awareness.
 * Will reject if shutdown is in progress.
 */
export function withShutdownGuard<T>(
    shutdown: GracefulShutdown,
    fn: () => Promise<T>
): Promise<T> {
    if (shutdown.isInProgress()) {
        return Promise.reject(new Error('Operation rejected: shutdown in progress'));
    }
    return fn();
}
