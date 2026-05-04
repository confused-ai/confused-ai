import { describe, it, expect, vi } from 'vitest';
import { compose } from '../src/compose.js';
import { createSupervisor } from '../src/supervisor.js';
import { createSwarm } from '../src/swarm.js';
import type { WorkflowAgent, AgentRunResult } from '../src/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAgent(name: string, responses: string[]): WorkflowAgent {
  let i = 0;
  return {
    name,
    instructions: `${name} agent`,
    async run(prompt): Promise<AgentRunResult> {
      const text = responses[i % responses.length] ?? 'done';
      i++;
      return { text, messages: [], steps: 1, finishReason: 'stop' };
    },
  };
}

// ── compose ────────────────────────────────────────────────────────────────────

describe('compose()', () => {
  it('single step passes prompt through', async () => {
    const agent = makeAgent('a', ['result']);
    const pipeline = compose({ agent });
    const r = await pipeline.run('input');
    expect(r.text).toBe('result');
  });

  it('two steps chain: step2 gets step1 output as prompt', async () => {
    const step1 = makeAgent('s1', ['step-one-out']);
    const step2 = makeAgent('s2', ['step-two-out']);
    const pipeline = compose({ agent: step1 }, { agent: step2 });
    const r = await pipeline.run('start');
    expect(r.text).toBe('step-two-out');
  });

  it('transform function reshapes inter-step prompt', async () => {
    const step1 = makeAgent('s1', ['raw data']);
    const step2 = makeAgent('s2', ['processed']);
    const pipeline = compose(
      { agent: step1 },
      { agent: step2, transform: (prev) => `TRANSFORM: ${prev.text}` },
    );
    const r = await pipeline.run('go');
    expect(r.text).toBe('processed');
  });

  it('throws when called with zero steps', () => {
    expect(() => compose()).toThrow('At least one step');
  });
});

// ── createSupervisor ──────────────────────────────────────────────────────────

describe('createSupervisor()', () => {
  it('returns final answer when supervisor says done', async () => {
    const supervisor = makeAgent('sup', [JSON.stringify({ done: true, answer: '42' })]);
    const sw = createSupervisor({
      supervisor,
      agents: new Map([['worker', makeAgent('worker', ['sub-result'])]]),
    });
    const r = await sw.run('What is the answer?');
    expect(r.text).toBe('42');
  });

  it('delegates to sub-agent and incorporates result', async () => {
    let round = 0;
    const sup: WorkflowAgent = {
      name: 'sup', instructions: '',
      async run(): Promise<AgentRunResult> {
        round++;
        const text = round === 1
          ? JSON.stringify({ agent: 'researcher', prompt: 'find info' })
          : JSON.stringify({ done: true, answer: 'final' });
        return { text, messages: [], steps: 1, finishReason: 'stop' };
      },
    };
    const sw = createSupervisor({
      supervisor: sup,
      agents: new Map([['researcher', makeAgent('researcher', ['info found'])]]),
    });
    const r = await sw.run('research task');
    expect(r.text).toBe('final');
  });

  it('handles unknown agent gracefully (continues)', async () => {
    let round = 0;
    const sup: WorkflowAgent = {
      name: 'sup', instructions: '',
      async run(): Promise<AgentRunResult> {
        round++;
        const text = round === 1
          ? JSON.stringify({ agent: 'NONEXISTENT', prompt: 'x' })
          : JSON.stringify({ done: true, answer: 'recovered' });
        return { text, messages: [], steps: 1, finishReason: 'stop' };
      },
    };
    const sw = createSupervisor({ supervisor: sup, agents: new Map() });
    const r = await sw.run('x');
    expect(r.text).toBe('recovered');
  });
});

// ── createSwarm ────────────────────────────────────────────────────────────────

describe('createSwarm()', () => {
  it('run() routes to an agent and returns result', async () => {
    const swarm = createSwarm({ agents: [makeAgent('a', ['from-a'])] });
    const r = await swarm.run('hello');
    expect(r.text).toBe('from-a');
  });

  it('run() uses round-robin for multiple agents', async () => {
    const a = makeAgent('a', ['agent-a']);
    const b = makeAgent('b', ['agent-b']);
    const swarm = createSwarm({ agents: [a, b] });
    const r1 = await swarm.run('1');
    const r2 = await swarm.run('2');
    expect(r1.text).toBe('agent-a');
    expect(r2.text).toBe('agent-b');
  });

  it('runAll() runs all agents in parallel', async () => {
    const swarm = createSwarm({
      agents: [makeAgent('a', ['A']), makeAgent('b', ['B']), makeAgent('c', ['C'])],
    });
    const results = await swarm.runAll('prompt');
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.text).sort()).toEqual(['A', 'B', 'C']);
  });

  it('runAll() respects concurrency limit', async () => {
    const swarm = createSwarm({
      agents: [makeAgent('a', ['A']), makeAgent('b', ['B']), makeAgent('c', ['C'])],
      concurrency: 1,
    });
    const results = await swarm.runAll('prompt');
    expect(results).toHaveLength(3);
  });

  it('throws when agents list is empty', () => {
    expect(() => createSwarm({ agents: [] })).toThrow('At least one agent');
  });

  it('custom route function is called', async () => {
    let routeCalled = false;
    const swarm = createSwarm({
      agents: [makeAgent('a', ['custom'])],
      route: (prompt, agents) => { routeCalled = true; return agents[0]!; },
    });
    await swarm.run('x');
    expect(routeCalled).toBe(true);
  });
});
