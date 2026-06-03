/**
 * Base interface adapter — abstract class all surface adapters extend.
 *
 * An interface is an adapter between a messaging surface (Slack, Telegram, etc.)
 * and the agent's run/session model.  The agent code stays unchanged; only the
 * interface layer changes per surface.
 */

import type { CreateAgentResult } from '../create-agent.js';
import type http from 'node:http';

export interface InterfaceRunResult {
    text: string;
    sessionId: string;
    runId: string;
}

export interface BaseInterfaceOptions {
    /** The agent this interface dispatches messages to. */
    agent: CreateAgentResult;
    /**
     * Optional function to resolve a surface-specific user ID to a stable
     * application user ID.  When omitted the surface ID is used directly.
     */
    resolveUserId?: (surfaceUserId: string) => Promise<string> | string;
}

/**
 * Abstract base every interface must implement.
 *
 * ```ts
 * class MyInterface extends BaseInterface {
 *   setup(app: http.Server) { ... }
 *   async dispatch(message: string, userId: string, sessionId?: string) { ... }
 * }
 * ```
 */
export abstract class BaseInterface {
    protected readonly agent: CreateAgentResult;
    protected readonly resolveUserId: NonNullable<BaseInterfaceOptions['resolveUserId']>;

    constructor(options: BaseInterfaceOptions) {
        this.agent = options.agent;
        this.resolveUserId = options.resolveUserId ?? ((id) => id);
    }

    /**
     * Register routes / event listeners on the Node HTTP server.
     * Called once when the server starts.
     */
    abstract setup(server: http.Server, pathPrefix?: string): void;

    /** Dispatch a text message to the agent and return the response. */
    protected async dispatch(
        message: string,
        surfaceUserId: string,
        sessionId?: string
    ): Promise<InterfaceRunResult> {
        const userId = await this.resolveUserId(surfaceUserId);
        const sid = sessionId ?? (await this.agent.createSession(userId));
        const result = await this.agent.run(message, { sessionId: sid, userId });
        return {
            text: result.text,
            sessionId: sid,
            runId: (result as { id?: string }).id ?? crypto.randomUUID(),
        };
    }

    /** Human-readable name shown in logs. */
    get name(): string {
        return this.constructor.name;
    }
}
