/**
 * Background Queue system for agent hooks.
 *
 * Allows long-running / blocking hook work to be dispatched to an external
 * queue backend (BullMQ, Kafka, RabbitMQ, Redis Pub/Sub, …) instead of
 * executing in the same event-loop tick.
 *
 * The framework owns the dispatch side (enqueue) only.
 * Workers that consume tasks are user-land — they pull from the same queue
 * using the adapter's `.worker()` / `.consume()` helpers.
 */

// ─── Task ────────────────────────────────────────────────────────────────────

/** Serialisable task envelope enqueued for background processing. */
export interface BackgroundTask<TPayload = unknown> {
    /** Unique task id — auto-generated when not supplied. */
    readonly id: string;
    /** Task type / name used to route to the right handler. */
    readonly type: string;
    /** Serialisable payload handed to the worker. */
    readonly payload: TPayload;
    /** Unix ms timestamp when the task was enqueued. */
    readonly enqueuedAt: number;
    /** Optional run metadata for traceability. */
    readonly meta?: {
        readonly agentId?: string;
        readonly runId?: string;
        readonly traceId?: string;
        readonly sessionId?: string;
    };
}

/** Options for a single enqueue call. */
export interface EnqueueOptions {
    /**
     * Delay before the task becomes available to workers (ms).
     * Not all backends support this — ignored when unsupported.
     */
    delay?: number;
    /**
     * Number of times to retry on failure (worker-side).
     * Not all backends support this — ignored when unsupported.
     */
    retries?: number;
    /** Arbitrary backend-specific options passed through as-is. */
    backendOptions?: Record<string, unknown>;
}

// ─── Worker / Handler ────────────────────────────────────────────────────────

/** Handler function that processes a background task in a worker. */
export type BackgroundTaskHandler<TPayload = unknown> = (
    task: BackgroundTask<TPayload>,
) => Promise<void> | void;

/** Options when registering a worker / consumer. */
export interface WorkerOptions {
    /** Number of tasks to process concurrently. Default: 1 */
    concurrency?: number;
    /** Arbitrary backend-specific options passed through as-is. */
    backendOptions?: Record<string, unknown>;
}

// ─── Queue interface ─────────────────────────────────────────────────────────

/**
 * The single interface every queue backend must implement.
 *
 * Implement this to connect any queue system — BullMQ, Kafka, RabbitMQ,
 * Redis Pub/Sub, SQS, Inngest, Trigger.dev, or your own.
 */
export interface BackgroundQueue {
    /** Human-readable name for logging / diagnostics. */
    readonly name: string;

    /**
     * Enqueue a task.  Must resolve once the task is safely persisted in the
     * backend (or in-memory for the default queue).
     */
    enqueue<TPayload = unknown>(
        task: Omit<BackgroundTask<TPayload>, 'id' | 'enqueuedAt'>,
        options?: EnqueueOptions,
    ): Promise<void>;

    /**
     * Register a handler for a given task type and start consuming.
     * Called in the worker process / server startup.
     *
     * @returns A function that stops the consumer when called.
     */
    consume<TPayload = unknown>(
        type: string,
        handler: BackgroundTaskHandler<TPayload>,
        options?: WorkerOptions,
    ): Promise<() => Promise<void>>;

    /**
     * Gracefully drain in-flight tasks and close connections.
     * Call during shutdown.
     */
    close(): Promise<void>;
}

// ─── Queue hook wrapper signature ────────────────────────────────────────────

/**
 * A hook that has been bound to a BackgroundQueue via `queueHook()`.
 * It returns `void` synchronously so it never blocks the agentic loop.
 */
export type QueuedHook<TArgs extends unknown[]> = (...args: TArgs) => void;
