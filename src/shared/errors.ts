/**
 * Production-grade structured errors for the agent framework.
 * Industry-standard error codes and context for observability and handling.
 */

/** Error codes for programmatic handling and metrics */
export const ErrorCode = {
    /** Agent run failed (generic) */
    AGENT_ERROR: 'AGENT_ERROR',
    /** LLM provider call failed */
    LLM_ERROR: 'LLM_ERROR',
    /** Tool execution failed */
    TOOL_ERROR: 'TOOL_ERROR',
    /** Tool validation (parameters) failed */
    TOOL_VALIDATION_ERROR: 'TOOL_VALIDATION_ERROR',
    /** Guardrail check failed */
    GUARDRAIL_VIOLATION: 'GUARDRAIL_VIOLATION',
    /** Run or step timed out */
    TIMEOUT: 'TIMEOUT',
    /** Run was cancelled (e.g. AbortSignal) */
    CANCELLED: 'CANCELLED',
    /** Invalid configuration or parameters */
    CONFIG_ERROR: 'CONFIG_ERROR',
    /** Session or persistence error */
    SESSION_ERROR: 'SESSION_ERROR',
    /** Permission denied for tool or resource */
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    /** Max steps reached without final answer */
    MAX_STEPS: 'MAX_STEPS',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Base agent error with code and context */
export class AgentError extends Error {
    readonly code: ErrorCodeType;
    readonly cause?: Error;
    readonly context?: Record<string, unknown>;

    constructor(
        message: string,
        options: {
            code?: ErrorCodeType;
            cause?: Error;
            context?: Record<string, unknown>;
        } = {}
    ) {
        super(message);
        this.name = 'AgentError';
        this.code = options.code ?? ErrorCode.AGENT_ERROR;
        this.cause = options.cause;
        this.context = options.context;
        Object.setPrototypeOf(this, AgentError.prototype);
    }

    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            context: this.context,
            cause: this.cause?.message,
        };
    }
}

/** LLM provider or API failure */
export class LLMError extends AgentError {
    constructor(
        message: string,
        options: { cause?: Error; context?: Record<string, unknown> } = {}
    ) {
        super(message, { ...options, code: ErrorCode.LLM_ERROR });
        this.name = 'LLMError';
        Object.setPrototypeOf(this, LLMError.prototype);
    }
}

/** Tool execution or validation failure (exception; for result errors see tools/types ToolError) */
export class ToolExecutionError extends AgentError {
    readonly toolName?: string;

    constructor(
        message: string,
        options: {
            cause?: Error;
            toolName?: string;
            context?: Record<string, unknown>;
            code?: ErrorCodeType;
        } = {}
    ) {
        super(message, {
            ...options,
            code: options.code ?? ErrorCode.TOOL_ERROR,
        });
        this.name = 'ToolExecutionError';
        this.toolName = options.toolName;
        Object.setPrototypeOf(this, ToolExecutionError.prototype);
    }
}

/** Guardrail check failed */
export class GuardrailError extends AgentError {
    readonly rule?: string;

    constructor(
        message: string,
        options: { rule?: string; context?: Record<string, unknown> } = {}
    ) {
        super(message, { ...options, code: ErrorCode.GUARDRAIL_VIOLATION });
        this.name = 'GuardrailError';
        this.rule = options.rule;
        Object.setPrototypeOf(this, GuardrailError.prototype);
    }
}

/** Run or step timeout */
export class TimeoutError extends AgentError {
    readonly timeoutMs?: number;

    constructor(
        message: string,
        options: { timeoutMs?: number; context?: Record<string, unknown> } = {}
    ) {
        super(message, { ...options, code: ErrorCode.TIMEOUT });
        this.name = 'TimeoutError';
        this.timeoutMs = options.timeoutMs;
        Object.setPrototypeOf(this, TimeoutError.prototype);
    }
}

/** Run cancelled (e.g. AbortController) */
export class CancellationError extends AgentError {
    constructor(message = 'Run was cancelled', options: { context?: Record<string, unknown> } = {}) {
        super(message, { ...options, code: ErrorCode.CANCELLED });
        this.name = 'CancellationError';
        Object.setPrototypeOf(this, CancellationError.prototype);
    }
}

/** Configuration or setup error */
export class ConfigError extends AgentError {
    constructor(
        message: string,
        options: { cause?: Error; context?: Record<string, unknown> } = {}
    ) {
        super(message, { ...options, code: ErrorCode.CONFIG_ERROR });
        this.name = 'ConfigError';
        Object.setPrototypeOf(this, ConfigError.prototype);
    }
}

/** Session store or persistence error */
export class SessionError extends AgentError {
    constructor(
        message: string,
        options: { cause?: Error; context?: Record<string, unknown> } = {}
    ) {
        super(message, { ...options, code: ErrorCode.SESSION_ERROR });
        this.name = 'SessionError';
        Object.setPrototypeOf(this, SessionError.prototype);
    }
}

/** Permission denied for tool or resource */
export class PermissionError extends AgentError {
    constructor(
        message: string,
        options: { context?: Record<string, unknown> } = {}
    ) {
        super(message, { ...options, code: ErrorCode.PERMISSION_DENIED });
        this.name = 'PermissionError';
        Object.setPrototypeOf(this, PermissionError.prototype);
    }
}
