# Artifacts

Artifacts are typed, versioned outputs that agents produce alongside their text response. Where `result.text` gives you the raw string, an artifact gives you structured metadata (type, MIME, creator, session, tags, version history) and a typed content payload.

Use artifacts when you need to:
- Store and retrieve agent outputs across sessions
- Maintain version history as a document evolves over multiple runs
- Attach structured data (JSON, code, reports) to a run for downstream processing
- Separate "the thing produced" from "the conversation that produced it"

---

## Quick start

```ts
import {
  InMemoryArtifactStorage,
  createMarkdownArtifact,
  createTextArtifact,
  createDataArtifact,
} from 'confused-ai/artifacts';

const storage = new InMemoryArtifactStorage();

// 1. Create and save an artifact
const doc = await storage.save(
  createMarkdownArtifact('market-report', '# Q1 Market Report\n\n...'),
);

console.log(doc.id);      // 'artifact-xyz'
console.log(doc.version); // 1
console.log(doc.type);    // 'markdown'

// 2. Retrieve it later
const found = await storage.get<string>(doc.id);
console.log(found?.content); // '# Q1 Market Report\n\n...'

// 3. Update (creates version 2)
const v2 = await storage.update(doc.id, {
  content: '# Q1 Market Report (Revised)\n\n...',
  tags:    ['report', 'q1', 'revised'],
});
console.log(v2.version); // 2
```

---

## Factory helpers

All factories return an object ready to pass to `storage.save()`. They set `name`, `type`, `mimeType`, and `content` for you.

```ts
import {
  createTextArtifact,
  createMarkdownArtifact,
  createDataArtifact,
  createReasoningArtifact,
  createPlanArtifact,
} from 'confused-ai/artifacts';
// or: import { createMarkdownArtifact, ... } from 'confused-ai';

// Plain text (type: 'file')
createTextArtifact('summary', 'The executive summary is...');

// Markdown document (type: 'markdown')
createMarkdownArtifact('report', '# Report\n\n...');

// JSON data (type: 'data')
createDataArtifact('metrics', { totalRevenue: 1_200_000, growth: 0.23 });

// Reasoning trace (type: 'reasoning')
createReasoningArtifact('cot-trace', {
  thoughts:   ['First I check...', 'Then I verify...'],
  conclusion: '3599 is prime',
  confidence: 0.97,
});

// Action plan (type: 'plan')
createPlanArtifact('migration-plan', {
  goal:   'Migrate API to Bun',
  steps:  [
    { id: '1', description: 'Replace npm scripts', status: 'completed' },
    { id: '2', description: 'Update Dockerfile',   status: 'in_progress' },
    { id: '3', description: 'Test CI',             status: 'pending' },
  ],
  status: 'executing',
});
```

---

## Versioning

Every `update()` creates a new version automatically. Use `listVersions()` and `getVersion()` to navigate history:

```ts
// List all versions (metadata only, no content)
const versions = await storage.listVersions(doc.id);
// [{ id, version: 1, ... }, { id, version: 2, ... }]

// Retrieve a specific version
const original = await storage.getVersion<string>(doc.id, 1);
console.log(original?.content); // original markdown
```

---

## Listing and searching

```ts
// List by type
const reports = await storage.list({ type: 'markdown', limit: 20 });

// List by tags
const q1 = await storage.list({ tags: ['q1'] });

// List by creator or session
const mine = await storage.list({ createdBy: 'report-agent', sessionId: 'sess-abc' });

// Full-text search across name and content
const results = await storage.search('market report Q1', 10);
```

---

## Wire into an agent run

Attach artifact storage to your agent workflow to automatically persist outputs:

```ts
import { agent } from 'confused-ai';
import { InMemoryArtifactStorage, createMarkdownArtifact } from 'confused-ai/artifacts';

const storage = new InMemoryArtifactStorage();

const ai = agent({
  model: 'gpt-4o',
  instructions: 'You write detailed market analysis reports in markdown.',
});

// Run the agent and persist the output as a versioned artifact
const result = await ai.run('Write a Q2 2026 cloud market analysis.');

const artifact = await storage.save({
  ...createMarkdownArtifact('q2-cloud-analysis', result.text),
  createdBy: 'market-agent',
  sessionId: 'sess-001',
  tags:      ['q2', 'cloud', 'market'],
});

console.log('Saved artifact:', artifact.id, 'v' + artifact.version);
```

The `result.markdown` on every `AgentRunResult` is already a ready-to-save markdown artifact shape (though not persisted to a store). Use `InMemoryArtifactStorage` when you need versioning, retrieval, and search.

---

## `ArtifactStorage` interface

Implement this to back artifacts with any database or object store:

```ts
interface ArtifactStorage {
  save<T>(artifact: Omit<Artifact<T>, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<Artifact<T>>;
  get<T>(id: string): Promise<Artifact<T> | null>;
  getVersion<T>(id: string, version: number): Promise<Artifact<T> | null>;
  listVersions(id: string): Promise<ArtifactMetadata[]>;
  update<T>(id: string, updates: Partial<Omit<Artifact<T>, 'id' | 'createdAt' | 'version'>>): Promise<Artifact<T>>;
  delete(id: string): Promise<boolean>;
  list(filters?: {
    type?:       ArtifactType;
    tags?:       string[];
    createdBy?:  string;
    sessionId?:  string;
    limit?:      number;
    offset?:     number;
  }): Promise<ArtifactMetadata[]>;
  search(query: string, limit?: number): Promise<ArtifactMetadata[]>;
}
```

---

## `ArtifactType` values

| Type | Content | Use for |
|------|---------|---------|
| `'file'` | `string` | Plain text |
| `'code'` | `string` | Source code |
| `'markdown'` | `string` | Markdown documents |
| `'document'` | `string` | Formatted prose |
| `'json'` | `object` | Structured JSON |
| `'data'` | `object` | Typed data objects |
| `'image'` | `Uint8Array / string` | Binary or base64 image |
| `'audio'` | `Uint8Array / string` | Binary or base64 audio |
| `'video'` | `Uint8Array / string` | Binary or base64 video |
| `'reasoning'` | `{ thoughts, conclusion, confidence }` | CoT traces |
| `'plan'` | `{ goal, steps, status }` | Action plans |
| `'report'` | `{ title, sections, summary }` | Structured reports |

---

## `ArtifactStorageConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `versioning` | `boolean` | `true` | Enable version history |
| `maxSizeBytes` | `number` | `104_857_600` (100 MB) | Max artifact size |
| `ttlMs` | `number` | `0` (no expiry) | Artifact TTL in ms |
| `metrics` | `MetricsCollector` | — | Optional metrics collector |

---

## Related

- [Storage (KV/File)](./storage.md) — generic key-value store for simpler persistence
- [Session Management](./session.md) — store session `sessionId` alongside artifacts for traceability
- [Reasoning](./reasoning.md) — use `createReasoningArtifact` to persist CoT traces
