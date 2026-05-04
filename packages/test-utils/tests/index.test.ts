import { describe, it, expect, vi } from 'vitest';
import { createMockLLM, createMockAgent, runScenario } from '../src/index.js';

// ── createMockLLM ─────────────────────────────────────────────────────────────

describe('createMockLLM', () => {
  it('returns fixed response on first call', async () => {
    const { llm, calls } = createMockLLM({ responses: ['Hello!'] });
    const result = await llm.generateText([{ role: 'user', content: 'hi' }]);
    expect(result.text).toBe('Hello!');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.response).toBe('Hello!');
  });

  it('cycles through multiple responses', async () => {
    const { llm } = createMockLLM({ responses: ['A', 'B', 'C'] });
    const r1 = await llm.generateText([]);
    const r2 = await llm.generateText([]);
    const r3 = await llm.generateText([]);
    const r4 = await llm.generateText([]); // wraps around
    expect(r1.text).toBe('A');
    expect(r2.text).toBe('B');
    expect(r3.text).toBe('C');
    expect(r4.text).toBe('A');
  });

  it('throws on configured failOnCall index', async () => {
    const { llm } = createMockLLM({ failOnCall: 2 });
    await llm.generateText([]); // call 1 — ok
    await expect(llm.generateText([])).rejects.toThrow('forced failure on call 2');
  });

  it('reset() clears call history and resets index', async () => {
    const { llm, calls, reset } = createMockLLM({ responses: ['X'] });
    await llm.generateText([]);
    expect(calls).toHaveLength(1);
    reset();
    expect(calls).toHaveLength(0);
    const r = await llm.generateText([]);
    expect(r.text).toBe('X');
  });

  it('simulates latency', async () => {
    const start = Date.now();
    const { llm } = createMockLLM({ latencyMs: 50 });
    await llm.generateText([]);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it('finishReason is always stop', async () => {
    const { llm } = createMockLLM();
    const r = await llm.generateText([]);
    expect(r.finishReason).toBe('stop');
  });
});

// ── createMockAgent ────────────────────────────────────────────────────────────

describe('createMockAgent', () => {
  it('returns fixed response', async () => {
    const { agent } = createMockAgent({ responses: ['done'] });
    const r = await agent.run('go');
    expect(r.text).toBe('done');
    expect(r.finishReason).toBe('stop');
    expect(r.steps).toBe(1);
  });

  it('cycles responses across runs', async () => {
    const { agent } = createMockAgent({ responses: ['one', 'two'] });
    const r1 = await agent.run('a');
    const r2 = await agent.run('b');
    const r3 = await agent.run('c'); // wrap
    expect(r1.text).toBe('one');
    expect(r2.text).toBe('two');
    expect(r3.text).toBe('one');
  });

  it('records runs with prompt and result', async () => {
    const { agent, runs } = createMockAgent({ responses: ['hi'] });
    await agent.run('hello');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.prompt).toBe('hello');
    expect(runs[0]?.result.text).toBe('hi');
  });

  it('stream() yields text then finishes', async () => {
    const { agent } = createMockAgent({ responses: ['stream-out'] });
    const chunks: string[] = [];
    for await (const chunk of agent.stream('prompt')) chunks.push(chunk);
    expect(chunks).toEqual(['stream-out']);
  });

  it('streamEvents() emits text-delta then run-finish', async () => {
    const { agent } = createMockAgent({ responses: ['ev-out'] });
    const events = [];
    for await (const ev of agent.streamEvents('prompt')) events.push(ev);
    expect(events[0]).toMatchObject({ type: 'text-delta', delta: 'ev-out' });
    expect(events[1]).toMatchObject({ type: 'run-finish' });
  });

  it('createSession() / getSessionMessages() round-trip', async () => {
    const { agent } = createMockAgent();
    const id = await agent.createSession();
    expect(typeof id).toBe('string');
    const msgs = await agent.getSessionMessages(id);
    expect(Array.isArray(msgs)).toBe(true);
  });

  it('reset() clears recorded runs', async () => {
    const { agent, runs, reset } = createMockAgent();
    await agent.run('x');
    reset();
    expect(runs).toHaveLength(0);
  });

  it('defaults name and instructions', () => {
    const { agent } = createMockAgent();
    expect(agent.name).toBe('mock-agent');
    expect(typeof agent.instructions).toBe('string');
  });
});

// ── runScenario ────────────────────────────────────────────────────────────────

describe('runScenario', () => {
  it('passes when keywords present', async () => {
    const { agent } = createMockAgent({ responses: ['the answer is 42'] });
    const { passed, results } = await runScenario(agent, [
      { prompt: 'what is the answer?', expectedKeywords: ['answer', '42'] },
    ]);
    expect(passed).toBe(true);
    expect(results[0]?.passed).toBe(true);
  });

  it('fails when keyword missing', async () => {
    const { agent } = createMockAgent({ responses: ['I dunno'] });
    const { passed } = await runScenario(agent, [
      { prompt: 'what is the answer?', expectedKeywords: ['42'] },
    ]);
    expect(passed).toBe(false);
  });

  it('reports missing keywords in reason', async () => {
    const { agent } = createMockAgent({ responses: ['nope'] });
    const { results } = await runScenario(agent, [
      { prompt: 'x', expectedKeywords: ['foo', 'bar'] },
    ]);
    expect(results[0]?.reason).toContain('foo');
  });

  it('passes multiple steps in sequence', async () => {
    const { agent } = createMockAgent({ responses: ['step1 done', 'step2 done'] });
    const { passed } = await runScenario(agent, [
      { prompt: 'step 1', expectedKeywords: ['step1'] },
      { prompt: 'step 2', expectedKeywords: ['step2'] },
    ]);
    expect(passed).toBe(true);
  });

  it('checks minSteps constraint', async () => {
    const { agent } = createMockAgent({ responses: ['ok'] });
    const { passed, results } = await runScenario(agent, [
      { prompt: 'x', minSteps: 5 },
    ]);
    expect(passed).toBe(false);
    expect(results[0]?.reason).toContain('≥5');
  });

  it('checks maxSteps constraint', async () => {
    const { agent } = createMockAgent({ responses: ['ok'] });
    const { passed, results } = await runScenario(agent, [
      { prompt: 'x', maxSteps: 0 },
    ]);
    expect(passed).toBe(false);
    expect(results[0]?.reason).toContain('≤0');
  });
});
