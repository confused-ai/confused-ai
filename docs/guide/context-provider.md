# Context Providers

`ContextProvider` and `ContextBackend` are the extension points for connecting agents to arbitrary data sources — databases, file systems, CRMs, Google Drive, Slack, web crawlers, MCP servers, or anything else you can query.

- **`ContextBackend`** is a low-level adapter for a single data source. It exposes health checks and optional tools.
- **`ContextProvider`** composes one or more backends and implements the agent-facing `query()` / `update()` API. It decides *how* to expose its data via `ContextMode`.

---

## `ContextMode` — three integration styles

| Mode | How data reaches the agent | When to use |
|------|---------------------------|-------------|
| `DEFAULT` | Provider content injected as text into the system prompt | Static or infrequently-changing context |
| `AGENT` | Provider registers as a sub-agent persona | When the source needs its own reasoning personality |
| `TOOLS` | Provider exposes callable tools the agent invokes on demand | Large/expensive sources the agent should query selectively |

---

## Build a custom ContextProvider

Extend `ContextProvider` and implement `query()`:

```ts
import { ContextProvider, ContextMode } from 'confused-ai';
import type { Answer, QueryOptions } from 'confused-ai';

class DocsContextProvider extends ContextProvider {
  private docs: Array<{ id: string; title: string; content: string }>;

  constructor(docs: typeof DocsContextProvider.prototype.docs) {
    super({
      name: 'docs',
      mode: ContextMode.DEFAULT,
      instructions: 'Use the docs context when the user asks about our product.',
    });
    this.docs = docs;
  }

  async query(query: string, opts?: QueryOptions): Promise<Answer> {
    const q = query.toLowerCase();
    const results = this.docs
      .filter(d => d.content.toLowerCase().includes(q) || d.title.toLowerCase().includes(q))
      .slice(0, opts?.limit ?? 5)
      .map(d => ({ id: d.id, name: d.title, content: d.content }));

    return {
      results,
      text: results.map(r => `## ${r.name}\n${r.content}`).join('\n\n'),
    };
  }
}

// Usage
const provider = new DocsContextProvider(myDocs);
await provider.setup(); // call once

const answer = await provider.query('how do I install?');
console.log(answer.text);

// Inject into a system prompt (DEFAULT mode)
const instructions = provider.instructions();
```

---

## TOOLS mode — agent-callable query

When mode is `TOOLS`, the provider registers a `{name}_query` tool (and optionally `{name}_update`) that the agent calls on demand:

```ts
class DatabaseContextProvider extends ContextProvider {
  constructor(private db: MyDB) {
    super({
      name: 'crm',
      mode: ContextMode.TOOLS,
      queryToolName:  'crm_search',
      updateToolName: 'crm_upsert',
    });
  }

  async query(query: string, opts?: QueryOptions): Promise<Answer> {
    const rows = await this.db.search(query, { limit: opts?.limit ?? 10 });
    return {
      results: rows.map(r => ({ id: r.id, name: r.name, content: JSON.stringify(r) })),
    };
  }

  async update(documents: Document[]): Promise<void> {
    for (const doc of documents) {
      await this.db.upsert(doc.id, doc.content ?? '');
    }
  }
}

// Get the tools and pass them to the agent
const crmProvider = new DatabaseContextProvider(db);
const tools = crmProvider.getTools(); // [{ name: 'crm_search', ... }, { name: 'crm_upsert', ... }]

const ai = agent({
  model: 'gpt-4o',
  instructions: 'You have access to the CRM. Use crm_search to look up customers.',
  tools: [...builtInTools, ...tools],
});
```

---

## Build a custom ContextBackend

`ContextBackend` is the lower-level primitive. Use it when you want to build a backend that a `ContextProvider` will compose:

```ts
import { ContextBackend } from 'confused-ai';
import type { BackendTool } from 'confused-ai';

class SlackBackend extends ContextBackend {
  readonly name = 'slack';

  async setup() {
    await this.slackClient.connect();
  }

  async close() {
    await this.slackClient.disconnect();
  }

  status() {
    return { ok: this.slackClient.isConnected(), detail: 'Slack backend' };
  }

  getTools(): BackendTool[] {
    return [
      {
        name:        'slack_search',
        description: 'Search Slack messages',
        fn:          async (query: unknown) => this.slackClient.search(String(query)),
      },
    ];
  }
}
```

---

## `ContextProvider` API reference

```ts
abstract class ContextProvider {
  readonly name:           string;
  readonly mode:           ContextMode;
  readonly queryToolName:  string;   // default: `${name}_query`
  readonly updateToolName: string;   // default: `${name}_update`
  readonly metadata:       Record<string, unknown>;

  // Must implement
  abstract query(query: string, opts?: QueryOptions): Promise<Answer>;

  // Optional — override if the source supports writes
  async update(documents: Document[], opts?: UpdateOptions): Promise<void>;

  // Returns text to inject into the system prompt (DEFAULT mode)
  instructions(): string | undefined;

  // Returns tools for TOOLS mode
  getTools(): BackendTool[];

  // Health
  status():          Status;
  async astatus():   Promise<Status>;

  // Lifecycle
  async setup():     Promise<void>;
  async close():     Promise<void>;
}
```

---

## `Document` shape

Queries return `Answer` objects containing arrays of `Document`:

```ts
interface Document {
  id:       string;            // stable content identifier
  name:     string;            // human-readable title
  uri?:     string;            // source URI (file path, URL, DB row ref…)
  content?: string;            // full text content
  source?:  string;            // 'database' | 'gdrive' | 'web' | …
  snippet?: string;            // short excerpt for search previews
  metadata?: Record<string, unknown>;
}

interface Answer {
  results: Document[];         // matching documents
  text?:   string;             // optional synthesized textual answer
}
```

---

## `QueryOptions`

| Option | Type | Description |
|--------|------|-------------|
| `userId` | `string` | User executing the query (for access-control aware backends) |
| `sessionId` | `string` | Session scoping |
| `namespace` | `string` | Namespace/collection to query within |
| `limit` | `number` | Maximum documents to return |
| `minScore` | `number` | Minimum relevance threshold (0.0–1.0) |

---

## `ProviderConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | **required** | Provider identifier |
| `mode` | `ContextMode` | `DEFAULT` | Integration style |
| `instructions` | `string` | — | Text to inject into system prompt |
| `queryToolName` | `string` | `${name}_query` | Tool name for query operation |
| `updateToolName` | `string` | `${name}_update` | Tool name for update operation |
| `metadata` | `Record<string, unknown>` | `{}` | Extra metadata |

---

## Related

- [RAG / Knowledge](./rag.md) — vector-based document retrieval (built on `KnowledgeEngine`)
- [Tools](./tools.md) — registering tools with agents
- [MCP Client](./mcp.md) — connect to MCP servers as backends
- [Adapters](./adapters.md) — adapter registry pattern
