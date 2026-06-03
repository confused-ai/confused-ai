import { describe, it, expect } from 'vitest';
import { GSDCoordinator, createGSDCoordinator, InMemoryGSDStorage } from '../src/orchestration/multi-agent/gsd.js';
import type { Agent as CoreAgent, AgentRunResult, MultiModalInput, AgentRunOptions, StreamChunk, Message } from '../src/core/index.js';

class MockGsdAgent implements CoreAgent {
    readonly id: string;
    readonly name: string;
    instructions = 'GSD Helper';
    runResponse: string;

    constructor(id: string, name: string, runResponse: string) {
        this.id = id;
        this.name = name;
        this.runResponse = runResponse;
    }

    async run(prompt: string | MultiModalInput, options?: AgentRunOptions): Promise<AgentRunResult> {
        return {
            text: this.runResponse,
            markdown: { name: 'artifact', content: this.runResponse, mimeType: 'text/markdown', type: 'markdown' },
            messages: [{ role: 'user', content: String(prompt) }, { role: 'assistant', content: this.runResponse }],
            steps: 1,
            finishReason: 'stop',
        };
    }

    async stream(): Promise<never> {
        throw new Error('Not implemented');
    }

    async streamEvents(): Promise<never> {
        throw new Error('Not implemented');
    }

    async createSession(userId?: string): Promise<string> {
        return userId || `session-${Date.now()}`;
    }

    async getSessionMessages(): Promise<Message[]> {
        return [];
    }
}

describe('GSD (Get Shit Done) Coordinator', () => {
    it('runs the Plan, Execute, and Verify lifecycle successfully', async () => {
        // 1. Setup mock agents
        const roadmapJson = JSON.stringify({
            tasks: [
                { id: 'task_1', name: 'Setup', description: 'Setup project folders' },
                { id: 'task_2', name: 'Code', description: 'Write core rate limiter' }
            ]
        });

        const planner = new MockGsdAgent('plan-1', 'Planner', roadmapJson);
        const executor = new MockGsdAgent('exec-1', 'Executor', 'Code implementation is complete.');
        const verifier = new MockGsdAgent('verify-1', 'Verifier', 'Code checks out cleanly. [VERIFIED]');

        const storage = new InMemoryGSDStorage();
        const gsd = createGSDCoordinator({
            projectDir: '/test-workspace',
            plannerAgent: planner,
            executorAgent: executor,
            verifierAgent: verifier,
            storage,
        });

        // Phase 1: Plan
        await gsd.plan('Build rate limiter');
        
        expect(await storage.exists('REQUIREMENTS.md')).toBe(true);
        expect(await storage.exists('ROADMAP.md')).toBe(true);
        expect(await storage.exists('STATE.md')).toBe(true);

        const requirements = await storage.read('REQUIREMENTS.md');
        expect(requirements).toContain('Build rate limiter');

        const state1 = await gsd.loadState();
        expect(state1.status).toBe('PLANNING');
        expect(state1.tasks).toHaveLength(2);
        expect(state1.tasks[0]?.id).toBe('task_1');

        // Phase 2: Execute Step 1
        const execResult1 = await gsd.executeStep();
        expect(execResult1.taskName).toBe('Setup');
        expect(execResult1.output).toContain('Code implementation is complete.');
        expect(execResult1.completed).toBe(false);

        const state2 = await gsd.loadState();
        expect(state2.status).toBe('EXECUTING');
        expect(state2.tasks[0]?.completed).toBe(true);
        expect(state2.tasks[1]?.completed).toBe(false);

        // Execute Step 2
        const execResult2 = await gsd.executeStep();
        expect(execResult2.taskName).toBe('Code');
        expect(execResult2.completed).toBe(true); // both tasks are now completed

        const state3 = await gsd.loadState();
        expect(state3.status).toBe('VERIFYING'); // transitions to verifying once all tasks are complete
        expect(state3.tasks[1]?.completed).toBe(true);

        // Phase 3: Verify
        const verifyResult = await gsd.verify();
        expect(verifyResult.success).toBe(true);
        expect(verifyResult.report).toContain('[VERIFIED]');

        const finalState = await gsd.loadState();
        expect(finalState.status).toBe('COMPLETED');
    });

    it('falls back to default tasks if the planner returns non-JSON text', async () => {
        const planner = new MockGsdAgent('plan-2', 'Planner', 'Sure, here is the text explanation without JSON formatting.');
        const executor = new MockGsdAgent('exec-2', 'Executor', 'Work done.');
        const verifier = new MockGsdAgent('verify-2', 'Verifier', 'Verified.');

        const storage = new InMemoryGSDStorage();
        const gsd = new GSDCoordinator({
            projectDir: '/test-workspace',
            plannerAgent: planner,
            executorAgent: executor,
            verifierAgent: verifier,
            storage,
        });

        await gsd.plan('Build something simple');
        const state = await gsd.loadState();
        expect(state.tasks).toHaveLength(3); // Falls back to default 3 tasks
        expect(state.tasks[0]?.id).toBe('task_1');
    });

    it('fails verification if verifier does not confirm with [VERIFIED]', async () => {
        const planner = new MockGsdAgent('plan-3', 'Planner', JSON.stringify({ tasks: [{ id: 't1', name: 'Work', description: 'Just do it' }] }));
        const executor = new MockGsdAgent('exec-3', 'Executor', 'Work done.');
        const verifier = new MockGsdAgent('verify-3', 'Verifier', 'There were failures in test run. [FAILED]');

        const storage = new InMemoryGSDStorage();
        const gsd = createGSDCoordinator({
            projectDir: '/test-workspace',
            plannerAgent: planner,
            executorAgent: executor,
            verifierAgent: verifier,
            storage,
        });

        await gsd.plan('Goal');
        await gsd.executeStep();
        const verifyResult = await gsd.verify();
        expect(verifyResult.success).toBe(false);

        const state = await gsd.loadState();
        expect(state.status).toBe('FAILED');
    });
});
