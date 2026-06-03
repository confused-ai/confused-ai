import { describe, it, expect } from 'vitest';
import type { Agent as CoreAgent, AgentRunResult, MultiModalInput, AgentRunOptions, Message } from '../src/core/index.js';
import { AgentState } from '../src/core/index.js';
import {
    createMixtureOfAgents,
    createActorCritic,
    createSocraticAgent,
    createPromptChain,
    createProgramOfThought,
    createSkeletonOfThought,
    createStepBackAgent,
    createRejectionSampling,
    createSelfCorrection,
} from '../src/orchestration/multi-agent/patterns.js';

class MockAgent implements CoreAgent {
    readonly id = 'mock-agent-id';
    name = 'MockAgent';
    instructions = 'Instructions';
    responses: string[] = [];
    responseIdx = 0;
    promptsReceived: string[] = [];

    constructor(responses: string[]) {
        this.responses = responses;
    }

    async run(prompt: string | MultiModalInput, options?: AgentRunOptions): Promise<AgentRunResult> {
        const promptStr = typeof prompt === 'string' ? prompt : prompt.text;
        this.promptsReceived.push(promptStr);
        const text = this.responses[this.responseIdx++ % this.responses.length] || 'Default response';
        return {
            text,
            markdown: { name: 'artifact', content: text, mimeType: 'text/markdown', type: 'markdown' },
            messages: [{ role: 'user', content: promptStr }, { role: 'assistant', content: text }],
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
        return userId || `session-${Date.now()}`;
    }

    async getSessionMessages(): Promise<Message[]> {
        return [];
    }
}

describe('Extended Multi-Agent Patterns', () => {

    describe('Mixture-of-Agents (MoA)', () => {
        it('runs proposers and aggregates responses in MoA', async () => {
            const proposer1 = new MockAgent(['Proposer 1 Response']);
            const proposer2 = new MockAgent(['Proposer 2 Response']);
            const aggregator = new MockAgent(['Synthesized Final Response']);

            const moa = createMixtureOfAgents({
                name: 'MoaTest',
                proposers: [proposer1, proposer2],
                aggregator,
                rounds: 1,
            });

            const result = await moa.run({ prompt: 'Solve the problem' }, { agentId: 'test', metadata: {} });
            expect(result.result).toBe('Synthesized Final Response');
            expect(result.state).toBe(AgentState.COMPLETED);
            expect(proposer1.promptsReceived[0]).toContain('Solve the problem');
            expect(proposer2.promptsReceived[0]).toContain('Solve the problem');
            expect(aggregator.promptsReceived[0]).toContain('Proposer 1 Response');
            expect(aggregator.promptsReceived[0]).toContain('Proposer 2 Response');
        });
    });

    describe('Actor-Critic', () => {
        it('refines answers through Actor-Critic loop', async () => {
            const actor = new MockAgent(['Initial Attempt', 'Refined Success']);
            const critic = new MockAgent(['Critique: Needs improvement', 'Critique: Good']);

            const actorCritic = createActorCritic({
                name: 'AC-Test',
                actor,
                critic,
                maxRefinements: 2,
            });

            console.log('--- STARTING ACTOR-CRITIC TEST ---');
            const result = await actorCritic.run({ prompt: 'Write essay' }, { agentId: 'test', metadata: {} });
            console.log('Actor prompts received:', actor.promptsReceived);
            console.log('Critic prompts received:', critic.promptsReceived);
            console.log('Resulting output:', result.result);
            expect(result.result).toBe('Refined Success');
            expect(actor.promptsReceived).toHaveLength(2);
            expect(critic.promptsReceived).toHaveLength(2);
            expect(critic.promptsReceived[0]).toContain('Initial Attempt');
            expect(actor.promptsReceived[1]).toContain('Critique: Needs improvement');
        });
    });

    describe('Socratic tutor', () => {
        it('instructs Socratic persona correctly', async () => {
            const baseAgent = new MockAgent(['What do you think is the next step?']);
            const socratic = createSocraticAgent({
                name: 'Socrates',
                agent: baseAgent,
                topic: 'Physics',
            });

            const result = await socratic.run({ prompt: 'Tell me the answer' }, { agentId: 'test', metadata: {} });
            expect(result.result).toBe('What do you think is the next step?');
            expect(baseAgent.promptsReceived[0]).toContain('Socratic tutor');
            expect(baseAgent.promptsReceived[0]).toContain('Physics');
            expect(baseAgent.promptsReceived[0]).toContain('Tell me the answer');
        });
    });

    describe('Prompt Chaining', () => {
        it('chains prompts and returns step results', async () => {
            const agent1 = new MockAgent(['Draft Article']);
            const agent2 = new MockAgent(['Proofread Article']);

            const chain = createPromptChain({
                name: 'Writer-Editor',
                steps: [
                    { name: 'write', agent: agent1 },
                    { name: 'edit', agent: agent2, template: (input) => `Edit this: ${input}` },
                ],
            });

            const result = await chain.run({ prompt: 'Topic: tech' }, { agentId: 'test', metadata: {} });
            const val = result.result as { steps: Record<string, string>; final: string };
            expect(val.steps.write).toBe('Draft Article');
            expect(val.steps.edit).toBe('Proofread Article');
            expect(val.final).toBe('Proofread Article');
            expect(agent2.promptsReceived[0]).toBe('Edit this: Draft Article');
        });
    });

    describe('Program-of-Thought (PoT)', () => {
        it('executes generated code and completes with PoT', async () => {
            const agent = new MockAgent([
                'Code proposal: ```javascript\nconsole.log(2 + 2);\n```',
                'Final answer is 4',
            ]);

            const pot = createProgramOfThought({
                name: 'Calculator-Agent',
                agent,
            });

            const result = await pot.run({ prompt: 'What is 2 + 2?' }, { agentId: 'test', metadata: {} });
            expect(result.result).toBe('Final answer is 4');
            expect(agent.promptsReceived[0]).toContain('JavaScript code');
            expect(agent.promptsReceived[1]).toContain('4');
        });
    });

    describe('Skeleton-of-Thought (SoT)', () => {
        it('plans outline and worker writes sections in parallel', async () => {
            const planner = new MockAgent(['["Intro", "Body", "Outro"]']);
            const worker = new MockAgent(['Intro content', 'Body content', 'Outro content']);

            const sot = createSkeletonOfThought({
                name: 'Outline-Writer',
                planner,
                worker,
                parallel: true,
            });

            const result = await sot.run({ prompt: 'Write book review' }, { agentId: 'test', metadata: {} });
            expect(result.result).toContain('## Intro\n\nIntro content');
            expect(result.result).toContain('## Body\n\nBody content');
            expect(result.result).toContain('## Outro\n\nOutro content');
            expect(planner.promptsReceived[0]).toContain('JSON array');
            expect(worker.promptsReceived).toHaveLength(3);
        });
    });

    describe('Step-Back Abstraction', () => {
        it('performs step-back reasoning and solves task', async () => {
            const stepBackAgent = new MockAgent(['Conceptual Principle of conservation of energy']);
            const solverAgent = new MockAgent(['Specific problem solved using energy conservation']);

            const stepBack = createStepBackAgent({
                name: 'Physicist',
                stepBackAgent,
                solverAgent,
            });

            const result = await stepBack.run({ prompt: 'Calculate velocity' }, { agentId: 'test', metadata: {} });
            expect(result.result).toBe('Specific problem solved using energy conservation');
            expect(stepBackAgent.promptsReceived[0]).toContain('Calculate velocity');
            expect(solverAgent.promptsReceived[0]).toContain('conservation of energy');
            expect(solverAgent.promptsReceived[0]).toContain('Calculate velocity');
        });
    });

    describe('Rejection Sampling (Best-of-N)', () => {
        it('generates N choices and returns highest scored choice', async () => {
            const agent = new MockAgent(['Option A', 'Option B', 'Option C']);
            // A custom function judge that scores Option B highest
            const judge = (candidate: string) => {
                if (candidate === 'Option B') return 10;
                if (candidate === 'Option A') return 5;
                return 2;
            };

            const bestOfN = createRejectionSampling({
                name: 'Best-Choice',
                agent,
                judge,
                n: 3,
            });

            const result = await bestOfN.run({ prompt: 'Generate ideas' }, { agentId: 'test', metadata: {} });
            expect(result.result).toBe('Option B');
        });
    });

    describe('Self-Correction', () => {
        it('runs validator and self-corrects until valid', async () => {
            const agent = new MockAgent(['Attempt with typo', 'Attempt correct text']);
            const validator = (output: string) => {
                if (output.includes('typo')) {
                    return { valid: false, errors: ['Text contains the word typo.'] };
                }
                return { valid: true };
            };

            const selfCorrect = createSelfCorrection({
                name: 'Spelling-Corrector',
                agent,
                validator,
                maxRetries: 2,
            });

            const result = await selfCorrect.run({ prompt: 'Write text' }, { agentId: 'test', metadata: {} });
            expect(result.result).toBe('Attempt correct text');
            expect(agent.promptsReceived).toHaveLength(2);
            expect(agent.promptsReceived[1]).toContain('Text contains the word typo.');
        });
    });

});
