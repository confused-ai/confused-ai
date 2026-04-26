/**
 * Centralized debug logger for the agent framework
 *
 * Provides comprehensive debug logging across all components with
 * configurable debug mode support.
 */

import type { Logger, LogContext } from '../observability/types.js';

/**
 * Debug logger configuration
 */
export interface DebugLoggerConfig {
    /** Enable debug logging */
    enabled: boolean;
    /** Component name prefix */
    component: string;
    /** Parent logger for nested contexts */
    parent?: DebugLogger;
    /** Additional context to include in all logs */
    context?: Partial<LogContext>;
}

/**
 * Format metadata for output
 */
function formatMetadata(metadata?: Record<string, unknown>): string {
    if (!metadata || Object.keys(metadata).length === 0) return '';
    try {
        return JSON.stringify(metadata);
    } catch {
        return '[metadata serialization failed]';
    }
}

/**
 * Centralized debug logger that respects debug mode settings
 */
export class DebugLogger implements Logger {
    private config: DebugLoggerConfig;
    private prefix: string;

    constructor(config: DebugLoggerConfig) {
        this.config = config;
        this.prefix = `[${config.component}]`;
    }

    /**
     * Check if debug logging is enabled
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * Log a debug message (only if debug is enabled)
     */
    debug(message: string, _context?: Partial<LogContext>, metadata?: Record<string, unknown>): void {
        if (!this.config.enabled) return;
        console.debug(`${this.prefix} ${message}`, formatMetadata(metadata));
    }

    /**
     * Log an info message
     */
    info(message: string, _context?: Partial<LogContext>, metadata?: Record<string, unknown>): void {
        console.info(`${this.prefix} ${message}`, formatMetadata(metadata));
    }

    /**
     * Log a warning message
     */
    warn(message: string, _context?: Partial<LogContext>, metadata?: Record<string, unknown>): void {
        console.warn(`${this.prefix} ⚠️ ${message}`, formatMetadata(metadata));
    }

    /**
     * Log an error message
     */
    error(message: string, _context?: Partial<LogContext>, metadata?: Record<string, unknown>): void {
        console.error(`${this.prefix} ❌ ${message}`, formatMetadata(metadata));
    }

    /**
     * Log a fatal message
     */
    fatal(message: string, _context?: Partial<LogContext>, metadata?: Record<string, unknown>): void {
        console.error(`${this.prefix} 💀 [FATAL] ${message}`, formatMetadata(metadata));
    }

    /**
     * Create a child logger with additional context
     */
    child(additionalContext: Partial<LogContext>): DebugLogger {
        return new DebugLogger({
            enabled: this.config.enabled,
            component: this.config.component,
            parent: this,
            context: { ...this.config.context, ...additionalContext },
        });
    }

    /**
     * Log the start of an operation
     */
    logStart(operation: string, metadata?: Record<string, unknown>): void {
        if (!this.config.enabled) return;
        console.debug(`${this.prefix} ▶️ Starting: ${operation}`, formatMetadata(metadata));
    }

    /**
     * Log the completion of an operation
     */
    logComplete(operation: string, durationMs?: number, metadata?: Record<string, unknown>): void {
        if (!this.config.enabled) return;
        const duration = durationMs !== undefined ? ` (${durationMs}ms)` : '';
        console.debug(`${this.prefix} ✅ Completed: ${operation}${duration}`, formatMetadata(metadata));
    }

    /**
     * Log a step in a multi-step process
     */
    logStep(step: string, current: number, total: number, metadata?: Record<string, unknown>): void {
        if (!this.config.enabled) return;
        console.debug(`${this.prefix} 📍 Step ${current}/${total}: ${step}`, formatMetadata(metadata));
    }

    /**
     * Log state changes
     */
    logStateChange(entity: string, from: string, to: string, metadata?: Record<string, unknown>): void {
        if (!this.config.enabled) return;
        console.debug(`${this.prefix} 🔄 ${entity} state: ${from} → ${to}`, formatMetadata(metadata));
    }

    /**
     * Log data for debugging
     */
    logData(label: string, data: unknown): void {
        if (!this.config.enabled) return;
        const preview = typeof data === 'string' ? data : JSON.stringify(data);
        const truncated = preview.length > 200 ? preview.slice(0, 200) + '...' : preview;
        console.debug(`${this.prefix} 📊 ${label}: ${truncated}`);
    }
}

/**
 * Global debug configuration
 */
let globalDebugEnabled = false;

/**
 * Enable or disable global debug mode
 */
export function setGlobalDebug(enabled: boolean): void {
    globalDebugEnabled = enabled;
}

/**
 * Check if global debug mode is enabled
 */
export function isGlobalDebugEnabled(): boolean {
    return globalDebugEnabled;
}

/**
 * Create a debug logger for a component
 */
export function createDebugLogger(component: string, enabled?: boolean): DebugLogger {
    return new DebugLogger({
        enabled: enabled ?? globalDebugEnabled,
        component,
    });
}

/**
 * Create a no-op logger for when debugging is disabled
 */
export function createNoopLogger(): Logger {
    return {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
        fatal: () => { },
        child: () => createNoopLogger(),
    };
}
