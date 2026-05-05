/**
 * Typed Agent Event Bus
 * =====================
 * A strongly-typed publish/subscribe event bus designed for multi-agent systems.
 *
 * Key differences from `MessageBusImpl`:
 *   - Static compile-time typing via TypeScript generics (no `unknown` payloads)
 *   - Wildcard subscriptions via `'*'`
 *   - `waitFor(event, timeoutMs?)` — async, Promise-based one-shot listener
 *   - Optional replay buffer so late subscribers catch up on recent events
 *   - Per-event and per-handler latency metrics
 *   - Zero external dependencies
 *
 * Usage:
 *   import { createAgentEventBus } from '@confused-ai/orchestration';
 *
 *   type MyEvents = {
 *     'task:assigned': { taskId: string; agentId: string };
 *     'task:done':     { taskId: string; result: string };
 *     'error':         { agentId: string; message: string };
 *   };
 *
 *   const bus = createAgentEventBus<MyEvents>({ replayBufferSize: 20 });
 *
 *   bus.on('task:done', ({ taskId, result }) => console.log(taskId, result));
 *   const unsub = bus.on('*',             (event, payload) => logAll(event, payload));
 *
 *   await bus.emit('task:assigned', { taskId: 't1', agentId: 'agent-1' });
 *
 *   // Wait for next task:done (with 10 s timeout)
 *   const done = await bus.waitFor('task:done', 10_000);
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Constraint: all event payload types must be objects (not primitives). */
export type EventMap = Record<string, object>;

export type EventHandler<Payload extends object> =
    (payload: Payload) => void | Promise<void>;

export type WildcardHandler<Events extends EventMap> =
    (event: keyof Events & string, payload: Events[keyof Events]) => void | Promise<void>;

export interface EventSubscription {
    /** Remove this subscription */
    unsubscribe(): void;
}

export interface AgentEventBusMetrics {
    /** Total events emitted per event name */
    emitted: Record<string, number>;
    /** Total handler errors per event name */
    errors: Record<string, number>;
    /** Cumulative handler latency (ms) per event name */
    latencyMs: Record<string, number>;
}

export interface AgentEventBusOptions {
    /**
     * Number of recent events to buffer for late subscribers.
     * Subscribers that join after events were emitted receive buffered events on `.on()`.
     * Default: 0 (no replay).
     */
    replayBufferSize?: number;
    /**
     * Called when a handler throws. Default: `console.error`.
     */
    onHandlerError?: (event: string, err: unknown) => void;
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface AgentEventBus<Events extends EventMap> {
    /**
     * Subscribe to a specific event.
     * If a replay buffer is configured, the handler is immediately called
     * with all buffered events of that type.
     */
    on<E extends keyof Events & string>(
        event: E,
        handler: EventHandler<Events[E]>,
    ): EventSubscription;

    /**
     * Subscribe to ALL events ('*' wildcard).
     * The handler receives the event name and payload.
     */
    on(event: '*', handler: WildcardHandler<Events>): EventSubscription;

    /** Subscribe to an event for exactly one invocation, then auto-unsubscribe. */
    once<E extends keyof Events & string>(
        event: E,
        handler: EventHandler<Events[E]>,
    ): EventSubscription;

    /** Emit an event, calling all registered handlers asynchronously. */
    emit<E extends keyof Events & string>(event: E, payload: Events[E]): Promise<void>;

    /**
     * Wait for the next occurrence of `event` (returns a Promise).
     * Rejects with a timeout error if `timeoutMs` elapses before the event fires.
     */
    waitFor<E extends keyof Events & string>(event: E, timeoutMs?: number): Promise<Events[E]>;

    /** Remove all handlers for a specific event (or all events if omitted). */
    off(event?: keyof Events & string | '*'): void;

    /** Snapshot of runtime metrics. */
    metrics(): AgentEventBusMetrics;

    /** Clear the replay buffer. */
    clearBuffer(): void;
}

// ── Implementation ────────────────────────────────────────────────────────────

type HandlerEntry<Events extends EventMap> =
    | { type: 'specific'; event: keyof Events & string; handler: EventHandler<Events[keyof Events]>; once: boolean }
    | { type: 'wildcard'; handler: WildcardHandler<Events>; once: boolean };

interface ReplayEntry<Events extends EventMap> {
    event: keyof Events & string;
    payload: Events[keyof Events];
}

class AgentEventBusImpl<Events extends EventMap> implements AgentEventBus<Events> {
    private readonly _handlers = new Map<string | '*', Set<HandlerEntry<Events>>>();
    private readonly _replayBuffer: ReplayEntry<Events>[] = [];
    private readonly _replaySize: number;
    private readonly _onError: (event: string, err: unknown) => void;
    private readonly _metrics: AgentEventBusMetrics = { emitted: {}, errors: {}, latencyMs: {} };

    constructor(options: AgentEventBusOptions = {}) {
        this._replaySize = options.replayBufferSize ?? 0;
        this._onError    = options.onHandlerError   ?? ((e, err) => console.error(`[AgentEventBus] handler error for "${e}":`, err));
    }

    on<E extends keyof Events & string>(
        event: E | '*',
        handler: EventHandler<Events[E]> | WildcardHandler<Events>,
    ): EventSubscription {
        const key = event as string;
        if (!this._handlers.has(key)) this._handlers.set(key, new Set());

        const entry: HandlerEntry<Events> = event === '*'
            ? { type: 'wildcard',  handler: handler as WildcardHandler<Events>, once: false }
            : { type: 'specific',  event: key, handler: handler as EventHandler<Events[keyof Events]>, once: false };

        this._handlers.get(key)!.add(entry);

        // Replay buffered events for this specific event
        if (event !== '*' && this._replaySize > 0) {
            for (const item of this._replayBuffer) {
                if (item.event === event) {
                    void this._callSpecific(entry as Extract<HandlerEntry<Events>, { type: 'specific' }>, item.payload, item.event);
                }
            }
        }

        return {
            unsubscribe: () => {
                this._handlers.get(key)?.delete(entry);
            },
        };
    }

    once<E extends keyof Events & string>(
        event: E,
        handler: EventHandler<Events[E]>,
    ): EventSubscription {
        const key = event as string;
        if (!this._handlers.has(key)) this._handlers.set(key, new Set());

        const entry: HandlerEntry<Events> = {
            type: 'specific',
            event: key,
            handler: handler as EventHandler<Events[keyof Events]>,
            once: true,
        };
        this._handlers.get(key)!.add(entry);

        return { unsubscribe: () => { this._handlers.get(key)?.delete(entry); } };
    }

    async emit<E extends keyof Events & string>(event: E, payload: Events[E]): Promise<void> {
        const t0 = Date.now();
        this._metrics.emitted[event] = (this._metrics.emitted[event] ?? 0) + 1;

        // Update replay buffer
        if (this._replaySize > 0) {
            this._replayBuffer.push({ event, payload: payload as Events[keyof Events] });
            if (this._replayBuffer.length > this._replaySize) this._replayBuffer.shift();
        }

        // Dispatch to specific handlers
        const specific = this._handlers.get(event);
        if (specific) {
            const toRemove: HandlerEntry<Events>[] = [];
            for (const entry of specific) {
                if (entry.type !== 'specific') continue;
                await this._callSpecific(entry, payload as Events[keyof Events], event);
                if (entry.once) toRemove.push(entry);
            }
            for (const e of toRemove) specific.delete(e);
        }

        // Dispatch to wildcard handlers
        const wildcards = this._handlers.get('*');
        if (wildcards) {
            const toRemove: HandlerEntry<Events>[] = [];
            for (const entry of wildcards) {
                if (entry.type !== 'wildcard') continue;
                try {
                    await entry.handler(event, payload as Events[keyof Events]);
                } catch (err) {
                    this._metrics.errors[event] = (this._metrics.errors[event] ?? 0) + 1;
                    this._onError(event, err);
                }
                if (entry.once) toRemove.push(entry);
            }
            for (const e of toRemove) wildcards.delete(e);
        }

        this._metrics.latencyMs[event] = (this._metrics.latencyMs[event] ?? 0) + (Date.now() - t0);
    }

    waitFor<E extends keyof Events & string>(event: E, timeoutMs = 30_000): Promise<Events[E]> {
        return new Promise<Events[E]>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> | null = null;
            const sub = this.once(event, (payload) => {
                if (timer !== null) clearTimeout(timer);
                resolve(payload);
            });
            timer = setTimeout(() => {
                sub.unsubscribe();
                reject(new AgentEventBusTimeoutError(event, timeoutMs));
            }, timeoutMs);
        });
    }

    off(event?: (keyof Events & string) | '*'): void {
        if (event === undefined) {
            this._handlers.clear();
        } else {
            this._handlers.delete(event);
        }
    }

    metrics(): AgentEventBusMetrics {
        return {
            emitted:   { ...this._metrics.emitted },
            errors:    { ...this._metrics.errors },
            latencyMs: { ...this._metrics.latencyMs },
        };
    }

    clearBuffer(): void {
        this._replayBuffer.length = 0;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private async _callSpecific(
        entry: Extract<HandlerEntry<Events>, { type: 'specific' }>,
        payload: Events[keyof Events],
        event: string,
    ): Promise<void> {
        try {
            await (entry.handler as (p: Events[keyof Events]) => void | Promise<void>)(payload);
        } catch (err) {
            this._metrics.errors[event] = (this._metrics.errors[event] ?? 0) + 1;
            this._onError(event, err);
        }
    }
}

// ── Public error ──────────────────────────────────────────────────────────────

export class AgentEventBusTimeoutError extends Error {
    readonly event: string;
    readonly timeoutMs: number;

    constructor(event: string, timeoutMs: number) {
        super(`Timed out waiting for event "${event}" after ${timeoutMs}ms`);
        this.name    = 'AgentEventBusTimeoutError';
        this.event   = event;
        this.timeoutMs = timeoutMs;
    }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a typed agent event bus.
 *
 * @example
 * ```ts
 * type Events = {
 *   'step:start': { stepId: string };
 *   'step:end':   { stepId: string; durationMs: number };
 * };
 * const bus = createAgentEventBus<Events>({ replayBufferSize: 50 });
 * ```
 */
export function createAgentEventBus<Events extends EventMap>(
    options: AgentEventBusOptions = {},
): AgentEventBus<Events> {
    return new AgentEventBusImpl<Events>(options);
}
