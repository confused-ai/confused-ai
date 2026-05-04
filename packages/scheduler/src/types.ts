/**
 * Scheduler — Types
 * =================
 *
 * Schedule    — a recurring job definition
 * ScheduleRun — a single execution record
 */

// ── Schedule ──────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ScheduleStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface Schedule {
    /** Unique identifier */
    readonly id: string;
    /** Human-readable label */
    name: string;
    /**
     * Standard 5-field cron expression (min hour dom mon dow).
     * e.g. "* /5 * * * *" (every 5 minutes)
     */
    cronExpr: string;
    /**
     * Handler key or URL endpoint to invoke when the schedule fires.
     * In-process schedules use a registered handler key.
     * HTTP schedules use a URL.
     */
    endpoint: string;
    /** HTTP method (only relevant for HTTP-target schedules) */
    method?: HttpMethod;
    /** Optional payload sent with each invocation */
    payload?: unknown;
    /** IANA timezone name, e.g. "America/New_York". Default: UTC */
    timezone?: string;
    enabled: boolean;
    /** ISO timestamp of next planned execution */
    nextRunAt?: string;
    maxRetries?: number;
    retryDelaySeconds?: number;
    readonly createdAt: string;
    updatedAt: string;
}

// ── ScheduleRun ───────────────────────────────────────────────────────────────

export interface ScheduleRun {
    readonly id: string;
    readonly scheduleId: string;
    status: ScheduleStatus;
    triggeredAt: string;
    completedAt?: string;
    error?: string;
    /** Raw output from the handler */
    output?: unknown;
    attempt: number;
}

// ── Create / Update payloads ──────────────────────────────────────────────────

export type CreateScheduleInput = Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'nextRunAt'>;

export type UpdateScheduleInput = Partial<Omit<Schedule, 'id' | 'createdAt'>>;
