/**
 * Sleep / delay utility tool — pause agent execution for a specified duration.
 * Useful for rate limiting, polling loops, or waiting for async operations.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

const SleepSchema = z.object({
    seconds: z.number().min(0.1).max(300)
        .describe('Number of seconds to sleep (0.1-300)'),
    reason: z.string().optional()
        .describe('Optional reason for sleeping (for logging/debugging)'),
});

export class SleepTool extends BaseTool<typeof SleepSchema, {
    sleptForSeconds: number;
    reason?: string;
}> {
    constructor() {
        super({
            id: 'sleep',
            name: 'Sleep',
            description: 'Pause execution for a specified number of seconds. Useful for rate limiting or waiting for async operations.',
            category: ToolCategory.UTILITY,
            parameters: SleepSchema,
            permissions: { allowNetwork: false, allowFileSystem: false, maxExecutionTimeMs: 305000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SleepSchema>, _ctx: ToolContext) {
        const ms = Math.round(input.seconds * 1000);
        await new Promise(resolve => setTimeout(resolve, ms));
        return { sleptForSeconds: input.seconds, ...(input.reason !== undefined && { reason: input.reason }) };
    }
}

export class SleepToolkit {
    readonly sleep: SleepTool;

    constructor() {
        this.sleep = new SleepTool();
    }

    getTools() {
        return [this.sleep];
    }
}
