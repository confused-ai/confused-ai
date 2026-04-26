# Adapters

The adapter system is the **universal extensibility layer** of confused-ai.
Every infrastructure concern — sessions, memory, guardrails, RAG, tools,
auth, rate-limiting, audit logging, databases, queues, search, and more — is
expressed as an adapter interface.  Swap any backend without touching your
agent code.

---

## Quick start

The fastest path: `createProductionSetup()` wires every slot to a sensible
default and lets you swap individual drivers progressively.

```ts
import { createAgent } from 'confused-ai';
import { createProductionSetup } from 'confused-ai/adapters';

const setup = createProductionSetup();   // all in-memory defaults — works everywhere

await setup.connect();

const agent = createAgent({
  name: 'assistant',
  model: 'gpt-4o',
  instructions: 'You are a helpful assistant.',
  adapters: setup.bindings,
});

const result = await agent.run('Hello!');
```

> **Note:** Every default is a zero-dependency in-memory implementation.
> They keep the framework functional out of the box.
> Replace them with real drivers before going to production.

---

## Architecture overview

```
createAgent(options)
       │
       ▼
 AdapterBindings ──────────────────────────────────────────────────────────
 │                                                                          │
 ├── sessionStore      ← session lifecycle (Redis, SQL, DynamoDB …)        │
 ├── memoryStore       ← long-term memory (Pinecone, Qdrant, pgvector …)   │
 ├── rag               ← retrieval pipeline (any vector/search backend)    │
 ├── guardrail         ← content safety (Azure, Bedrock, custom …)         │
 ├── auth              ← credential validation (JWT, OAuth2, API-key …)    │
 ├── rateLimit         ← throttling (Redis token-bucket, Upstash …)        │
 ├── auditLog          ← compliance log (PostgreSQL, CloudWatch …)         │
 ├── toolRegistry      ← remote tools (MCP, HTTP registries …)            │
 ├── observability     ← traces / logs / metrics (OTel, Datadog …)        │
 ├── queue             ← async tasks (BullMQ, Kafka, SQS …)               │
 ├── analytics         ← OLAP (DuckDB, ClickHouse, BigQuery …)            │
 ├── database          ← relational / document / graph data               │
 ├── cache             ← fast KV (Redis, Memcached, Upstash …)            │
 ├── vector            ← vector store                                      │
 ├── storage           ← blob / file store (S3, GCS …)                    │
 └── embedding         ← embedding model (OpenAI, Cohere …)               │
                                                                           │
AdapterRegistry ─ central store, lifecycle management, health checks ─────┘
```

---

## Adapter categories

| Category | Interface | In-memory default |
|---|---|---|
| `sql` | `SqlAdapter` | `InMemorySqlAdapter` |
| `nosql` | `NoSqlAdapter` | `InMemoryNoSqlAdapter` |
| `vector` | `VectorAdapter` | `InMemoryVectorAdapter` |
| `analytics` | `AnalyticsAdapter` | `InMemoryAnalyticsAdapter` |
| `search` | `SearchAdapter` | `InMemorySearchAdapter` |
| `cache` | `CacheAdapter` | `InMemoryCacheAdapter` |
| `object-storage` | `ObjectStorageAdapter` | `InMemoryObjectStorageAdapter` |
| `time-series` | `TimeSeriesAdapter` | `InMemoryTimeSeriesAdapter` |
| `graph` | `GraphAdapter` | `InMemoryGraphAdapter` |
| `message-queue` | `MessageQueueAdapter` | `InMemoryMessageQueueAdapter` |
| `observability` | `ObservabilityAdapter` | `ConsoleObservabilityAdapter` |
| `embedding` | `EmbeddingAdapter` | `InMemoryEmbeddingAdapter` |
| `session-store` | `SessionStoreAdapter` | `InMemorySessionStoreAdapter` |
| `memory-store` | `MemoryStoreAdapter` | `InMemoryMemoryStoreAdapter` |
| `guardrail` | `GuardrailAdapter` | `PassThroughGuardrailAdapter` |
| `rag` | `RagAdapter` | `InMemoryRagAdapter` |
| `tool-registry` | `ToolRegistryAdapter` | `InMemoryToolRegistryAdapter` |
| `auth` | `AuthAdapter` | `NoOpAuthAdapter` |
| `rate-limit` | `RateLimitAdapter` | `InMemoryRateLimitAdapter` |
| `audit-log` | `AuditLogAdapter` | `InMemoryAuditLogAdapter` |

---

## `createProductionSetup()` — recommended entry-point

`createProductionSetup()` returns a `ProductionSetup` object with:

| Property / method | Description |
|---|---|
| `setup.bindings` | `AdapterBindings` — pass directly to `createAgent` |
| `setup.registry` | The `AdapterRegistry` for manual resolution |
| `setup.connect()` | Connect all adapters (call once at startup) |
| `setup.disconnect()` | Graceful shutdown |
| `setup.healthCheck()` | Liveness probe — returns `Record<string, AdapterHealth>` |
| `setup.isHealthy()` | `true` when every adapter is connected |

### Progressive upgrade path

Start with all defaults, then replace slots one at a time as you add real infra:

```ts
import { createProductionSetup } from 'confused-ai/adapters';
// Real adapters (install separately as needed):
// import { RedisAdapter } from 'confused-ai-adapter-redis';
// import { PostgresAdapter } from 'confused-ai-adapter-postgres';
// import { PineconeAdapter } from 'confused-ai-adapter-pinecone';

const setup = createProductionSetup({
  // Stage 1 — replace cache
  // cache: new RedisAdapter({ url: process.env.REDIS_URL! }),

  // Stage 2 — replace session + rate-limit
  // sessionStore: new RedisSessionAdapter({ url: process.env.REDIS_URL! }),
  // rateLimit:    new RedisRateLimitAdapter({ url: process.env.REDIS_URL! }),

  // Stage 3 — replace memory + RAG
  // vector:    new PineconeAdapter({ apiKey: process.env.PINECONE_API_KEY! }),
  // memoryStore: new QdrantMemoryAdapter({ url: process.env.QDRANT_URL! }),
  // rag:       new PineconeRagAdapter({ apiKey: process.env.PINECONE_API_KEY! }),

  // Stage 4 — add persistence
  // database: new PostgresAdapter({ connectionString: process.env.DATABASE_URL! }),
  // auditLog: new PgAuditLogAdapter({ connectionString: process.env.DATABASE_URL! }),

  // Stage 5 — add safety
  // guardrail: new ContentSafetyAdapter({ apiKey: process.env.AZURE_CS_KEY! }),
  // auth:      new JwtAuthAdapter({ secret: process.env.JWT_SECRET! }),

  // Stage 6 — add observability
  // observability: new OtelAdapter({ endpoint: process.env.OTEL_ENDPOINT }),
});

await setup.connect();
```

### Health endpoint

```ts
app.get('/health', async (_req, res) => {
  const health = await setup.healthCheck();
  const allOk = Object.values(health).every((h) => h.ok);
  res.status(allOk ? 200 : 503).json(health);
});
```

### Graceful shutdown

```ts
process.on('SIGTERM', async () => {
  await setup.disconnect();
  process.exit(0);
});
```

---

## AdapterRegistry — manual wiring

For maximum control, build the registry yourself:

```ts
import { createAdapterRegistry } from 'confused-ai/adapters';

const registry = createAdapterRegistry();

// Register any number of adapters
registry.register(new PostgresAdapter({ connectionString: process.env.DATABASE_URL! }));
registry.register(new RedisAdapter({ url: process.env.REDIS_URL! }));
registry.register(new PineconeAdapter({ apiKey: process.env.PINECONE_API_KEY! }));

// Connect them all
await registry.connectAll();

// Pass the registry — createAgent auto-selects the best adapter per slot
const agent = createAgent({
  name: 'assistant',
  model: 'gpt-4o',
  instructions: '...',
  adapters: registry,
});
```

### Typed resolvers

```ts
const db  = registry.sql('postgres');      // SqlAdapter | undefined
const red = registry.cache('redis');       // CacheAdapter | undefined
const vec = registry.vector();             // first VectorAdapter or undefined
const mem = registry.memoryStore();        // first MemoryStoreAdapter or undefined
const rl  = registry.rateLimit();          // first RateLimitAdapter or undefined
const al  = registry.auditLog();           // first AuditLogAdapter or undefined
const gr  = registry.guardrail();          // first GuardrailAdapter or undefined
const rag = registry.rag();               // first RagAdapter or undefined
const auth= registry.auth();              // first AuthAdapter or undefined
```

### Health check

```ts
const health = await registry.healthCheck();
// { 'sql:postgres': { ok: true, latencyMs: 3 }, 'cache:redis': { ok: true, latencyMs: 1 }, ... }
```

---

## Explicit bindings

Pass a plain `AdapterBindings` object when you want complete manual control:

```ts
createAgent({
  name: 'assistant',
  model: 'gpt-4o',
  instructions: '...',
  adapters: {
    sessionStore:  myRedisSessionAdapter,
    memoryStore:   myQdrantAdapter,
    rag:           myPineconeRagAdapter,
    guardrail:     myContentSafetyAdapter,
    auth:          myJwtAdapter,
    rateLimit:     myRedisRateLimiter,
    auditLog:      myPgAuditAdapter,
    observability: myOtelAdapter,
    database:      myPostgresAdapter,
  },
});
```

---

## Convenience passthrough fields

You can also wire individual adapters directly on `createAgent` — no registry
or bindings object needed:

```ts
createAgent({
  name: 'assistant',
  model: 'gpt-4o',
  instructions: '...',
  // Convenience fields — each maps directly to a binding slot
  sessionStoreAdapter:  myRedisSessionAdapter,
  memoryStoreAdapter:   myQdrantAdapter,
  ragAdapter:           myPineconeRagAdapter,
  guardrailAdapter:     myContentSafetyAdapter,
  authAdapter:          myJwtAdapter,
  rateLimitAdapter:     myRedisRateLimiter,
  auditLogAdapter:      myPgAuditAdapter,
  toolRegistryAdapter:  myMcpRegistryAdapter,
});
```

Convenience fields take priority over the same slot in an `adapters` registry
or bindings object.

---

## Implementing a custom adapter

Any object that satisfies the interface can be used as an adapter.
Here is a minimal example for `RagAdapter`:

```ts
import type { RagAdapter, RetrievedDocument, RagRetrieveOptions } from 'confused-ai/adapters';

export class MyRagAdapter implements RagAdapter {
  readonly name = 'my-rag';
  readonly category = 'rag' as const;
  readonly version = '1.0.0';
  readonly description = 'Custom RAG over my private corpus';

  private connected = false;
  isConnected(): boolean { return this.connected; }

  async connect() { this.connected = true; }
  async disconnect() { this.connected = false; }

  async retrieve(query: string, opts?: RagRetrieveOptions): Promise<RetrievedDocument[]> {
    // Call your vector / search API here
    return [];
  }

  async ingest(doc: { content: string; source?: string }): Promise<string> {
    // Chunk + embed + upsert
    return 'doc-id';
  }

  async ingestBatch(docs: typeof doc[]): Promise<string[]> {
    return Promise.all(docs.map((d) => this.ingest(d)));
  }

  async deleteDocument(id: string): Promise<boolean> { return true; }

  async buildContext(query: string, opts?: RagRetrieveOptions): Promise<string> {
    const docs = await this.retrieve(query, opts);
    return docs.map((d) => d.content).join('\n\n');
  }
}
```

Then register and use it:

```ts
const registry = createAdapterRegistry();
registry.register(new MyRagAdapter());

createAgent({ adapters: registry, ... });
// or
createAgent({ ragAdapter: new MyRagAdapter(), ... });
```

---

## Framework-level adapters in detail

### Session Store (`session-store`)

Manages conversation sessions — messages, state, and metadata.

```ts
import { InMemorySessionStoreAdapter } from 'confused-ai/adapters';

const sessionStore = new InMemorySessionStoreAdapter();

// Or implement SessionStoreAdapter for Redis:
// import { RedisSessionAdapter } from 'confused-ai-adapter-redis-sessions';
// const sessionStore = new RedisSessionAdapter({ url: '...' });

createAgent({ sessionStoreAdapter: sessionStore, ... });
```

**Interface:** `create`, `get`, `update`, `delete`, `list`, `addMessage`,
`getMessages`, `touch`, `purgeExpired`.

---

### Memory Store (`memory-store`)

Long-term memory with semantic retrieval.

```ts
import { InMemoryMemoryStoreAdapter } from 'confused-ai/adapters';

// Semantic retrieval with cosine similarity (if embeddings provided)
// or keyword overlap fallback for dev/test
const memoryStore = new InMemoryMemoryStoreAdapter();

createAgent({ memoryStoreAdapter: memoryStore, ... });
```

**Interface:** `store`, `retrieve`, `get`, `update`, `delete`, `clear`, `count`.

---

### Guardrail (`guardrail`)

Content safety and compliance checks — runs on input, output, and tool calls.

```ts
import { PassThroughGuardrailAdapter } from 'confused-ai/adapters';
import type { GuardrailAdapter, GuardrailAdapterContext } from 'confused-ai/adapters';

// Custom rule-based guardrail
class BlockProfanityGuardrail implements GuardrailAdapter {
  readonly name = 'block-profanity';
  readonly category = 'guardrail' as const;
  readonly version = '1.0.0';
  private connected = false;
  isConnected() { return this.connected; }
  async connect() { this.connected = true; }
  async disconnect() { this.connected = false; }

  async check(ctx: GuardrailAdapterContext) {
    const hasProfanity = /badword/i.test(ctx.content ?? '');
    return [{
      passed: !hasProfanity,
      rule: 'no-profanity',
      severity: 'error' as const,
      message: hasProfanity ? 'Profanity detected' : undefined,
    }];
  }

  async passes(ctx: GuardrailAdapterContext) {
    return (await this.check(ctx)).every((r) => r.passed);
  }
}

createAgent({ guardrailAdapter: new BlockProfanityGuardrail(), ... });
```

---

### RAG (`rag`)

Full retrieval pipeline — ingest documents, retrieve relevant chunks,
and build context strings.

```ts
import { InMemoryRagAdapter } from 'confused-ai/adapters';

const rag = new InMemoryRagAdapter();
await rag.connect();

// Ingest documents
await rag.ingest({ content: 'confused-ai supports streaming out of the box.' });
await rag.ingestBatch([
  { content: 'Use createAgent() for simple agents.', source: 'docs/getting-started.md' },
  { content: 'The adapter system covers 20+ categories.', source: 'docs/adapters.md' },
]);

// Retrieve
const docs = await rag.retrieve('how do I create an agent?');
// or
const context = await rag.buildContext('how do I create an agent?', { topK: 3 });

createAgent({ ragAdapter: rag, ... });
```

---

### Auth (`auth`)

Credential validation — JWT, OAuth2, API-key, mTLS.

```ts
import type { AuthAdapter, AuthIdentity, AuthResult } from 'confused-ai/adapters';

class JwtAuthAdapter implements AuthAdapter {
  readonly name = 'jwt';
  readonly category = 'auth' as const;
  readonly version = '1.0.0';
  private connected = false;
  isConnected() { return this.connected; }
  async connect() { this.connected = true; }
  async disconnect() { this.connected = false; }

  async validate(token: string): Promise<AuthResult> {
    try {
      // const payload = jwt.verify(token, process.env.JWT_SECRET!);
      const identity: AuthIdentity = { id: 'user-123', type: 'user', roles: ['user'] };
      return { valid: true, identity };
    } catch {
      return { valid: false, reason: 'Invalid token' };
    }
  }

  async can(identity: AuthIdentity, permission: string): Promise<boolean> {
    return identity.roles?.includes('admin') ?? false;
  }
}

createAgent({ authAdapter: new JwtAuthAdapter(), ... });
```

---

### Rate Limit (`rate-limit`)

Throttle requests per user, agent, or tool.

```ts
import { InMemoryRateLimitAdapter } from 'confused-ai/adapters';

// 50 requests per 60 seconds
const rateLimit = new InMemoryRateLimitAdapter(50, 60);

// Check without consuming
const status = await rateLimit.peek({ key: 'user:123' });
console.log(status.remaining); // 50

// Check and consume
const result = await rateLimit.check({ key: 'user:123', cost: 1 });
if (!result.allowed) {
  throw new Error(`Rate limited — retry in ${result.retryAfterSeconds}s`);
}

// Consume or throw
await rateLimit.consume({ key: 'user:123' });

createAgent({ rateLimitAdapter: rateLimit, ... });
```

---

### Audit Log (`audit-log`)

Immutable, append-only compliance log. Every agent action can be recorded.

```ts
import { InMemoryAuditLogAdapter } from 'confused-ai/adapters';

const auditLog = new InMemoryAuditLogAdapter();

// Log an event
await auditLog.log({
  agentId: 'assistant',
  sessionId: 'sess_123',
  userId: 'user_456',
  action: 'tool.call',
  resource: 'searchDocs',
  status: 'success',
  durationMs: 42,
  timestamp: new Date(),
});

// Query events
const events = await auditLog.query({ agentId: 'assistant', since: yesterday });

// Export for compliance
const csv = await auditLog.export({ since: yesterday }, 'csv');

createAgent({ auditLogAdapter: auditLog, ... });
```

---

### Tool Registry (`tool-registry`)

Remote tool discovery and execution — MCP servers, HTTP tool hubs.

```ts
import { InMemoryToolRegistryAdapter } from 'confused-ai/adapters';

const toolRegistry = new InMemoryToolRegistryAdapter();
await toolRegistry.connect();

// Register a remote tool descriptor
await toolRegistry.register({
  name: 'searchDocs',
  description: 'Search the product documentation',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
});

// List available tools
const tools = await toolRegistry.list();

createAgent({ toolRegistryAdapter: toolRegistry, ... });
```

---

## Full production example

```ts
import { createAgent } from 'confused-ai';
import { createProductionSetup } from 'confused-ai/adapters';

// Real adapters (community packages — install when you need them)
// import { RedisAdapter } from 'confused-ai-adapter-redis';
// import { PostgresAdapter } from 'confused-ai-adapter-postgres';
// import { PineconeAdapter } from 'confused-ai-adapter-pinecone';
// import { OtelAdapter } from 'confused-ai-adapter-otel';
// import { ContentSafetyAdapter } from 'confused-ai-adapter-azure-content-safety';
// import { JwtAuthAdapter } from 'confused-ai-adapter-jwt';

const setup = createProductionSetup({
  // Uncomment and fill when you have real infrastructure:
  // cache:        new RedisAdapter({ url: process.env.REDIS_URL! }),
  // sessionStore: new RedisSessionAdapter({ url: process.env.REDIS_URL! }),
  // rateLimit:    new RedisRateLimitAdapter({ url: process.env.REDIS_URL!, max: 100, windowSecs: 60 }),
  // vector:       new PineconeAdapter({ apiKey: process.env.PINECONE_API_KEY! }),
  // memoryStore:  new QdrantMemoryAdapter({ url: process.env.QDRANT_URL! }),
  // rag:          new PineconeRagAdapter({ apiKey: process.env.PINECONE_API_KEY! }),
  // database:     new PostgresAdapter({ connectionString: process.env.DATABASE_URL! }),
  // auditLog:     new PgAuditLogAdapter({ connectionString: process.env.DATABASE_URL! }),
  // guardrail:    new ContentSafetyAdapter({ apiKey: process.env.AZURE_CS_KEY! }),
  // auth:         new JwtAuthAdapter({ secret: process.env.JWT_SECRET! }),
  // observability:new OtelAdapter({ endpoint: process.env.OTEL_ENDPOINT! }),
});

await setup.connect();

const agent = createAgent({
  name: 'support-bot',
  model: 'gpt-4o',
  instructions: 'You are a helpful support assistant.',
  adapters: setup.bindings,
});

// Health endpoint
app.get('/health', async (_req, res) => {
  const health = await setup.healthCheck();
  const ok = Object.values(health).every((h) => h.ok);
  res.status(ok ? 200 : 503).json(health);
});

// Graceful shutdown
process.on('SIGTERM', () => setup.disconnect().then(() => process.exit(0)));
```
