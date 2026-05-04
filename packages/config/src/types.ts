/**
 * Configuration types for the agent framework
 */

export interface LLMConfig {
    /** Provider type: openai, openrouter, ollama */
    provider: 'openai' | 'openrouter' | 'ollama';
    /** API key (e.g. OPENAI_API_KEY) */
    apiKey: string;
    /** Model ID (e.g. gpt-4o, llama3.2) */
    model: string;
    /** Base URL for custom endpoints */
    baseUrl?: string;
}

export interface DatabaseConfig {
    /** Database type: sqlite, postgres, memory */
    type: 'sqlite' | 'postgres' | 'memory';
    /** SQLite file path */
    sqlitePath?: string;
    /** PostgreSQL host */
    host?: string;
    /** PostgreSQL port */
    port?: number;
    /** Database name */
    database?: string;
    /** Database user */
    user?: string;
    /** Database password */
    password?: string;
    /** Connection pool size (postgres only) */
    poolSize?: number;
}

export interface ServerConfig {
    /** Server port */
    port: number;
    /** CORS origins */
    corsOrigins: string[];
    /** Node environment */
    nodeEnv: 'development' | 'production' | 'test';
    /** Max request size */
    maxRequestSize: string;
}

export interface LoggingConfig {
    /** Log level */
    level: 'debug' | 'info' | 'warn' | 'error';
    /** Log requests/responses */
    logRequests: boolean;
    /** Enable metrics collection */
    enableMetrics: boolean;
    /** OTLP tracing endpoint */
    telemetryEndpoint?: string;
}

export interface ServerGuardrailsConfig {
    /** Enable guardrails */
    enabled: boolean;
    /** Rate limiting enabled */
    rateLimitingEnabled: boolean;
    /** Rate limit requests per window */
    rateLimitRequests: number;
    /** Rate limit window in milliseconds */
    rateLimitWindowMs: number;
    /** Max message length */
    maxMessageLength: number;
}

export interface ResilienceConfig {
    /** Circuit breaker enabled */
    circuitBreakerEnabled: boolean;
    /** Circuit breaker failure threshold */
    circuitBreakerFailureThreshold: number;
    /** Circuit breaker reset timeout */
    circuitBreakerResetTimeoutMs: number;
    /** Stream timeout */
    streamTimeoutMs: number;
    /** Max agent steps */
    maxAgentSteps: number;
}

export interface SessionConfig {
    /** Session timeout */
    timeoutMs: number;
    /** Session cleanup interval */
    cleanupIntervalMs: number;
}

/**
 * Complete application configuration
 */
export interface AppConfig {
    /** LLM configuration */
    llm: LLMConfig;
    /** Database configuration */
    database: DatabaseConfig;
    /** Server configuration */
    server: ServerConfig;
    /** Logging configuration */
    logging: LoggingConfig;
    /** Guardrails configuration */
    guardrails: ServerGuardrailsConfig;
    /** Resilience patterns configuration */
    resilience: ResilienceConfig;
    /** Session configuration */
    session: SessionConfig;
}

/**
 * Validation error details
 */
export interface ConfigValidationError {
    /** Field that failed validation */
    field: string;
    /** Error message */
    message: string;
    /** Current value */
    value?: string;
    /** Suggested fix */
    suggestion?: string;
}
