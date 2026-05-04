/**
 * Health checks and readiness for orchestrators and load balancers
 *
 * Kubernetes-compatible health check system with:
 * - Liveness probe (is the process alive)
 * - Readiness probe (can accept traffic)
 * - Dependency health checks (LLM, database, etc.)
 * - Aggregated health status
 */

import type { LLMProvider } from '@confused-ai/core';
import type { SessionStore } from '@confused-ai/session';

/** Health check status */
export enum HealthStatus {
    /** Everything is working */
    HEALTHY = 'HEALTHY',
    /** Some components degraded but still functional */
    DEGRADED = 'DEGRADED',
    /** Critical failure, not accepting traffic */
    UNHEALTHY = 'UNHEALTHY',
    /** Status unknown (check not yet run) */
    UNKNOWN = 'UNKNOWN',
}

/** Individual component health result */
export interface ComponentHealth {
    readonly name: string;
    readonly status: HealthStatus;
    readonly message?: string;
    readonly latencyMs?: number;
    readonly lastCheckedAt: Date;
    readonly metadata?: Record<string, unknown>;
}

/** Aggregated health check result */
export interface HealthCheckResult {
    readonly status: HealthStatus;
    readonly uptime: number;
    readonly version?: string;
    readonly components: ComponentHealth[];
    readonly timestamp: Date;
}

/** Health check configuration */
export interface HealthCheckConfig {
    /** Application version (optional, for display) */
    readonly version?: string;
    /** Timeout for individual checks in ms (default: 5000) */
    readonly checkTimeoutMs?: number;
    /** Components to check */
    readonly components?: HealthComponent[];
}

/** A component that can be health-checked */
export interface HealthComponent {
    readonly name: string;
    check(): Promise<Omit<ComponentHealth, 'name' | 'lastCheckedAt'>>;
}

/**
 * Health Check Manager - aggregates component health checks.
 *
 * @example
 * const health = new HealthCheckManager({
 *   version: '1.0.0',
 *   components: [
 *     createLLMHealthCheck(llmProvider),
 *     createSessionStoreHealthCheck(sessionStore),
 *   ],
 * });
 *
 * // Use in HTTP endpoint
 * app.get('/health', async (req, res) => {
 *   const result = await health.check();
 *   res.status(result.status === 'HEALTHY' ? 200 : 503).json(result);
 * });
 */
export class HealthCheckManager {
    private readonly config: Required<Omit<HealthCheckConfig, 'version'>> &
        Pick<HealthCheckConfig, 'version'>;
    private readonly startTime = Date.now();
    private lastResult: HealthCheckResult | null = null;

    constructor(config: HealthCheckConfig = {}) {
        this.config = {
            version: config.version,
            checkTimeoutMs: config.checkTimeoutMs ?? 5_000,
            components: config.components ?? [],
        };
    }

    /** Add a health component */
    addComponent(component: HealthComponent): void {
        this.config.components.push(component);
    }

    /** Remove a health component by name */
    removeComponent(name: string): void {
        const index = this.config.components.findIndex(c => c.name === name);
        if (index !== -1) {
            this.config.components.splice(index, 1);
        }
    }

    /** Get uptime in seconds */
    getUptime(): number {
        return Math.floor((Date.now() - this.startTime) / 1000);
    }

    /** Get last health check result (if any) */
    getLastResult(): HealthCheckResult | null {
        return this.lastResult;
    }

    /**
     * Liveness probe - is the process alive?
     * Returns immediately, no component checks.
     */
    liveness(): { status: HealthStatus; uptime: number } {
        return {
            status: HealthStatus.HEALTHY,
            uptime: this.getUptime(),
        };
    }

    /**
     * Readiness probe - can the service accept traffic?
     * Checks all components and returns aggregated status.
     */
    async readiness(): Promise<HealthCheckResult> {
        return this.check();
    }

    /**
     * Full health check - check all components.
     */
    async check(): Promise<HealthCheckResult> {
        const timestamp = new Date();
        const components: ComponentHealth[] = [];

        for (const component of this.config.components) {
            const startTime = Date.now();
            try {
                const result = await Promise.race([
                    component.check(),
                    this.timeout(this.config.checkTimeoutMs),
                ]);

                if (result === 'TIMEOUT') {
                    components.push({
                        name: component.name,
                        status: HealthStatus.UNHEALTHY,
                        message: 'Health check timed out',
                        latencyMs: this.config.checkTimeoutMs,
                        lastCheckedAt: new Date(),
                    });
                } else {
                    components.push({
                        ...result,
                        name: component.name,
                        latencyMs: Date.now() - startTime,
                        lastCheckedAt: new Date(),
                    });
                }
            } catch (error) {
                components.push({
                    name: component.name,
                    status: HealthStatus.UNHEALTHY,
                    message: error instanceof Error ? error.message : String(error),
                    latencyMs: Date.now() - startTime,
                    lastCheckedAt: new Date(),
                });
            }
        }

        // Aggregate status
        const status = this.aggregateStatus(components);

        this.lastResult = {
            status,
            uptime: this.getUptime(),
            version: this.config.version,
            components,
            timestamp,
        };

        return this.lastResult;
    }

    private aggregateStatus(components: ComponentHealth[]): HealthStatus {
        if (components.length === 0) {
            return HealthStatus.HEALTHY;
        }

        const hasUnhealthy = components.some(c => c.status === HealthStatus.UNHEALTHY);
        const hasDegraded = components.some(c => c.status === HealthStatus.DEGRADED);

        if (hasUnhealthy) return HealthStatus.UNHEALTHY;
        if (hasDegraded) return HealthStatus.DEGRADED;
        return HealthStatus.HEALTHY;
    }

    private timeout(ms: number): Promise<'TIMEOUT'> {
        return new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), ms));
    }
}

// --- Built-in Health Components ---

/**
 * Create a health check for an LLM provider.
 * Performs a minimal completion to verify connectivity.
 */
export function createLLMHealthCheck(
    llm: LLMProvider,
    name = 'llm'
): HealthComponent {
    return {
        name,
        async check() {
            try {
                // Minimal test call
                await llm.generateText([
                    { role: 'user', content: 'test' },
                ], { maxTokens: 1 });

                return { status: HealthStatus.HEALTHY };
            } catch (error) {
                return {
                    status: HealthStatus.UNHEALTHY,
                    message: error instanceof Error ? error.message : 'LLM check failed',
                };
            }
        },
    };
}

/**
 * Create a health check for a session store.
 * Performs a read operation to verify connectivity.
 */
export function createSessionStoreHealthCheck(
    store: SessionStore,
    name = 'session-store'
): HealthComponent {
    return {
        name,
        async check() {
            try {
                // Try to get a non-existent session (should return null, not error)
                await store.get('__health_check_probe__');
                return { status: HealthStatus.HEALTHY };
            } catch (error) {
                return {
                    status: HealthStatus.UNHEALTHY,
                    message: error instanceof Error ? error.message : 'Session store check failed',
                };
            }
        },
    };
}

/**
 * Create a custom health check from an async function.
 */
export function createCustomHealthCheck(
    name: string,
    checkFn: () => Promise<boolean | { status: HealthStatus; message?: string }>
): HealthComponent {
    return {
        name,
        async check() {
            try {
                const result = await checkFn();
                if (typeof result === 'boolean') {
                    return {
                        status: result ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
                    };
                }
                return result;
            } catch (error) {
                return {
                    status: HealthStatus.UNHEALTHY,
                    message: error instanceof Error ? error.message : 'Check failed',
                };
            }
        },
    };
}

/**
 * Create an HTTP health check for external dependencies.
 */
export function createHttpHealthCheck(
    name: string,
    url: string,
    options?: { method?: string; expectedStatus?: number; timeoutMs?: number }
): HealthComponent {
    const { method = 'GET', expectedStatus = 200, timeoutMs = 5000 } = options ?? {};

    return {
        name,
        async check() {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), timeoutMs);

                const response = await fetch(url, {
                    method,
                    signal: controller.signal,
                });

                clearTimeout(timeout);

                if (response.status === expectedStatus) {
                    return { status: HealthStatus.HEALTHY };
                }

                return {
                    status: HealthStatus.DEGRADED,
                    message: `Unexpected status: ${response.status}`,
                    metadata: { statusCode: response.status },
                };
            } catch (error) {
                return {
                    status: HealthStatus.UNHEALTHY,
                    message: error instanceof Error ? error.message : 'HTTP check failed',
                };
            }
        },
    };
}
