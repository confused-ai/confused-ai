---
title: Learning Machine
description: LearningMachine coordinates five memory stores — user profiles, memories, session context, entity memory, and learned knowledge — into a single adaptive agent context.
outline: [2, 3]
---

# Learning Machine

`LearningMachine` is a unified learning coordinator that pulls together **five independent stores** under a single API. Before each LLM call, call `buildContext()` to inject everything the agent knows. After each turn, call `process()` to automatically extract and persist new learnings.

| Store | Purpose |
|-------|---------|
| `UserProfileStore` | Static user preferences and attributes |
| `UserMemoryStore` | Episodic memories from past conversations |
| `SessionContextStore` | Short-term context for the current session |
| `EntityMemoryStore` | Knowledge about people, places, companies mentioned |
| `LearnedKnowledgeStore` | Domain insights extracted across many sessions |

---

## Quick start

```ts
import { LearningMachine,
         InMemoryUserMemoryStore,
         InMemorySessionContextStore,
         InMemoryEntityMemoryStore,
         InMemoryLearnedKnowledgeStore,
         InMemoryUserProfileStore } from 'confused-ai';
import { agent }                    from 'confused-ai';

// 1. Create the machine with all five stores
const learner = new LearningMachine({
  userProfileStore:      new InMemoryUserProfileStore(),
  userMemoryStore:       new InMemoryUserMemoryStore(),
  sessionContextStore:   new InMemorySessionContextStore(),
  entityMemoryStore:     new InMemoryEntityMemoryStore(),
  learnedKnowledgeStore: new InMemoryLearnedKnowledgeStore(),
});

const ai = agent({
  model:        'gpt-4o',
  instructions: 'You are a personal assistant.',
});

const userId    = 'alice-001';
const sessionId = 'session-abc';

// 2. Before each run: inject all context
const context  = await learner.buildContext(userId, sessionId);
const input    = `${context}\n\nUser: Remind me of my project deadline`;

// 3. Run the agent
const result   = await ai.run(input);

// 4. After each run: extract and persist new learnings
await learner.process({
  userId,
  sessionId,
  input:  'Remind me of my project deadline',
  output: result.text,
  model:  'gpt-4o',
});
```

---

## `buildContext()` — what gets injected

```ts
const context = await learner.buildContext('alice-001', 'session-abc');

// Returns a formatted string combining:
// - User profile: "Alice, age 29, prefers dark mode, timezone: America/New_York"
// - Relevant memories: "Alice mentioned she is working on Project Orion (deadline: March 1)"
// - Session context: "Earlier in this session: discussed sprint 42 planning"
// - Entity memory: "Orion is Alice's main project at TechCorp"
// - Learned knowledge: "Alice usually asks about deadlines on Fridays"
```

---

## `process()` — automatic extraction

After each turn, `process()` uses an LLM to extract:
- New facts about the user → `UserMemoryStore`
- Entity mentions (people, companies) → `EntityMemoryStore`
- Session-relevant context → `SessionContextStore`
- Recurring patterns → `LearnedKnowledgeStore`

```ts
await learner.process({
  userId:    'alice-001',
  sessionId: 'session-abc',
  input:     'Move the Orion deadline to March 15',
  output:    'Got it! I\'ve noted that the Orion project deadline is now March 15.',
  model:     'gpt-4o-mini',  // cheaper model is fine for extraction
});
```

---

## User profiles

```ts
// Set initial profile
await learner.userProfileStore.set('alice-001', {
  name:     'Alice',
  timezone: 'America/New_York',
  role:     'Product Manager',
  prefs:    { theme: 'dark', language: 'en' },
});

// Read profile
const profile = await learner.userProfileStore.get('alice-001');
```

---

## Direct store access

All five stores are exposed directly for custom logic:

```ts
// Retrieve Alice's stored memories
const memories = await learner.userMemoryStore.get('alice-001');

// Find entities related to a project
const entities = await learner.entityMemoryStore.search('Orion', { userId: 'alice-001' });

// Inspect learned patterns
const insights = await learner.learnedKnowledgeStore.getAll('alice-001');
```

---

## Persistent stores (production)

Replace the in-memory stores with persistent backends:

```ts
import { SqliteUserMemoryStore,
         SqliteEntityMemoryStore,
         SqliteLearnedKnowledgeStore } from 'confused-ai';

const learner = new LearningMachine({
  userProfileStore:      new SqliteUserProfileStore('./profiles.db'),
  userMemoryStore:       new SqliteUserMemoryStore('./memories.db'),
  sessionContextStore:   new InMemorySessionContextStore(),   // OK in-memory (per session)
  entityMemoryStore:     new SqliteEntityMemoryStore('./entities.db'),
  learnedKnowledgeStore: new SqliteLearnedKnowledgeStore('./knowledge.db'),
});
```

This goes well beyond the basic `InMemoryUserProfileStore`. It gives agents the ability to remember *what* the user said, *who* they talked about, and *what insights* have been discovered across many sessions.

---

## Quick start

```ts
import {
  LearningMachine,
  InMemoryUserMemoryStore,
  InMemorySessionContextStore,
} from 'confused-ai';

const machine = new LearningMachine({
  userMemory:     new InMemoryUserMemoryStore(),
  sessionContext: new InMemorySessionContextStore(),
});

// Before each LLM call — returns a string to inject into the system prompt
const context = await machine.buildContext({
  userId:    'user-42',
  sessionId: 'sess-abc',
  message:   'What was the project I mentioned last week?',
});

// Wire into a custom agent
const ai = agent({
  model: 'gpt-4o',
  instructions: `You are a helpful assistant.\n\n${context}`,
});

const result = await ai.run('What was the project I mentioned last week?');

// After each turn — extract and persist learnings
await machine.process(result.messages, {
  userId:    'user-42',
  sessionId: 'sess-abc',
});
```

---

## All five stores

Each store is independently opt-in. You can use one, several, or all five.

| Store | Class | Remembers |
|-------|-------|-----------|
| User Profile | `userProfile` | Name, preferences, locale, plan |
| User Memory | `userMemory` | Free-form facts: "Alice prefers dark mode" |
| Session Context | `sessionContext` | Per-session goal, summary, current plan |
| Entity Memory | `entityMemory` | Companies, people, projects with facts + timeline |
| Learned Knowledge | `learnedKnowledge` | Reusable insights discovered during conversations |

```ts
import {
  LearningMachine,
  InMemoryUserProfileStore,
  InMemoryUserMemoryStore,
  InMemorySessionContextStore,
  InMemoryEntityMemoryStore,
  InMemoryLearnedKnowledgeStore,
} from 'confused-ai';

const machine = new LearningMachine({
  userProfile:     new InMemoryUserProfileStore(),
  userMemory:      new InMemoryUserMemoryStore(),
  sessionContext:  new InMemorySessionContextStore(),
  entityMemory:    new InMemoryEntityMemoryStore(),
  learnedKnowledge: new InMemoryLearnedKnowledgeStore(),
  namespace:       'support-bot', // scope all stores
  debug:           false,
});
```

---

## User Memory store

The `InMemoryUserMemoryStore` records free-form memory entries per user, with optional per-agent scoping.

```ts
import { InMemoryUserMemoryStore } from 'confused-ai';

const store = new InMemoryUserMemoryStore();

// Add a memory entry
const id = await store.addMemory(
  'user-42',
  'Prefers responses under 100 words',
  'support-bot',           // optional agentId scope
);

// Get all memories for a user
const memory = await store.get('user-42', 'support-bot');
// { userId, agentId, memories: [{ id, content, createdAt }], ... }

// Update a specific memory
await store.updateMemory('user-42', id, 'Prefers bullet-point responses');

// Delete a memory
await store.deleteMemory('user-42', id);
```

---

## Session Context store

Tracks what the user is currently trying to accomplish — goal, running summary, and active plan.

```ts
import { InMemorySessionContextStore } from 'confused-ai';

const store = new InMemorySessionContextStore();

// Upsert context for a session
await store.set({
  sessionId: 'sess-abc',
  userId:    'user-42',
  goal:      'Migrate the app from Node 18 to Bun',
  summary:   'Discussed package manager differences; decided on bun add.',
  plan:      ['Replace npm scripts', 'Update Dockerfile', 'Test CI'],
});

// Retrieve before each run
const ctx = await store.get('sess-abc');

// Clear when session ends
await store.delete('sess-abc');
```

---

## Entity Memory store

Remembers named entities (companies, people, projects) along with structured facts, timeline events, and relationships.

```ts
import { InMemoryEntityMemoryStore } from 'confused-ai';

const store = new InMemoryEntityMemoryStore();

// Add an entity
await store.addEntity({
  id:        'entity-acme',
  name:      'Acme Corp',
  entityType: 'company',
  namespace: 'global',
});

// Add a fact about the entity
await store.addFact('entity-acme', {
  attribute: 'industry',
  value:     'SaaS',
  source:    'user',
  confidence: 0.9,
});

// Add a timeline event
await store.addEvent('entity-acme', {
  description: 'Signed enterprise contract',
  timestamp:   new Date().toISOString(),
  type:        'business',
});

// Search entities by name
const results = await store.search('Acme', 'global');
```

---

## Learned Knowledge store

Stores cross-session insights the agent has discovered — rules-of-thumb, patterns, and domain knowledge.

```ts
import { InMemoryLearnedKnowledgeStore } from 'confused-ai';

const store = new InMemoryLearnedKnowledgeStore();

// Store a learned insight
await store.add({
  topic:    'pricing',
  insight:  'Enterprise customers always ask about SSO before buying',
  source:   'pattern',
  namespace: 'sales-bot',
  confidence: 0.85,
});

// Retrieve relevant insights before a run
const insights = await store.query('enterprise pricing', 'sales-bot');
```

---

## `buildContext()` options

| Option | Type | Description |
|--------|------|-------------|
| `userId` | `string` | User to load profile + memories for |
| `sessionId` | `string` | Session to load context for |
| `agentId` | `string` | Scope stores to this agent |
| `message` | `string` | Current user message (for relevance filtering) |
| `namespace` | `string` | Override the machine's default namespace |

---

## `process()` options

| Option | Type | Description |
|--------|------|-------------|
| `userId` | `string` | User whose memories to update |
| `sessionId` | `string` | Session context to update |
| `agentId` | `string` | Agent scope |
| `namespace` | `string` | Namespace override |
| `extractEntities` | `boolean` | Extract and persist entity mentions (default: `true`) |

---

## Using SQLite in production

All four in-memory stores can be swapped for persistent backends. For user profiles specifically, a SQLite store ships out of the box:

```ts
import { createSqliteUserProfileStore } from 'confused-ai';

const profiles = createSqliteUserProfileStore('./data/profiles.db');
```

For the other four stores, implement `UserMemoryStore`, `SessionContextStore`, `EntityMemoryStore`, or `LearnedKnowledgeStore` from `confused-ai` using your database of choice.

---

## LearningMachine config reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userProfile` | `UserProfileStore` | — | User profile store |
| `userMemory` | `UserMemoryStore` | — | Free-form memory store |
| `sessionContext` | `SessionContextStore` | — | Per-session goal/summary store |
| `entityMemory` | `EntityMemoryStore` | — | Named entity store |
| `learnedKnowledge` | `LearnedKnowledgeStore` | — | Insights store |
| `namespace` | `string` | `'global'` | Default namespace for all stores |
| `debug` | `boolean` | `false` | Log recall/process operations to console |

---

## Related

- [Memory](./memory.md) — vector memory for semantic recall
- [Session Management](./session.md) — conversation history persistence
- [Agents](./agents.md) — wiring stores into the agent lifecycle
