import { describe, it, expect } from 'vitest';
import { RalphLoop, createRalphLoop } from '../src/orchestration/multi-agent/ralph.js';
import type { Agent as CoreAgent, AgentRunResult, MultiModalInput, AgentRunOptions, StreamChunk, Message } from '../src/core/index.js';

class MockAgent implements CoreAgent {
    readonly id = 'mock-agent-id';
    name = 'MockAgent';
    instructions = 'Instructions';
    responses: string[] = [];
    responseIdx = 0;
    sessionIdsCreated: string[] = [];

    constructor(responses: string[]) {
        this.responses = responses;
    }

    async run(prompt: string | MultiModalInput, options?: AgentRunOptions): Promise<AgentRunResult> {
        const text = this.responses[this.responseIdx++ % this.responses.length] || 'Default response';
        return {
            text,
            markdown: { name: 'artifact', content: text, mimeType: 'text/markdown', type: 'markdown' },
            messages: [{ role: 'user', content: String(prompt) }, { role: 'assistant', content: text }],
            steps: 1,
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        };
    }

    async stream(): Promise<never> {
        throw new Error('Not implemented');
    }

    async streamEvents(): Promise<never> {
        throw new Error('Not implemented');
    }

    async createSession(userId?: string): Promise<string> {
        const sess = userId || `session-${Date.now()}`;
        this.sessionIdsCreated.push(sess);
        return sess;
    }

    async getSessionMessages(): Promise<Message[]> {
        return [];
    }
}

describe('RalphLoop Orchestrator', () => {
    it('succeeds immediately on first run if validator returns true', async () => {
        const agent = new MockAgent(['First run response']);
        const loop = createRalphLoop({
            agent,
            checkComplete: (ctx) => {
                expect(ctx.cycle).toBe(1);
                expect(ctx.lastResult).toBe('First run response');
                return true;
            },
        });

        const result = await loop.run('Do task A');
        expect(result.success).toBe(true);
        expect(result.cyclesRun).toBe(1);
        expect(result.finalOutput).toBe('First run response');
        expect(result.logs).toHaveLength(1);
        expect(result.logs[0]?.text).toBe('First run response');
        expect(agent.sessionIdsCreated).toHaveLength(1);
    });

    it('loops until completion or maxCycles is hit', async () => {
        const agent = new MockAgent(['Attempt 1', 'Attempt 2', 'Attempt 3 Success']);
        const loop = new RalphLoop({
            agent,
            maxCycles: 5,
            checkComplete: (ctx) => {
                return ctx.lastResult.includes('Success');
            },
        });

        const result = await loop.run('Do task B');
        expect(result.success).toBe(true);
        expect(result.cyclesRun).toBe(3);
        expect(result.finalOutput).toBe('Attempt 3 Success');
        expect(result.logs).toHaveLength(3);
        expect(result.logs[2]?.text).toBe('Attempt 3 Success');
        expect(agent.sessionIdsCreated).toHaveLength(3);
    });

    it('fails and returns logs if maxCycles is reached without passing validation', async () => {
        const agent = new MockAgent(['Attempt 1', 'Attempt 2', 'Attempt 3']);
        const loop = createRalphLoop({
            agent,
            maxCycles: 2,
            checkComplete: () => false,
        });

        const result = await loop.run('Do task C');
        expect(result.success).toBe(false);
        expect(result.cyclesRun).toBe(2);
        expect(result.finalOutput).toBe('Attempt 2');
        expect(result.logs).toHaveLength(2);
    });

    it('preserves and updates environment state variables across iterations', async () => {
        const agent = new MockAgent(['Try 1', 'Try 2', 'Try 3']);
        const loop = createRalphLoop({
            agent,
            initialState: { counter: 0 },
            checkComplete: (ctx) => {
                ctx.state.counter = (ctx.state.counter as number) + 1;
                return ctx.state.counter === 3;
            },
        });

        const result = await loop.run('Do task D');
        expect(result.success).toBe(true);
        expect(result.cyclesRun).toBe(3);
        expect(result.state.counter).toBe(3);
    });

    it('handles agent errors gracefully on an iteration and continues', async () => {
        const agent = new MockAgent(['Successful recovery']);
        // Inject dynamic fail behavior
        agent.run = async () => {
            throw new Error('Agent crashed');
        };

        const loop = createRalphLoop({
            agent,
            maxCycles: 3,
            checkComplete: () => false,
        });

        const result = await loop.run('Run flaky task');
        expect(result.success).toBe(false);
        expect(result.cyclesRun).toBe(3);
        expect(result.finalOutput).toBe('Agent crashed');
        expect(result.logs[0]?.text).toBe('Agent crashed');
        expect(result.logs[0]?.steps).toBe(0);
    });

    it('invokes custom promptFormatter with correct context', async () => {
        const agent = new MockAgent(['Result 1', 'Result 2']);
        const promptsSent: string[] = [];

        const loop = createRalphLoop({
            agent,
            maxCycles: 2,
            promptFormatter: (prompt, ctx) => {
                promptsSent.push(`Cycle ${ctx.cycle}: ${prompt}`);
                return `Loop-Cycle-${ctx.cycle}`;
            },
            checkComplete: () => false,
        });

        await loop.run('Generate code');
        expect(promptsSent).toHaveLength(2);
        expect(promptsSent[0]).toBe('Cycle 1: Generate code');
        expect(promptsSent[1]).toBe('Cycle 2: Generate code');
    });
});
