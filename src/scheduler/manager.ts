/**
 * ScheduleManager
 * ===============
 * Manages recurring schedules backed by a pluggable store.
 * Ships with InMemoryScheduleStore.
 *
 * Features:
 *   - CRUD (create, get, list, update, delete)
 *   - Enable / disable
 *   - In-process handler registry (register a fn, fire by key)
 *   - Schedule runner: poll-based execution loop
 *   - Run history via ScheduleRunStore
 *
 * Usage:
 *   const manager = new ScheduleManager();
 *
 *   manager.register('ping', async () => console.log('ping!'));
 *
 *   const id = await manager.create({
 *     name: 'ping every minute',
 *     cronExpr: '* * * * *',
 *     endpoint: 'ping',
 *     enabled: true,
 *   });
 *
 *   // Start polling:
 *   manager.start();      // checks every minute
 *   // …later…
 *   manager.stop();
 */

import type {
    Schedule,
    ScheduleRun,
    CreateScheduleInput,
    UpdateScheduleInput,
} from './types.js';
import { computeNextRun, validateCronExpr } from './cron.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortId(): string {
    return Math.random().toString(36).slice(2, 10);
}

function now(): string {
    return new Date().toISOString();
}

// ── Store Interfaces ──────────────────────────────────────────────────────────

export interface ScheduleStore {
    get(id: string): Promise<Schedule | null>;
    list(enabledOnly?: boolean): Promise<Schedule[]>;
    save(schedule: Schedule): Promise<Schedule>;
    delete(id: string): Promise<boolean>;
}

export interface ScheduleRunStore {
    add(run: ScheduleRun): Promise<ScheduleRun>;
    list(scheduleId: string, limit?: number): Promise<ScheduleRun[]>;
    update(runId: string, patch: Partial<ScheduleRun>): Promise<boolean>;
}

// ── In-Memory Implementations ─────────────────────────────────────────────────

export class InMemoryScheduleStore implements ScheduleStore {
    private data = new Map<string, Schedule>();

    async get(id: string): Promise<Schedule | null> {
        return this.data.get(id) ?? null;
    }

    async list(enabledOnly = false): Promise<Schedule[]> {
        const all = Array.from(this.data.values());
        return enabledOnly ? all.filter(s => s.enabled) : all;
    }

    async save(schedule: Schedule): Promise<Schedule> {
        this.data.set(schedule.id, schedule);
        return schedule;
    }

    async delete(id: string): Promise<boolean> {
        return this.data.delete(id);
    }
}

export class InMemoryScheduleRunStore implements ScheduleRunStore {
    private runs: ScheduleRun[] = [];

    async add(run: ScheduleRun): Promise<ScheduleRun> {
        this.runs.push(run);
        return run;
    }

    async list(scheduleId: string, limit = 100): Promise<ScheduleRun[]> {
        return this.runs
            .filter(r => r.scheduleId === scheduleId)
            .slice(-limit);
    }

    async update(runId: string, patch: Partial<ScheduleRun>): Promise<boolean> {
        const idx = this.runs.findIndex(r => r.id === runId);
        if (idx === -1) return false;
        this.runs[idx] = { ...this.runs[idx]!, ...patch };
        return true;
    }
}

// ── ScheduleManager Config ────────────────────────────────────────────────────

export interface ScheduleManagerConfig {
    store?: ScheduleStore;
    runStore?: ScheduleRunStore;
    /** Poll interval in milliseconds. Default: 60_000 (1 minute) */
    pollIntervalMs?: number;
    debug?: boolean;
}

// ── ScheduleManager ───────────────────────────────────────────────────────────

export class ScheduleManager {
    private readonly store: ScheduleStore;
    private readonly runStore: ScheduleRunStore;
    private readonly pollIntervalMs: number;
    private readonly debug: boolean;
    private readonly handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
    private _timer: ReturnType<typeof setInterval> | undefined;
    private _running = false;

    constructor(config: ScheduleManagerConfig = {}) {
        this.store        = config.store        ?? new InMemoryScheduleStore();
        this.runStore     = config.runStore     ?? new InMemoryScheduleRunStore();
        this.pollIntervalMs = config.pollIntervalMs ?? 60_000;
        this.debug        = config.debug        ?? false;
    }

    // ── Handler Registry ──────────────────────────────────────────────────────

    /**
     * Register an in-process handler function under a `key`.
     * The key is matched against `Schedule.endpoint`.
     */
    register(key: string, handler: (...args: unknown[]) => Promise<unknown>): void {
        this.handlers.set(key, handler);
    }

    unregister(key: string): void {
        this.handlers.delete(key);
    }

    // ── CRUD ──────────────────────────────────────────────────────────────────

    async create(input: CreateScheduleInput): Promise<string> {
        if (!validateCronExpr(input.cronExpr)) {
            throw new Error(`Invalid cron expression: "${input.cronExpr}"`);
        }
        const id = shortId();
        const nextRunAt = computeNextRun(input.cronExpr, input.timezone)?.toISOString();
        const schedule: Schedule = {
            ...input,
            id,
            nextRunAt,
            method:              input.method ?? 'POST',
            maxRetries:          input.maxRetries ?? 0,
            retryDelaySeconds:   input.retryDelaySeconds ?? 5,
            createdAt:           now(),
            updatedAt:           now(),
        };
        await this.store.save(schedule);
        this._debug('created', { id, name: schedule.name });
        return id;
    }

    async get(id: string): Promise<Schedule | null> {
        return this.store.get(id);
    }

    async list(enabledOnly = false): Promise<Schedule[]> {
        return this.store.list(enabledOnly);
    }

    async update(id: string, patch: UpdateScheduleInput): Promise<boolean> {
        const existing = await this.store.get(id);
        if (!existing) return false;

        if (patch.cronExpr && !validateCronExpr(patch.cronExpr)) {
            throw new Error(`Invalid cron expression: "${patch.cronExpr}"`);
        }

        const cronExpr = patch.cronExpr ?? existing.cronExpr;
        const timezone = patch.timezone ?? existing.timezone;
        const nextRunAt = computeNextRun(cronExpr, timezone)?.toISOString();

        const updated: Schedule = { ...existing, ...patch, nextRunAt, updatedAt: now() };
        await this.store.save(updated);
        return true;
    }

    async delete(id: string): Promise<boolean> {
        return this.store.delete(id);
    }

    async enable(id: string): Promise<boolean> {
        return this.update(id, { enabled: true });
    }

    async disable(id: string): Promise<boolean> {
        return this.update(id, { enabled: false });
    }

    // ── Run History ───────────────────────────────────────────────────────────

    async getRuns(scheduleId: string, limit = 100): Promise<ScheduleRun[]> {
        return this.runStore.list(scheduleId, limit);
    }

    // ── Execution ─────────────────────────────────────────────────────────────

    /**
     * Immediately trigger a schedule (bypasses cron timing).
     * Returns the ScheduleRun record.
     */
    async trigger(id: string, payload?: unknown): Promise<ScheduleRun> {
        const schedule = await this.store.get(id);
        if (!schedule) throw new Error(`Schedule not found: ${id}`);
        return this._execute(schedule, payload);
    }

    /**
     * Start the polling loop. Fires due schedules once per `pollIntervalMs`.
     * Idempotent — calling start() while already running is a no-op.
     */
    start(): void {
        if (this._running) return;
        this._running = true;
        this._timer = setInterval(() => {
            this._tick().catch(err =>
                console.error('[ScheduleManager] tick error', err)
            );
        }, this.pollIntervalMs);
        this._debug('started', { pollIntervalMs: this.pollIntervalMs });
    }

    /** Stop the polling loop. */
    stop(): void {
        if (this._timer !== undefined) {
            clearInterval(this._timer);
            this._timer = undefined;
        }
        this._running = false;
        this._debug('stopped');
    }

    get isRunning(): boolean {
        return this._running;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private async _tick(): Promise<void> {
        const nowIso = now();
        const schedules = await this.store.list(true /* enabled only */);
        const due = schedules.filter(s => s.nextRunAt != null && s.nextRunAt <= nowIso);

        await Promise.allSettled(due.map(s => this._executeAndAdvance(s)));
    }

    private async _executeAndAdvance(schedule: Schedule): Promise<void> {
        await this._execute(schedule);
        // Advance nextRunAt
        const nextRunAt = computeNextRun(schedule.cronExpr, schedule.timezone)?.toISOString();
        await this.store.save({ ...schedule, nextRunAt, updatedAt: now() });
    }

    private async _execute(schedule: Schedule, payloadOverride?: unknown): Promise<ScheduleRun> {
        const run: ScheduleRun = {
            id:          shortId(),
            scheduleId:  schedule.id,
            status:      'running',
            triggeredAt: now(),
            attempt:     1,
        };
        await this.runStore.add(run);

        const payload = payloadOverride ?? schedule.payload;

        try {
            const handler = this.handlers.get(schedule.endpoint);
            if (!handler) {
                throw new Error(`No handler registered for endpoint: "${schedule.endpoint}"`);
            }
            const output = await handler(payload);
            const completed: Partial<ScheduleRun> = {
                status:      'success',
                completedAt: now(),
                output,
            };
            await this.runStore.update(run.id, completed);
            this._debug('executed', { id: schedule.id, runId: run.id, status: 'success' });
            return { ...run, ...completed };
        } catch (err) {
            const failed: Partial<ScheduleRun> = {
                status:      'failed',
                completedAt: now(),
                error:       String(err),
            };
            await this.runStore.update(run.id, failed);
            this._debug('failed', { id: schedule.id, runId: run.id, error: String(err) });
            return { ...run, ...failed };
        }
    }

    private _debug(label: string, data?: unknown): void {
        if (this.debug) {
            console.debug(`[ScheduleManager] ${label}`, data ?? '');
        }
    }
}
