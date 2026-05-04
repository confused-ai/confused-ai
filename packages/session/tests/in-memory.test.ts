import { describe, it, expect } from 'vitest';
import { InMemorySessionStore, createInMemoryStore } from '../src/index.js';

describe('InMemorySessionStore', () => {
  it('factory creates a fresh store', () => {
    const store = createInMemoryStore();
    expect(store).toBeInstanceOf(InMemorySessionStore);
    expect(store.size).toBe(0);
  });

  it('create() returns session with id', async () => {
    const store = createInMemoryStore();
    const session = await store.create({ agentId: 'agent-1' });
    expect(typeof session.id).toBe('string');
    expect(store.size).toBe(1);
  });

  it('get() returns undefined for unknown id', async () => {
    const store = createInMemoryStore();
    expect(await store.get('ghost')).toBeUndefined();
  });

  it('get() returns session after create()', async () => {
    const store = createInMemoryStore();
    const { id } = await store.create({ agentId: 'ag', messages: [{ role: 'user', content: 'hi' }] });
    const session = await store.get(id);
    expect(session?.messages).toHaveLength(1);
  });

  it('update() persists new messages', async () => {
    const store = createInMemoryStore();
    const { id } = await store.create({ agentId: 'ag' });
    await store.update(id, { messages: [{ role: 'assistant', content: 'hello' }] });
    const msgs = await store.getMessages(id);
    expect(msgs[0]?.content).toBe('hello');
  });

  it('update() unknown id is no-op', async () => {
    const store = createInMemoryStore();
    await expect(store.update('none', { messages: [] })).resolves.toBeUndefined();
  });

  it('getMessages() returns [] for unknown id', async () => {
    const store = createInMemoryStore();
    expect(await store.getMessages('nope')).toEqual([]);
  });

  it('delete() removes session', async () => {
    const store = createInMemoryStore();
    const { id } = await store.create({ agentId: 'ag' });
    await store.delete(id);
    expect(store.size).toBe(0);
    expect(await store.get(id)).toBeUndefined();
  });

  it('returned messages are snapshots (mutation safe)', async () => {
    const store = createInMemoryStore();
    const { id } = await store.create({ agentId: 'ag', messages: [{ role: 'user', content: 'original' }] });
    const msgs = await store.getMessages(id);
    msgs.push({ role: 'assistant', content: 'injected' });
    expect(await store.getMessages(id)).toHaveLength(1);
  });

  it('size reflects live count', async () => {
    const store = createInMemoryStore();
    const s1 = await store.create({ agentId: 'a' });
    await store.create({ agentId: 'b' });
    expect(store.size).toBe(2);
    await store.delete(s1.id);
    expect(store.size).toBe(1);
  });

  it('multiple sessions are isolated', async () => {
    const store = createInMemoryStore();
    const s1 = await store.create({ agentId: 'ag' });
    const s2 = await store.create({ agentId: 'ag' });
    await store.update(s1.id, { messages: [{ role: 'user', content: 'session-1' }] });
    expect(await store.getMessages(s2.id)).toHaveLength(0);
  });
});
