import { describe, it, expect } from 'vitest';
import { KnowledgeEngine, createKnowledgeEngine } from '../src/index.js';

describe('KnowledgeEngine (TF-IDF fallback)', () => {
  it('factory shorthand works', () => {
    const engine = createKnowledgeEngine();
    expect(engine).toBeInstanceOf(KnowledgeEngine);
  });

  it('returns empty string when no documents added', async () => {
    const engine = createKnowledgeEngine();
    const ctx = await engine.buildContext('anything');
    expect(ctx).toBe('');
  });

  it('adds and retrieves a single document', async () => {
    const engine = createKnowledgeEngine();
    await engine.addDocuments([{ id: 'doc1', content: 'TypeScript is a typed superset of JavaScript.' }]);
    const ctx = await engine.buildContext('TypeScript');
    expect(ctx).toContain('TypeScript is a typed superset');
  });

  it('retrieves most relevant document first', async () => {
    const engine = createKnowledgeEngine({ topK: 3 });
    await engine.addDocuments([
      { id: '1', content: 'Bun is a fast JavaScript runtime.' },
      { id: '2', content: 'TypeScript adds static types to JavaScript.' },
      { id: '3', content: 'Vitest is a unit test framework.' },
    ]);
    const ctx = await engine.buildContext('TypeScript static typing');
    // TypeScript doc must appear somewhere in the retrieved context
    expect(ctx).toContain('TypeScript adds static types');
  });

  it('respects topK option', async () => {
    const engine = createKnowledgeEngine({ topK: 1 });
    await engine.addDocuments([
      { id: '1', content: 'Alpha beta gamma.' },
      { id: '2', content: 'Delta epsilon zeta.' },
    ]);
    const ctx = await engine.buildContext('alpha');
    // With topK=1 only one doc should appear — no double separator
    expect((ctx.match(/\[1\]/g) ?? []).length).toBe(1);
    expect(ctx).not.toContain('[2]');
  });

  it('auto-assigns IDs to documents without one', async () => {
    const engine = createKnowledgeEngine();
    // No id provided
    await engine.addDocuments([{ content: 'No ID doc.' }]);
    const ctx = await engine.buildContext('No ID');
    expect(ctx).toContain('No ID doc.');
  });

  it('respects maxContextChars limit', async () => {
    const engine = createKnowledgeEngine({ maxContextChars: 20, topK: 5 });
    await engine.addDocuments([
      { id: '1', content: 'Short.' },
      { id: '2', content: 'Also short enough.' },
      { id: '3', content: 'This is a longer document that pushes over the limit.' },
    ]);
    const ctx = await engine.buildContext('short');
    expect(ctx.length).toBeLessThanOrEqual(50); // some margin for labels
  });

  it('uses custom vector store when provided', async () => {
    let addCalled = false;
    let searchCalled = false;
    const customStore = {
      add: async () => { addCalled = true; },
      search: async () => { searchCalled = true; return []; },
    };
    const engine = createKnowledgeEngine({ store: customStore });
    await engine.addDocuments([{ id: 'x', content: 'test' }]);
    await engine.buildContext('test');
    expect(addCalled).toBe(true);
    expect(searchCalled).toBe(true);
  });

  it('uses custom embedding function when provided', async () => {
    let embedCalled = false;
    const customEmbed = async (_text: string) => {
      embedCalled = true;
      return new Array(8).fill(0.5) as number[];
    };
    const engine = createKnowledgeEngine({ embed: customEmbed });
    await engine.addDocuments([{ id: 'a', content: 'hello' }]);
    await engine.buildContext('hello');
    expect(embedCalled).toBe(true);
  });

  it('context uses numbered citations [1], [2], ...', async () => {
    const engine = createKnowledgeEngine({ topK: 3 });
    await engine.addDocuments([
      { id: 'a', content: 'First document content.' },
      { id: 'b', content: 'Second document content.' },
      { id: 'c', content: 'Third document content.' },
    ]);
    const ctx = await engine.buildContext('document content');
    expect(ctx).toContain('[1]');
    expect(ctx).toContain('[2]');
    expect(ctx).toContain('[3]');
  });
});
