# All Modules

Complete reference for every module in confused-ai — what it does, every export, and how to use it.

---

## `agent()` — Quick-start factory

The fastest way to create a production agent. Resolves the LLM from env vars, wires defaults (HTTP + Browser tools, in-memory session), and returns a `run()` interface.

```ts
import { agent } from 'confused-ai';

const ai = agent({
  // LLM — string shorthand or explicit provider
  model: 'gpt-4o-mini',          // reads OPENAI_API_KEY from env
  // model: 'claude-3-5-haiku',  // reads ANTHROPIC_API_KEY
  // model: 'gemini-2.0-flash',  // reads GOOGLE_API_KEY

  instructions: 'You are a concise, helpful assistant.',

  // Tools — omit = [HttpClientTool, BrowserTool] (safe defaults)
  // tools: false                = pure text, no tools
  tools: [],

  // Optional: wire session persistence
  // sessionStore: createSqliteSessionStore('./sessions.db'),

  // Optional: wire RAG
  // knowledgebase: myKnowledgeEngine,

  // Optional: wire memory
  // memoryStore: new VectorMemoryStore({ ... }),

  // Optional: max steps & timeout
  maxSteps: 15,
  timeoutMs: 90_000,
});

// Basic run
const result = await ai.run('Summarize the last 3 months of GPT news');
console.log(result.text);

// Streaming
await ai.run('Write a haiku', {
  onChunk: (text) => process.stdout.write(text),
});

// With session continuity
const sessionId = await ai.createSession('user-123');
await ai.run('My name is Alice', { sessionId });
const r2 = await ai.run('What is my name?', { sessionId });
// r2.text → "Your name is Alice."

// Save result as markdown
import { writeFile } from 'node:fs/promises';
await writeFile(result.markdown.name, result.markdown.content);
```

### `AgenticRunResult` shape

```ts
interface AgenticRunResult {
  text: string;                   // final assistant response
  markdown: {                     // ready-to-save .md artifact
    name: string;                 // "response-<runId>.md"
    content: string;              // same as text
    mimeType: 'text/markdown';
    type: 'markdown';
  };
  structuredOutput?: unknown;     // populated when responseModel is set
  messages: Message[];            // full conversation
  steps: number;                  // LLM steps taken
  finishReason: 'stop' | 'max_steps' | 'timeout' | 'error' | 'human_rejected' | 'aborted';
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  runId?: string;
  traceId?: string;
}
```

---

## LLM Providers

Every provider implements `LLMProvider` — swap them freely.

### OpenAI

```ts
import { OpenAIProvider } from 'confused-ai';

const llm = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  baseUrl: process.env.OPENAI_BASE_URL, // optional: Azure, proxies
});
```

### Anthropic

```ts
import { AnthropicProvider } from 'confused-ai';

const llm = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-opus-4-5',
});
```

### Google Gemini

```ts
import { GoogleProvider } from 'confused-ai';

const llm = new GoogleProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-2.0-flash',
});
```

### AWS Bedrock

```ts
import { BedrockConverseProvider } from 'confused-ai';

const llm = new BedrockConverseProvider({
  region: 'us-east-1',
  model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
});
```

### OpenRouter (multi-model gateway)

```ts
import { createOpenRouterProvider } from 'confused-ai';

const llm = createOpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: 'meta-llama/llama-3.3-70b-instruct',
});
```

### OpenAI-compatible providers

All share the same config shape — just different base URLs:

```ts
import {
  createGroqProvider,
  createXAIProvider,
  createDeepSeekProvider,
  createMistralProvider,
  createTogetherProvider,
  createFireworksProvider,
  createCohereProvider,
  createPerplexityProvider,
  createAzureOpenAIProvider,
} from 'confused-ai';

const groq    = createGroqProvider({ apiKey: process.env.GROQ_API_KEY, model: 'llama-3.3-70b-versatile' });
const xai     = createXAIProvider({ apiKey: process.env.XAI_API_KEY, model: 'grok-2-1212' });
const deepseek = createDeepSeekProvider({ apiKey: process.env.DEEPSEEK_API_KEY, model: 'deepseek-chat' });
const mistral = createMistralProvider({ apiKey: process.env.MISTRAL_API_KEY, model: 'mistral-large-latest' });

// Azure OpenAI
const azure = createAzureOpenAIProvider({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: 'https://my-resource.openai.azure.com',
  deployment: 'gpt-4o',
  apiVersion: '2024-12-01-preview',
});
```

### Model string shorthand

```ts
import { resolveModelString } from 'confused-ai';

// "gpt-4o"            → OpenAIProvider
// "claude-3-5-sonnet" → AnthropicProvider  
// "gemini-2.0-flash"  → GoogleProvider
// "groq/llama-3.3-70b"
// "openrouter/meta-llama/llama-3.3-70b"
// "ollama/mistral"    → local Ollama

const { provider } = resolveModelString('claude-opus-4-5', {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});
```

---

## LLM Router

Route each request to the best model by task type, cost, speed, or quality — with automatic fallback.

```ts
import { LLMRouter, createSmartRouter } from 'confused-ai';
import { OpenAIProvider, AnthropicProvider } from 'confused-ai';

const openai    = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o' });
const anthropic = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-opus-4-5' });

// Smart router: auto-selects model from prompt analysis
const router = createSmartRouter([
  { provider: openai,    model: 'gpt-4.1-nano',    capabilities: ['simple'],             costTier: 'nano',     speedTier: 'fast'   },
  { provider: openai,    model: 'gpt-4o-mini',     capabilities: ['simple', 'coding'],   costTier: 'small',    speedTier: 'fast'   },
  { provider: openai,    model: 'gpt-4o',          capabilities: ['coding', 'creative'], costTier: 'medium',   speedTier: 'medium' },
  { provider: anthropic, model: 'claude-opus-4-5', capabilities: ['reasoning'],          costTier: 'frontier', speedTier: 'slow'   },
]);

// Explicit strategy
const explicit = new LLMRouter({
  strategy: 'balanced', // 'quality' | 'cost' | 'speed' | 'balanced'
  entries: [/* same shape */],
});

// Use as a regular LLM provider anywhere
const ai = agent({ llmProvider: router, instructions: '...' });
```

---

## LLM Cache

Deduplicate identical requests — cut cost, reduce latency.

```ts
import { LLMCache } from 'confused-ai';
import { OpenAIProvider } from 'confused-ai';

const cache = new LLMCache({
  maxEntries: 1000,
  ttlMs: 60 * 60 * 1000, // 1 hour
});

const llm = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o' });

// Manual use
const key = { messages: [{ role: 'user', content: 'What is 2+2?' }], model: 'gpt-4o' };
const cached = cache.get(key);
if (cached) return cached;

const result = await llm.generateText(key.messages, {});
cache.set(key, result);

// Stats
const stats = cache.getStats();
// { hits: 42, misses: 8, hitRate: 0.84, entries: 50 }
```

---

## Context Window Manager

Auto-truncate or summarize messages when they approach the model's context limit.

```ts
import { ContextWindowManager, estimateTokenCount } from 'confused-ai';

const manager = new ContextWindowManager({
  model: 'gpt-4o',          // or set maxTokens directly
  strategy: 'summarize',    // 'truncate' | 'summarize' | 'sliding-window'
  reserveOutputTokens: 2000,
  llm: myLlmProvider,       // required for 'summarize' strategy
});

const fittingMessages = await manager.fit(messages);

// Estimate tokens
const count = estimateTokenCount('Hello world');
```

---

## Structured Output

Type-safe JSON from any LLM with Zod schema validation.

```ts
import { agent } from 'confused-ai';
import { z } from 'zod';

const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

const ai = agent({ model: 'gpt-4o-mini', instructions: 'Classify text.' });

const result = await ai.run('I love this product! Best purchase ever.', {
  responseModel: SentimentSchema,
});

const data = result.structuredOutput as z.infer<typeof SentimentSchema>;
// { sentiment: 'positive', confidence: 0.97, summary: 'Highly positive review.' }
```

Lower-level utilities:

```ts
import { extractJson, validateStructuredOutput, CommonSchemas } from 'confused-ai';

// Extract JSON from any LLM text (handles ```json fences, trailing commas, etc.)
const obj = extractJson('Here is the result: ```json\n{"ok": true}\n```');

// Validate against a Zod schema
const { validated, data, errors } = validateStructuredOutput(text, { schema: MySchema, strict: true });

// Pre-built schemas
CommonSchemas.yesNo       // z.object({ answer: z.enum(['yes','no']), reason: z.string() })
CommonSchemas.listOfItems // z.object({ items: z.array(z.string()) })
CommonSchemas.keyValue    // z.record(z.string())
CommonSchemas.sentiment   // z.object({ sentiment, confidence, explanation })
```

---

## Memory

Store and recall conversation history and long-term facts.

### In-memory (dev/test)

```ts
import { InMemoryStore } from 'confused-ai';

const memory = new InMemoryStore();
await memory.add({ role: 'user', content: 'My name is Bob.' });
const messages = await memory.getAll();
```

### Vector memory (semantic recall)

```ts
import { VectorMemoryStore, OpenAIEmbeddingProvider, InMemoryVectorStore } from 'confused-ai';

const memory = new VectorMemoryStore({
  embedder: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY }),
  vectorStore: new InMemoryVectorStore(), // or Pinecone/Qdrant/pgvector
  topK: 5,
});

await memory.add({ role: 'user', content: 'TypeScript was created at Microsoft.' });

// Semantic recall
const relevant = await memory.search('Who made TypeScript?');
```

### Cloud vector stores

```ts
import { PineconeVectorStore, QdrantVectorStore, PgVectorStore } from 'confused-ai';

const pinecone = new PineconeVectorStore({
  apiKey: process.env.PINECONE_API_KEY,
  index: 'my-agents',
  namespace: 'session-memory',
});

const qdrant = new QdrantVectorStore({
  url: process.env.QDRANT_URL,
  collectionName: 'memories',
});

const pg = new PgVectorStore({
  pool: myPgPool,
  tableName: 'embeddings',
  dimensions: 1536,
});
```

### Wire memory into an agent

```ts
const ai = agent({
  model: 'gpt-4o',
  instructions: 'You remember everything the user tells you.',
  memoryStore: memory,  // InMemoryStore or VectorMemoryStore
});
```

---

## Knowledge (RAG)

Retrieval-Augmented Generation — ingest documents, query them at runtime.

```ts
import { KnowledgeEngine, TextLoader, JSONLoader, CSVLoader, URLLoader } from 'confused-ai';
import { OpenAIEmbeddingProvider, InMemoryVectorStore } from 'confused-ai';

const engine = new KnowledgeEngine({
  embedder: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY }),
  vectorStore: new InMemoryVectorStore(),
  chunkSize: 500,
  chunkOverlap: 50,
  topK: 6,
});

// Ingest documents
await engine.addDocuments([
  { id: 'doc-1', content: 'confused-ai is a TypeScript agent framework.' },
  { id: 'doc-2', content: 'It supports OpenAI, Anthropic, Google, and Bedrock.' },
]);

// Load from files
const textDocs  = await new TextLoader('./docs/').load();
const jsonDocs  = await new JSONLoader('./data.json', { contentKey: 'text' }).load();
const csvDocs   = await new CSVLoader('./data.csv', { contentColumns: ['summary'] }).load();
const webDocs   = await new URLLoader('https://example.com/faq').load();

await engine.addDocuments([...textDocs, ...jsonDocs, ...csvDocs, ...webDocs]);

// Query manually
const results = await engine.query('How do I add tools?');

// Wire into agent — context is injected automatically before each run
const ai = agent({
  model: 'gpt-4o',
  instructions: 'Answer questions using the knowledge base.',
  knowledgebase: engine,
});
```

---

## Session Store

Persist conversation history across runs. Swap backend without changing agent code.

```ts
import { InMemorySessionStore, createSqliteSessionStore } from 'confused-ai';
import { SqlSessionStore, RedisSessionStore } from 'confused-ai';

// In-memory (dev)
const sessionStore = new InMemorySessionStore();

// SQLite (single-node production)
const sessionStore = createSqliteSessionStore('./data/sessions.db');

// PostgreSQL
const sessionStore = new SqlSessionStore({ connectionString: process.env.DATABASE_URL });

// Redis
const sessionStore = new RedisSessionStore({
  url: process.env.REDIS_URL,
  keyPrefix: 'agent:session:',
  ttlSeconds: 86400, // 1 day
});

// Wire into agent
const ai = agent({ model: 'gpt-4o', instructions: '...', sessionStore });

// Session lifecycle
const sessionId = await ai.createSession('user-42');
await ai.run('Remember: my timezone is PST', { sessionId });
const messages = await ai.getSessionMessages(sessionId);
```

### Redis LLM Cache (session-aware)

```ts
import { RedisLlmCache } from 'confused-ai';

const cache = new RedisLlmCache({
  url: process.env.REDIS_URL,
  ttlSeconds: 3600,
  keyPrefix: 'llm:cache:',
});
```

---

## Storage

Generic typed key-value store. Back it with memory, file system, or any custom adapter.

```ts
import { createStorage, MemoryStorageAdapter, FileStorageAdapter } from 'confused-ai';

// In-memory
const store = createStorage();

// File-based (persists to disk)
const store = createStorage({ driver: 'file', basePath: './data' });

// Custom adapter (S3, Redis, PlanetScale, etc.)
const store = createStorage({ adapter: myCustomAdapter });

// Usage
await store.set('config:user-1', { plan: 'pro', locale: 'en-US' }, /* ttl seconds */ 3600);
const config = await store.get<{ plan: string }>('config:user-1');
const keys   = await store.list('config:');
const exists = await store.has('config:user-1');
await store.delete('config:user-1');
await store.clear();

// Implement your own adapter
class MyS3Adapter implements StorageAdapter {
  async get(key: string) { /* ... */ }
  async set(key: string, value: string, ttl?: number) { /* ... */ }
  async delete(key: string) { /* ... */ }
  async list(prefix?: string) { /* ... */ }
  async has(key: string) { /* ... */ }
}
```

---

## Orchestration

Multi-agent coordination patterns.

### Pipeline — sequential stages

```ts
import { createPipeline, createRunnableAgent } from 'confused-ai';

const researcher = createRunnableAgent({ name: 'Researcher', agent: researchAgent });
const writer     = createRunnableAgent({ name: 'Writer',     agent: writerAgent });
const reviewer   = createRunnableAgent({ name: 'Reviewer',   agent: reviewerAgent });

const pipeline = createPipeline({
  name: 'ContentPipeline',
  agents: [researcher, writer, reviewer],
  passOutputAsInput: true,
});

const result = await pipeline.run('Write a 500-word blog post about WebAssembly');
```

### Supervisor — delegate and coordinate

```ts
import { createSupervisor, createRole } from 'confused-ai';

const supervisor = createSupervisor({
  name: 'Manager',
  llmProvider: myLlm,
  roles: [
    createRole({ name: 'Researcher', agent: researchAgent, description: 'Finds information' }),
    createRole({ name: 'Analyst',    agent: analystAgent,  description: 'Analyses data' }),
    createRole({ name: 'Writer',     agent: writerAgent,   description: 'Writes reports' }),
  ],
});

const result = await supervisor.run('Produce a market analysis report for EV batteries');
```

### Swarm — parallel sub-tasks

```ts
import { createSwarm, createSwarmAgent } from 'confused-ai';

const swarm = createSwarm({
  name: 'ResearchSwarm',
  orchestratorLlm: myLlm,
  agents: [
    createSwarmAgent({ name: 'WebAgent',  agent: webAgent  }),
    createSwarmAgent({ name: 'DataAgent', agent: dataAgent }),
  ],
  maxParallel: 4,
});

const result = await swarm.run('Compile a comprehensive report on quantum computing in 2025');
// result.subtaskResults — individual agent outputs
// result.synthesis     — merged final answer
```

### Team — group agents with a shared goal

```ts
import { Team, createResearchTeam, createDecisionTeam } from 'confused-ai';

// Built-in team presets
const team = createResearchTeam({ agents: [agent1, agent2, agent3], llm: myLlm });
// or
const team = createDecisionTeam({ agents: [expert1, expert2], llm: myLlm });

const result = await team.run('Should we migrate from REST to GraphQL?');
```

### AgentRouter — capability-based routing

```ts
import { createAgentRouter } from 'confused-ai';

const router = createAgentRouter({
  agents: {
    legal:   { agent: legalAgent,   capabilities: ['legal', 'contracts'],   description: 'Legal queries' },
    finance: { agent: financeAgent, capabilities: ['finance', 'accounting'], description: 'Finance queries' },
    hr:      { agent: hrAgent,      capabilities: ['hr', 'hiring'],          description: 'HR queries'      },
  },
  fallbackAgent: generalAgent,
});

const result = await router.route('What is the standard notice period?');
// Automatically routed to hrAgent
```

### Handoff — structured agent-to-agent pass

```ts
import { createHandoff } from 'confused-ai';

const handoff = createHandoff({
  fromAgent: 'Triage',
  toAgent:   'Specialist',
  reason:    'Requires domain expertise',
});

const result = await handoff.execute({
  task: 'Diagnose this database query plan',
  context: { queryPlan: '...' },
  targetAgent: specialistAgent,
});
```

### Consensus — multi-agent voting

```ts
import { createConsensus } from 'confused-ai';

const consensus = createConsensus({
  agents: [model1, model2, model3],
  strategy: 'majority', // 'majority' | 'unanimous' | 'weighted'
  threshold: 0.6,
});

const result = await consensus.decide('Is this code production-ready?', codeSnippet);
// result.decision — final answer
// result.votes    — per-agent votes
// result.agreement — 0-1 agreement score
```

### MessageBus — event-driven agent communication

```ts
import { MessageBusImpl } from 'confused-ai';

const bus = new MessageBusImpl();

bus.subscribe('task.complete', async (message) => {
  console.log('Task done:', message.payload);
});

await bus.publish({ topic: 'task.complete', payload: { result: 'done' } });
```

---

## Guardrails

Safety layer — validate inputs, outputs, tool calls, and detect threats.

```ts
import {
  GuardrailValidator,
  createAllowlistRule,
  createSensitiveDataRule,
  createUrlValidationRule,
  createPiiDetectionRule,
  createOpenAiModerationRule,
  createPromptInjectionRule,
  createForbiddenTopicsRule,
  createContentRule,
  createToolAllowlistRule,
  createMaxLengthRule,
  detectPii,
  detectPromptInjection,
} from 'confused-ai';

const guardrails = new GuardrailValidator({
  rules: [
    // Block outputs containing PII
    createPiiDetectionRule({ block: true, types: ['email', 'phone', 'ssn', 'credit_card'] }),

    // Detect and block prompt injection attempts
    createPromptInjectionRule({ threshold: 0.7 }),

    // Block forbidden topics
    createForbiddenTopicsRule({ topics: ['competitor-names', 'internal-pricing'] }),

    // Restrict which tools can be called
    createToolAllowlistRule(['web_search', 'calculator']),

    // Cap output length
    createMaxLengthRule(4000),

    // Block outputs with sensitive data patterns (API keys, private keys, etc.)
    createSensitiveDataRule(),

    // Restrict URLs the agent may request
    createUrlValidationRule({ allowedHosts: ['api.github.com', 'api.openai.com'] }),
  ],
});

// Wire into agent
const ai = agent({
  model: 'gpt-4o',
  instructions: '...',
  guardrailAdapter: guardrails,
});

// Use standalone
const pii = detectPii('Call me at 415-555-1234', { redact: true });
// { found: true, types: ['phone'], redacted: 'Call me at [REDACTED:PHONE]' }

const injection = detectPromptInjection('Ignore previous instructions and...');
// { isInjection: true, score: 0.92, signals: [...] }
```

### OpenAI Moderation

```ts
import { createOpenAiModerationRule } from 'confused-ai';

const moderation = createOpenAiModerationRule({
  apiKey: process.env.OPENAI_API_KEY,
  thresholds: { hate: 0.5, 'self-harm': 0.3 },
  failOpen: false, // fail-closed if API is down
});
```

---

## Graph Engine

Execute complex, stateful multi-agent workflows as a **directed acyclic graph (DAG)**. Supports topological scheduling, parallel execution, event sourcing, durable resume, and distributed workers.

```ts
import { createGraph, DAGEngine, DurableExecutor, NodeKind, InMemoryEventStore, SqliteEventStore, computeWaves, BackpressureController } from 'confused-ai/graph';
```

### Building and running a graph

```ts
import { createGraph, DAGEngine, NodeKind } from 'confused-ai/graph';

const graph = createGraph('my-pipeline')
  .addNode({ id: 'fetch',   kind: NodeKind.TASK, execute: async (ctx) => ({ data: 'hello' }) })
  .addNode({ id: 'process', kind: NodeKind.TASK, execute: async (ctx) => ({ result: (ctx.state['fetch'] as { data: string }).data.toUpperCase() }) })
  .chain('fetch', 'process')
  .build();

const engine = new DAGEngine(graph, new InMemoryEventStore());
const result = await engine.execute();
```

### `confused-ai/graph` exports

| Export | Description |
|--------|-------------|
| `createGraph(id)` | Fluent `GraphBuilder` — add nodes, edges, then `.build()` |
| `DAGEngine` | Core executor — `new DAGEngine(graph, eventStore)`, `.execute(options?)` |
| `DurableExecutor` | Persistence wrapper — `.run()` + `.resume(executionId)` |
| `replayState` | Replay stored events to reconstruct graph state |
| `NodeKind` | Enum: `TASK`, `AGENT`, `DECISION`, `SUBGRAPH`, `PARALLEL`, `JOIN` |
| `InMemoryEventStore` | Dev/test event store — events lost on restart |
| `SqliteEventStore` | Durable event store — `SqliteEventStore.create(path)` |
| `computeWaves(graph)` | Topological level assignment → `NodeId[][]` |
| `BackpressureController` | Semaphore for concurrency control |
| `DistributedEngine` | DAGEngine with task-queue dispatch for distributed workers |
| `InMemoryTaskQueue` | In-process task queue for `DistributedEngine` |
| `RedisTaskQueue` | Redis-backed task queue (requires ioredis peer dep) |
| `GraphWorker` | Worker process that polls a task queue and executes nodes |
| `MultiAgentOrchestrator` | Orchestrates an agent graph using `agentNode` definitions |
| `agentNode(id, agent, opts?)` | Creates a graph node backed by a `Confused-AIAgent` |
| `TelemetryPlugin` | Emits OTLP spans per node execution |
| `LoggingPlugin` | Logs node lifecycle events |
| `AuditPlugin` | Writes per-node entries to an `AuditStore` |
| `RateLimitPlugin` | Applies per-node rate limiting via a `RateLimiter` |

### Durable execution

```ts
import { DurableExecutor, SqliteEventStore } from 'confused-ai/graph';

const store    = SqliteEventStore.create('./graph-events.db');
const executor = new DurableExecutor(graph, store);

const result = await executor.run({ variables: { input: 'hello' } });
// On restart / failure:
const resumed = await executor.resume(result.executionId);
```

### Wave scheduling and backpressure

```ts
import { computeWaves, BackpressureController } from 'confused-ai/graph';

const waves = computeWaves(graph); // [['a','b'], ['c'], ['d']]

const bp = new BackpressureController(4);
await bp.acquire();   // waits if 4 already in-flight
// ... do work ...
bp.release();
console.log(bp.inflight, bp.queueDepth);
```

### CLI commands for graph runs

| Command | Description |
|---------|-------------|
| `confused-ai replay --run-id <id> [--db path] [--json] [--from seq]` | Stream event timeline for a past run |
| `confused-ai inspect --run-id <id> [--db path]` | Per-node execution summary (status, retries, duration) |
| `confused-ai export --run-id <id> [--db path] [--out file] [--pretty]` | Export events to JSON |
| `confused-ai diff --run-id-a <id> --run-id-b <id> [--db path]` | Compare two runs node-by-node; exits `1` if divergent |

---

## Observability

### Console logger (dev)

```ts
import { ConsoleLogger } from 'confused-ai';

const logger = new ConsoleLogger({ level: 'debug', prefix: 'MyAgent' });

logger.info('Agent started', { agentId: 'abc' });
logger.debug('Tool called', { tool: 'web_search', args: { query: '...' } });
logger.error('Run failed', { error: 'timeout' });
```

### Tracer

```ts
import { InMemoryTracer } from 'confused-ai';

const tracer = new InMemoryTracer();

const span = tracer.startSpan('agent.run', { agentId: 'abc' });
// ... run agent ...
tracer.endSpan(span.id, { steps: 3, tokens: 450 });

const spans = tracer.getSpans();
```

### OTLP Export (Jaeger / Tempo / Datadog)

```ts
import { OTLPTraceExporter, OTLPMetricsExporter } from 'confused-ai';

const traceExporter = new OTLPTraceExporter({
  endpoint: 'http://jaeger:4318/v1/traces',
  headers: { Authorization: `Bearer ${process.env.OTLP_TOKEN}` },
  serviceName: 'my-agent-app',
});

const metricsExporter = new OTLPMetricsExporter({
  endpoint: 'http://prometheus:4318/v1/metrics',
  serviceName: 'my-agent-app',
});

await traceExporter.export(spans);
```

### Langfuse / LangSmith ingest

```ts
import { sendLangfuseBatch, sendLangSmithRunBatch } from 'confused-ai';

await sendLangfuseBatch({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: 'https://cloud.langfuse.com',
}, traceEvents);

await sendLangSmithRunBatch({
  apiKey: process.env.LANGSMITH_API_KEY,
  projectName: 'my-agents',
}, runs);
```

### Metrics

```ts
import { MetricsCollectorImpl } from 'confused-ai';

const metrics = new MetricsCollectorImpl();

metrics.increment('agent.run.start');
metrics.histogram('agent.run.latency', 320, { model: 'gpt-4o' });
metrics.gauge('agent.active_sessions', 12);

const snapshot = metrics.getSnapshot();
```

### LLM-as-Judge eval

```ts
import { runLlmAsJudge, createMultiCriteriaJudge, runEvalBatch, AGENT_CRITERIA } from 'confused-ai';

// Single score
const result = await runLlmAsJudge({
  llm: judgeModel,
  rubric: 'Is the response accurate and concise?',
  candidate: agentResponse,
  reference: expectedAnswer,
  maxScore: 10,
});
// { score: 8, rationale: 'Accurate but slightly verbose.' }

// Multi-criteria
const judge = createMultiCriteriaJudge({
  llm: judgeModel,
  criteria: AGENT_CRITERIA, // relevance, groundedness, conciseness, safety
});

const multiResult = await judge.judge({
  prompt: userPrompt,
  candidate: agentOutput,
  reference: groundTruth,
});
// { scores: { relevance: 9, groundedness: 8, ... }, overall: 8.5 }

// Batch eval
const summary = await runEvalBatch({
  llm: judgeModel,
  cases: evalDataset,
  rubric: 'Evaluate customer support quality',
});
// { passed: 42, failed: 3, averageScore: 8.1, cases: [...] }
```

### Text metrics (no LLM needed)

```ts
import { ExactMatchAccuracy, PartialMatchAccuracy, wordOverlapF1, rougeLWords } from 'confused-ai';

const exact   = new ExactMatchAccuracy();
const partial = new PartialMatchAccuracy();

exact.score('Paris', 'Paris');    // 1.0
exact.score('Paris', 'France');   // 0.0
partial.score('The capital of France is Paris', 'Paris'); // > 0

wordOverlapF1('the cat sat',   'the cat sat on the mat');  // F1 score
rougeLWords('the cat sat on',  'the cat sat on the mat');  // ROUGE-L
```

---

## Production Resilience

### Circuit Breaker

Prevent cascading failures when a dependency is down.

```ts
import { CircuitBreaker, createLLMCircuitBreaker } from 'confused-ai';

// General circuit breaker
const breaker = new CircuitBreaker({
  name: 'openai-api',
  failureThreshold: 5,    // open after 5 failures
  resetTimeoutMs: 30_000, // retry after 30s
  successThreshold: 2,    // close after 2 successes in half-open
});

const result = await breaker.execute(() => llm.generateText(messages, {}));

// Pre-built LLM breaker
const llmBreaker = createLLMCircuitBreaker(myLlmProvider, {
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
});
```

### Rate Limiter

```ts
import { RateLimiter, createOpenAIRateLimiter } from 'confused-ai';

const limiter = new RateLimiter({
  name: 'openai',
  maxRequests: 100,
  intervalMs: 60_000,   // 100 rpm
  overflowMode: 'queue', // queue requests instead of rejecting
  maxQueueSize: 50,
});

await limiter.execute(() => llm.generateText(messages, {}));

// Available tokens
console.log(limiter.getAvailableTokens()); // e.g. 87

// Pre-built
const openaiLimiter = createOpenAIRateLimiter(); // 60 rpm default
```

### Redis Rate Limiter (distributed)

```ts
import { RedisRateLimiter } from 'confused-ai';

const limiter = new RedisRateLimiter({
  redis: redisClient,
  keyPrefix: 'ratelimit:agent:',
  maxRequests: 100,
  windowMs: 60_000,
});
```

### `withResilience` — one-line production hardening

```ts
import { withResilience } from 'confused-ai';

const ai = agent({ model: 'gpt-4o', instructions: '...' });

const resilient = withResilience(ai, {
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
  rateLimit: { maxRpm: 60 },
  healthCheck: true,
  gracefulShutdown: true,
});

const result = await resilient.run('Hello');

// Health snapshot
const health = resilient.health();
// { status: 'healthy', circuitState: 'closed', totalRuns: 120, averageLatencyMs: 310 }
```

### Health Checks

```ts
import {
  HealthCheckManager,
  createLLMHealthCheck,
  createSessionStoreHealthCheck,
  createHttpHealthCheck,
  createCustomHealthCheck,
} from 'confused-ai';

const health = new HealthCheckManager({
  version: '1.2.0',
  components: [
    createLLMHealthCheck(llmProvider),
    createSessionStoreHealthCheck(sessionStore),
    createHttpHealthCheck('postgres', { url: 'http://db:5432/health' }),
    createCustomHealthCheck('my-api', async () => {
      const ok = await myApi.ping();
      return { status: ok ? 'HEALTHY' : 'UNHEALTHY' };
    }),
  ],
});

// Kubernetes-compatible endpoint
app.get('/health', async (_req, res) => {
  const result = await health.check();
  res.status(result.status === 'HEALTHY' ? 200 : 503).json(result);
});
```

### Graceful Shutdown

```ts
import { createGracefulShutdown, withShutdownGuard } from 'confused-ai';

const shutdown = createGracefulShutdown({
  timeoutMs: 10_000,
  onShutdown: async () => {
    await sessionStore.close();
    await db.end();
  },
});

shutdown.register(); // hooks process SIGTERM / SIGINT

// Guard async work — tracks in-flight requests
const result = await withShutdownGuard(shutdown, () => ai.run(prompt));
```

### Resumable Streaming

Resume interrupted SSE streams without re-running the agent.

```ts
import { createResumableStream, formatSSE } from 'confused-ai';

const stream = createResumableStream({
  id: 'run-abc123',
  onChunk: (chunk) => {
    // Send to client
    res.write(formatSSE(chunk));
  },
  checkpointInterval: 5, // checkpoint every 5 chunks
});

await stream.run(() => ai.run(prompt, { onChunk: stream.push }));

// Client reconnects with ?lastChunkId=42 → stream resumes from checkpoint
```

---

## Plugins

Cross-cutting concerns applied globally to all agents.

```ts
import { createPluginRegistry, createLoggingPlugin } from 'confused-ai';

const plugins = createPluginRegistry();

// Built-in logging plugin
plugins.register(createLoggingPlugin());

// Custom plugin
plugins.register({
  id: 'my-analytics',
  name: 'Analytics',
  version: '1.0.0',

  beforeRun(input, context) {
    analytics.track('agent.run.start', { agentId: context.agentId });
    return input; // return (possibly modified) input
  },

  afterRun(output, context) {
    analytics.track('agent.run.end', { state: output.state });
    return output;
  },

  toolMiddleware: {
    beforeExecute(tool, params) { /* intercept every tool call */ },
    afterExecute(tool, result)  { /* intercept every tool result */ },
    onError(tool, error)        { /* intercept every tool error */ },
  },

  onError(error, context) {
    errorTracker.capture(error, { agentId: context.agentId });
  },
});

// Inspect
plugins.list();                    // Plugin[]
plugins.unregister('my-analytics');
```

---

## Learning (User Profiles)

Persist user preferences and knowledge across sessions.

```ts
import { InMemoryUserProfileStore, LearningMode } from 'confused-ai';

const profiles = new InMemoryUserProfileStore();

// Create or update a profile
await profiles.set({
  userId: 'user-123',
  agentId: 'support-bot',
  displayName: 'Alice',
  preferences: { language: 'en', tone: 'casual', timezone: 'PST' },
  metadata: { plan: 'pro', signupDate: '2025-01-01' },
});

// Get profile
const profile = await profiles.get('user-123', 'support-bot');

// Query profiles
const allProfiles = await profiles.list({ agentId: 'support-bot', limit: 100 });

// Update
await profiles.update('user-123', { preferences: { tone: 'formal' } }, 'support-bot');

// Delete
await profiles.delete('user-123');
```

Learning modes:

```ts
import { LearningMode } from 'confused-ai';

LearningMode.ALWAYS   // auto-persist every interaction
LearningMode.AGENTIC  // agent decides when to store (via explicit tool calls)
```

---

## Background Queues

Dispatch long-running hook work to an external queue backend instead of running it in the agentic loop.

> **Full guide:** [Background Queues](./background-queues.md)

```ts
import { queueHook, InMemoryBackgroundQueue } from 'confused-ai/background';

const queue = new InMemoryBackgroundQueue({ concurrency: 5 });

const ai = agent({
  model: 'gpt-4o',
  instructions: '...',
  hooks: {
    afterRun: queueHook(queue, 'analytics', (result) => ({
      steps: result.steps,
      tokens: result.usage?.totalTokens,
    })),
  },
});

await queue.consume('analytics', async (task) => {
  await db.insert('runs', task.payload);
});
```

Swap `InMemoryBackgroundQueue` for any production backend:

```ts
import { BullMQBackgroundQueue }       from 'confused-ai/background'; // Redis (recommended)
import { KafkaBackgroundQueue }         from 'confused-ai/background'; // Kafka
import { RabbitMQBackgroundQueue }      from 'confused-ai/background'; // AMQP
import { SQSBackgroundQueue }           from 'confused-ai/background'; // AWS SQS
import { RedisPubSubBackgroundQueue }   from 'confused-ai/background'; // Redis Pub/Sub

const queue = new BullMQBackgroundQueue({
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
});
```

---

## Voice (TTS & STT)

Text-to-speech and speech-to-text via OpenAI or ElevenLabs.

> **Full guide:** [Voice](./voice.md)

```ts
import { createVoiceProvider } from 'confused-ai/voice';

const voice = createVoiceProvider(); // auto-selects from env

// TTS
const { audioBuffer, mimeType } = await voice.textToSpeech('Hello!', { voice: 'nova' });
await writeFile('response.mp3', audioBuffer);

// STT
const { text } = await voice.speechToText(audioBuffer, { language: 'en' });
console.log(text);
```

Providers:

```ts
import { OpenAIVoiceProvider }     from 'confused-ai/voice'; // tts-1, tts-1-hd, whisper-1
import { ElevenLabsVoiceProvider } from 'confused-ai/voice'; // premium voices, voice cloning
```

---

## Budget Enforcement

Hard USD caps per run, per user (daily), or globally (monthly).

```ts
import { createAgent } from 'confused-ai';

const agent = createAgent({
  name: 'Safe',
  budget: {
    maxUsdPerRun:   0.50,
    maxUsdPerUser:  10.00,   // requires BudgetStore for persistence
    maxUsdPerMonth: 500.00,
    onExceeded:     'throw', // 'throw' | 'warn' | 'truncate'
  },
});
```

```ts
import { BudgetExceededError, InMemoryBudgetStore } from 'confused-ai/guard';
import type { BudgetStore, BudgetConfig } from 'confused-ai/guard';
```

See [Production — Budget enforcement](./production.md#budget-enforcement).

---

## Agent Checkpointing

Survive process restarts mid-execution. The agentic runner saves state after each step.

```ts
import { createAgent } from 'confused-ai';
import { createSqliteCheckpointStore } from 'confused-ai/guard';

const agent = createAgent({
  name: 'LongTask',
  instructions: '...',
  checkpointStore: createSqliteCheckpointStore('./agent.db'),
});

// Stable runId → resume from last step if restarted
const result = await agent.run('Process 500 records', { runId: 'batch-001' });
```

```ts
import { InMemoryCheckpointStore, SqliteCheckpointStore, createSqliteCheckpointStore } from 'confused-ai/guard';
import type { AgentCheckpointStore, AgentRunState } from 'confused-ai/guard';
```

---

## Idempotency

Prevent duplicate side-effects on client retries.

```ts
import { createHttpService } from 'confused-ai/serve';
import { createSqliteIdempotencyStore } from 'confused-ai/guard';

createHttpService({
  agents: { assistant },
  idempotency: {
    store: createSqliteIdempotencyStore('./agent.db'),
    ttlMs: 24 * 60 * 60 * 1000,
  },
});
```

Clients send `X-Idempotency-Key: <unique-key>` — retries replay the cached response without re-running the agent.

```ts
import { InMemoryIdempotencyStore } from 'confused-ai/guard';
import type { IdempotencyStore, IdempotencyOptions } from 'confused-ai/guard';
```

---

## Audit Log

Persistent, queryable audit trail for every agent run (SOC 2 / HIPAA).

```ts
import { createHttpService } from 'confused-ai/serve';
import { createSqliteAuditStore } from 'confused-ai/guard';

createHttpService({
  agents: { assistant },
  auditStore: createSqliteAuditStore('./agent.db'),
});

// Query
const entries = await auditStore.query({
  agentName: 'assistant',
  userId: 'user-42',
  since: new Date('2025-01-01'),
  limit: 100,
});
```

```ts
import { InMemoryAuditStore } from 'confused-ai/guard';
import type { AuditStore, AuditEntry, AuditFilter } from 'confused-ai/guard';
```

---

## Human-in-the-Loop (HITL)

Pause execution at high-risk tool calls and require a human decision.

> **Full guide:** [HITL](./hitl.md)

```ts
import { createSqliteApprovalStore, waitForApproval, ApprovalRejectedError } from 'confused-ai/guard';

const approvalStore = createSqliteApprovalStore('./agent.db');

// Build a gate tool that blocks until a human approves
const requestApproval = defineTool()
  .name('requestApproval')
  .description('Request human approval before a risky action')
  .parameters(z.object({ toolName: z.string(), description: z.string(), riskLevel: z.enum(['low','medium','high','critical']) }))
  .execute(async ({ toolName, description, riskLevel }, ctx) => {
    const req = await approvalStore.create({ runId: ctx.runId ?? 'run', agentName: 'Agent', toolName, toolArguments: {}, riskLevel, description });
    await waitForApproval(approvalStore, req.id); // blocks until decision
    return { approved: true };
  })
  .build();
```

The HTTP runtime auto-exposes:
- `GET  /v1/approvals` — list pending approvals
- `POST /v1/approvals/:id` — submit a decision

```ts
import { InMemoryApprovalStore, ApprovalRejectedError, waitForApproval } from 'confused-ai/guard';
import type { ApprovalStore, HitlRequest, ApprovalDecision, ApprovalStatus } from 'confused-ai/guard';
```

---

## Multi-Tenancy

Per-tenant isolation for sessions, rate limits, and cost tracking.

> **Full guide:** [Multi-Tenancy](./multi-tenancy.md)

```ts
import { createTenantContext } from 'confused-ai/guard';

const ctx = createTenantContext('tenant-acme', {
  sessionStore: baseSessionStore,
  rateLimitConfig: { maxRequests: 100, intervalMs: 60_000 },
});

const agent = createAgent({
  name: 'Support',
  sessionStore: ctx.sessionStore, // all keys prefixed with 'tenant-acme:'
});
```

```ts
import { TenantScopedSessionStore } from 'confused-ai/guard';
import type { TenantContext, TenantConfig, TenantContextOptions } from 'confused-ai/guard';
```

---

## Extensions

Utilities for wiring the framework into larger systems. Import from `confused-ai` (main barrel) or `confused-ai/extensions`.

### Tool logging middleware

```ts
import { createLoggingToolMiddleware } from 'confused-ai';
// or: import { createLoggingToolMiddleware } from 'confused-ai/extensions';

const logMiddleware = createLoggingToolMiddleware((msg, meta) => {
  logger.info(msg, meta);
});

const ai = agent({
  model: 'gpt-4o',
  instructions: '...',
  toolMiddleware: [logMiddleware],
});
```

### Wrap a high-level agent for orchestration

```ts
import { wrapAgentForOrchestration } from 'confused-ai';
// or: import { wrapAgentForOrchestration } from 'confused-ai/extensions';

const highLevelAgent = agent({ name: 'Researcher', instructions: '...' });
const coreAgent = wrapAgentForOrchestration(highLevelAgent);

// Now usable in Orchestrator, Pipeline, Supervisor
const pipeline = createPipeline({ agents: [coreAgent, writerCoreAgent] });
```

---

## DX — Minimal & Fluent Agent APIs

The `confused-ai/dx` subpath exposes the best-DX entry points. Everything here is also re-exported from the main `confused-ai` barrel.

```ts
import { agent, bare, defineAgent, compose, pipe, definePersona } from 'confused-ai/dx';
import { createDevLogger, createDevToolMiddleware }                from 'confused-ai/dx';
```

| Export | Purpose |
|---|---|
| `agent(opts)` | One-line agent factory — resolves LLM from env, wires defaults |
| `bare(opts)` | Zero-defaults agent — bring your own everything |
| `defineAgent()` | Fluent builder: `.instructions().model().use().hooks().dev().build()` |
| `compose(a, b)` | Sequential pipeline of two agents |
| `pipe(a).then(b).run(prompt)` | Stepwise pipeline builder |
| `definePersona(opts)` | Reusable persona definition |
| `buildPersonaInstructions(p)` | Render a persona into a system prompt string |
| `createDevLogger()` | Pretty-print all LLM steps to stdout |
| `createDevToolMiddleware()` | Log tool calls in dev mode |

---

## SDK — Typed Agents & Workflows

The `confused-ai/sdk` subpath provides typed agent definitions, multi-step workflows, and orchestration adapters.

```ts
import { defineAgent, createWorkflow, asOrchestratorAgent } from 'confused-ai/sdk';
import type { AgentDefinitionConfig, WorkflowStep, WorkflowResult } from 'confused-ai/sdk';
```

### `defineAgent` (typed)

```ts
import { defineAgent } from 'confused-ai/sdk';

const ResearchAgent = defineAgent({
  name: 'Researcher',
  instructions: 'You are a research specialist.',
  tools: [new TavilySearchTool({ apiKey: process.env.TAVILY_API_KEY })],
});

// From the main barrel, `defineTypedAgent` is the SDK version to avoid name collision
import { defineTypedAgent } from 'confused-ai';
```

### `createWorkflow`

```ts
import { createWorkflow } from 'confused-ai/sdk';

const workflow = createWorkflow({
  name: 'ResearchAndWrite',
  steps: [
    { name: 'Research', agent: researchAgent },
    { name: 'Write',    agent: writerAgent, dependsOn: ['Research'] },
    { name: 'Review',   agent: reviewAgent, dependsOn: ['Write'] },
  ],
});

const result = await workflow.run('Write a report on quantum computing in 2025');
```

```ts
import { createLoggingToolMiddleware } from 'confused-ai';

const logMiddleware = createLoggingToolMiddleware((msg, meta) => {
  logger.info(msg, meta);
});

const ai = agent({
  model: 'gpt-4o',
  instructions: '...',
  toolMiddleware: [logMiddleware],
});
```

### Wrap a high-level agent for orchestration

```ts
import { wrapAgentForOrchestration } from 'confused-ai';

const highLevelAgent = agent({ name: 'Researcher', instructions: '...' });
const coreAgent = wrapAgentForOrchestration(highLevelAgent);

// Now usable in Orchestrator, Pipeline, Supervisor
const pipeline = createPipeline({ agents: [coreAgent, writerCoreAgent] });
```

---

## Testing Utilities

Build fast, deterministic agent tests without calling real LLM APIs.

```ts
import { MockLLMProvider, MockSessionStore } from 'confused-ai';
import { createAgent } from 'confused-ai';

// Deterministic responses
const mockLlm = new MockLLMProvider({
  response: 'Mocked answer',
  // or per-prompt map:
  responses: new Map([
    ['What is 2+2?', '4'],
    ['Who are you?', 'I am a test agent.'],
  ]),
  delay: 50,   // simulate latency
});

// Simulate tool calls
const toolCallMock = new MockLLMProvider({
  toolCalls: [{ id: 'call-1', name: 'web_search', arguments: { query: 'TypeScript 5.5' } }],
});

// Simulate errors
const errorMock = new MockLLMProvider({ shouldError: true });

// In-memory session store for tests
const mockSession = new MockSessionStore();

// Wire into agent
const agent = createAgent({
  name: 'Test Agent',
  instructions: 'Test',
  llmProvider: mockLlm,
  sessionStore: mockSession,
});

const result = await agent.run('What is 2+2?');
assert.equal(result.text, '4');

// Inspect calls
console.log(mockLlm.getCallCount()); // 1
```

### Graph testing utilities

Test graphs without hitting real LLMs or external services:

```ts
import {
  createTestRunner,
  createMockLLMProvider,
  expectEventSequence,
  assertExactEventSequence,
} from 'confused-ai/test';
import { GraphEventType } from 'confused-ai/graph';

const runner = createTestRunner({ maxConcurrency: 2 });
const result = await runner.run(graph, { input: 'hello' });

// result.eventTypes — ordered list of GraphEventType values emitted
expectEventSequence(result.eventTypes, [
  GraphEventType.EXECUTION_STARTED,
  GraphEventType.NODE_COMPLETED,
  GraphEventType.EXECUTION_COMPLETED,
]);

// Exact matching (no extra events allowed)
assertExactEventSequence(result.eventTypes, [
  GraphEventType.EXECUTION_STARTED,
  GraphEventType.NODE_STARTED,
  GraphEventType.NODE_COMPLETED,
  GraphEventType.EXECUTION_COMPLETED,
]);

// Mock LLM for agent nodes
const llm = createMockLLMProvider('mock', [
  { content: 'Response 1' },
  { content: 'Response 2', toolCalls: [{ id: 't1', name: 'search', arguments: { q: 'foo' } }] },
]);
```

---

## Artifacts

Create typed output artifacts alongside the text response.

```ts
import { createMarkdownArtifact, createTextArtifact } from 'confused-ai';

const mdArtifact = createMarkdownArtifact('report', '# My Report\n\n...');
// {
//   name: 'report',
//   type: 'markdown',
//   content: '# My Report\n\n...',
//   mimeType: 'text/markdown',
// }

// result.markdown from agent.run() is already a markdown artifact:
const result = await ai.run('Generate a report');
await writeFile(result.markdown.name, result.markdown.content);
```

---

## Adapters

Swap any backend via adapter bindings without changing agent code.

```ts
import { agent } from 'confused-ai';

const ai = agent({
  model: 'gpt-4o',
  instructions: '...',

  // Individual adapter fields (convenience)
  sessionStoreAdapter: myRedisSessionStore,
  memoryStoreAdapter:  myPgVectorStore,
  guardrailAdapter:    myGuardrailEngine,
  ragAdapter:          myKnowledgeEngine,

  // Or pass a registry
  adapters: myAdapterRegistry,
});
```

Build an adapter registry for shared configuration across multiple agents:

```ts
import { createAdapterRegistry } from 'confused-ai/adapters';

const registry = createAdapterRegistry({
  sessionStore: redisSessionStore,
  memoryStore:  pgVectorStore,
  guardrail:    guardrails,
});

const agent1 = agent({ model: 'gpt-4o', instructions: '...', adapters: registry });
const agent2 = agent({ model: 'claude-opus-4-5', instructions: '...', adapters: registry });
```

---

## Configuration

Load and validate config from environment variables.

```ts
import { loadConfig, validateConfig } from 'confused-ai';

const config = loadConfig(); // reads process.env

// config.llm    → { provider, apiKey, model, baseUrl }
// config.server → { port, corsOrigins, nodeEnv }
// config.db     → { type, connectionString, ... }
// config.session
// config.logging
// config.resilience

// Validate a partial config object
const errors = validateConfig({ llm: { provider: 'openai', apiKey: '' } });
```

Environment variables recognized:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `openai` | `openai` \| `openrouter` \| `ollama` |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o` | Model name |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `GOOGLE_API_KEY` | — | Google Gemini API key |
| `PORT` | `3001` | HTTP server port |
| `NODE_ENV` | `development` | Environment |
| `DB_TYPE` | `sqlite` | `sqlite` \| `postgres` \| `memory` |
| `DATABASE_URL` | — | Postgres connection string |
| `REDIS_URL` | — | Redis connection string |

---

## Module Import Map

Quick reference for every named export location:

```ts
// Core agent factory
import { agent, createAgent }           from 'confused-ai';

// LLM providers
import { OpenAIProvider, AnthropicProvider, GoogleProvider, BedrockConverseProvider } from 'confused-ai';
import { createGroqProvider, createDeepSeekProvider, createMistralProvider }          from 'confused-ai';
import { LLMRouter, createSmartRouter }  from 'confused-ai';
import { LLMCache }                      from 'confused-ai';
import { ContextWindowManager }          from 'confused-ai';

// Structured output
import { extractJson, validateStructuredOutput, CommonSchemas } from 'confused-ai';

// Memory
import { InMemoryStore, VectorMemoryStore, OpenAIEmbeddingProvider } from 'confused-ai';
import { InMemoryVectorStore, PineconeVectorStore, QdrantVectorStore, PgVectorStore } from 'confused-ai';

// Knowledge / RAG
import { KnowledgeEngine, TextLoader, JSONLoader, CSVLoader, URLLoader } from 'confused-ai';

// Session
import { InMemorySessionStore, createSqliteSessionStore, SqlSessionStore, RedisSessionStore } from 'confused-ai';
import { createBunSqliteSessionStore }                                from 'confused-ai'; // Bun-native SQLite

// Storage
import { createStorage, MemoryStorageAdapter } from 'confused-ai';

// Orchestration
import { createPipeline, createSupervisor, createRole, createSwarm }  from 'confused-ai';
import { createAgentRouter, createHandoff, createConsensus }           from 'confused-ai';
import { MessageBusImpl, RoundRobinLoadBalancer }                      from 'confused-ai';
import { Team, createResearchTeam, createDecisionTeam }                from 'confused-ai';

// Guardrails
import { GuardrailValidator, createPiiDetectionRule, createPromptInjectionRule } from 'confused-ai';
import { detectPii, detectPromptInjection }                                       from 'confused-ai';

// Observability
import { ConsoleLogger, InMemoryTracer, MetricsCollectorImpl }         from 'confused-ai';
import { OTLPTraceExporter, OTLPMetricsExporter }                      from 'confused-ai';
import { runLlmAsJudge, createMultiCriteriaJudge, runEvalBatch }       from 'confused-ai';
import { sendLangfuseBatch, sendLangSmithRunBatch }                    from 'confused-ai';
import { ExactMatchAccuracy, wordOverlapF1, rougeLWords }              from 'confused-ai';

// Production
import { CircuitBreaker, RateLimiter, withResilience }                 from 'confused-ai';
import { HealthCheckManager, createLLMHealthCheck }                    from 'confused-ai';
import { createGracefulShutdown, withShutdownGuard }                   from 'confused-ai';
import { createResumableStream, formatSSE }                            from 'confused-ai';

// Plugins
import { createPluginRegistry, createLoggingPlugin }                   from 'confused-ai';

// Tools
import { tool, createTool, defineTool, ToolBuilder, extendTool, wrapTool, pipeTools } from 'confused-ai';
import { TavilyToolkit, GitHubToolkit, CalculatorToolkit /* ... */ }   from 'confused-ai';
// Tool category subpaths (tree-shakeable)
import { TavilySearchTool, ExaToolkit, FirecrawlToolkit, GoogleMapsToolkit } from 'confused-ai/tools/search';
import { SlackToolkit, GmailToolkit, DiscordToolkit, TelegramToolkit }       from 'confused-ai/tools/communication';
import { GitHubToolkit as GH, DockerToolkit, JavaScriptExecTool, PythonExecTool, ShellCommandTool } from 'confused-ai/tools/devtools';
import { ClickUpToolkit, ConfluenceToolkit }                                  from 'confused-ai/tools/productivity';
import { GoogleCalendarToolkit, GoogleSheetsToolkit }                         from 'confused-ai/tools/productivity';
import { TrelloToolkit }                                                      from 'confused-ai/tools/productivity';
import { SpotifyToolkit }                                                     from 'confused-ai/tools/social';
import { DatabaseToolkit, RedisToolkit, CsvToolkit, Neo4jToolkit }           from 'confused-ai/tools/data';
import { StripeToolkit, YFinanceTool }                                        from 'confused-ai/tools/finance';
import { OpenAIToolkit, SerpApiToolkit }                                      from 'confused-ai/tools/ai';
import { WikipediaSearchTool, HackerNewsToolkit, PlaywrightPageTitleTool }   from 'confused-ai/tools/scraping';
import { ShellTool }                                                           from 'confused-ai/tools/shell'; // explicit for security

// Testing
import { MockLLMProvider, MockSessionStore }                           from 'confused-ai';

// Config
import { loadConfig }                                                   from 'confused-ai';

// Extensions (also available as subpath)
import { createLoggingToolMiddleware, wrapAgentForOrchestration }      from 'confused-ai';
import { toToolRegistry }                                               from 'confused-ai/extensions';

// DX — minimal & fluent APIs (also in main barrel)
import { agent, bare, defineAgent, compose, pipe, definePersona }      from 'confused-ai/dx';
import { createDevLogger, createDevToolMiddleware }                     from 'confused-ai/dx';

// SDK — typed agents & workflows (also in main barrel)
import { defineAgent as defineTypedAgent, createWorkflow }             from 'confused-ai/sdk';
import { asOrchestratorAgent }                                          from 'confused-ai/sdk';

// Learning
import { InMemoryUserProfileStore, LearningMode }                      from 'confused-ai';

// Background queues
import { queueHook, InMemoryBackgroundQueue, generateTaskId }          from 'confused-ai/background';
import { BullMQBackgroundQueue, KafkaBackgroundQueue }                 from 'confused-ai/background';
import { RabbitMQBackgroundQueue, SQSBackgroundQueue }                 from 'confused-ai/background';
import { RedisPubSubBackgroundQueue }                                   from 'confused-ai/background';

// Runtime — HTTP server, JWT auth, WebSocket
import { createRuntimeServer }                                          from 'confused-ai/serve';
import { attachWebSocketTransport }                                     from 'confused-ai/serve';
import { ElevenLabsVoiceProvider }                                      from 'confused-ai/voice';

// Production — budget, checkpoint, idempotency, audit, HITL, tenant
import { BudgetEnforcer, BudgetExceededError, InMemoryBudgetStore }    from 'confused-ai/guard';
import { InMemoryCheckpointStore, createSqliteCheckpointStore }        from 'confused-ai/guard';
import { InMemoryIdempotencyStore }                                     from 'confused-ai/guard';
import { InMemoryAuditStore, createSqliteAuditStore }                  from 'confused-ai/guard';
import { InMemoryApprovalStore, createSqliteApprovalStore }            from 'confused-ai/guard';
import { waitForApproval, ApprovalRejectedError }                      from 'confused-ai/guard';
import { createTenantContext, TenantScopedSessionStore }               from 'confused-ai/guard';
import { RedisRateLimiter }                                             from 'confused-ai/guard';

// Graph engine
import { createGraph, DAGEngine, DurableExecutor, NodeKind }           from 'confused-ai/graph';
import { InMemoryEventStore, SqliteEventStore, computeWaves }          from 'confused-ai/graph';
import { BackpressureController, DistributedEngine, GraphWorker }      from 'confused-ai/graph';

// Planner
import { LLMPlanner, ClassicalPlanner, PlanValidator }                 from 'confused-ai/planner';
import { PlanningAlgorithm, TaskPriority }                             from 'confused-ai/planner';

// Vision / Multimodal
import { imageUrl, imageBuffer, imageFile }                            from 'confused-ai';
import { audioFile, audioBuffer, multiModalToMessage }                 from 'confused-ai';
import type { MultiModalInput, ImageUrl, ImageBuffer, ImageFile }      from 'confused-ai';

// Artifacts
import { InMemoryArtifactStorage }                                     from 'confused-ai/artifacts';
import { createTextArtifact, createMarkdownArtifact, createDataArtifact } from 'confused-ai/artifacts';
import { createReasoningArtifact, createPlanArtifact }                 from 'confused-ai/artifacts';
import type { ArtifactStorage, Artifact, ArtifactType }               from 'confused-ai/artifacts';

// Learning Machine
import { LearningMachine, LearningMode }                               from 'confused-ai';
import { InMemoryUserMemoryStore, InMemorySessionContextStore }        from 'confused-ai';
import { InMemoryEntityMemoryStore, InMemoryLearnedKnowledgeStore }    from 'confused-ai';
import { InMemoryUserProfileStore }                                    from 'confused-ai';

// Reasoning
import { ReasoningManager, ReasoningEventType, NextAction }            from 'confused-ai';
import type { ReasoningStep, ReasoningEvent }                          from 'confused-ai';

// Compression
import { CompressionManager }                                          from 'confused-ai';
import type { CompressibleMessage }                                    from 'confused-ai';

// Context Providers
import { ContextProvider, ContextBackend, ContextMode }                from 'confused-ai';

// Scheduler
import { ScheduleManager, InMemoryScheduleStore, validateCronExpr }   from 'confused-ai';
import { InMemoryScheduleRunStore }                                    from 'confused-ai';

// Video
import { VideoOrchestrator }                                           from 'confused-ai';

// Testing (graph)
import { createTestRunner, createMockLLMProvider }                     from 'confused-ai/test';
import { expectEventSequence, assertExactEventSequence }               from 'confused-ai/test';
```


---

## Learning Machine

`LearningMachine` is a five-store user profile system. It builds a rich context object from memory, session, entities, learned knowledge, and a user profile before each agent run.

```ts
import {
  LearningMachine,
  InMemoryUserMemoryStore,
  InMemorySessionContextStore,
  InMemoryEntityMemoryStore,
  InMemoryLearnedKnowledgeStore,
  InMemoryUserProfileStore,
  LearningMode,
} from 'confused-ai';

const machine = new LearningMachine({
  userMemoryStore:       new InMemoryUserMemoryStore(),
  sessionContextStore:   new InMemorySessionContextStore(),
  entityMemoryStore:     new InMemoryEntityMemoryStore(),
  learnedKnowledgeStore: new InMemoryLearnedKnowledgeStore(),
  userProfileStore:      new InMemoryUserProfileStore(),
  mode:                  LearningMode.ALWAYS,
  maxMemoryItems:        100,
  sessionTtlMs:          30 * 60 * 1000,
});

// Build context before a run
const ctx = await machine.buildContext('user-123', 'agent-id', {
  sessionId: 'sess-abc',
  message:   'What are my preferences?',
});

// Process a run (persists memory, entities, knowledge as configured)
const result = await machine.process('user-123', 'agent-id', {
  message:   'My preferred language is TypeScript.',
  response:  'Noted — I will remember that you prefer TypeScript.',
  sessionId: 'sess-abc',
});

// Recall relevant memories
const memories = await machine.recall('user-123', 'agent-id', 'programming preferences', 5);
```

> **Full guide:** [Learning Machine](./learning-machine.md)

---

## Reasoning (Chain-of-Thought)

`ReasoningManager` runs a structured CoT loop and streams typed events.

```ts
import { ReasoningManager, ReasoningEventType, NextAction } from 'confused-ai';

const reasoning = new ReasoningManager({
  llmProvider: myLlm,
  maxIterations: 10,
  timeoutMs: 30_000,
  streamingEnabled: true,
});

for await (const event of reasoning.reason('Is 3599 a prime number?')) {
  if (event.type === ReasoningEventType.THOUGHT) {
    console.log('Thinking:', event.step?.thought);
  }
  if (event.type === ReasoningEventType.FINAL_ANSWER) {
    console.log('Answer:', event.step?.thought);
    break;
  }
}
```

`NextAction` values: `CONTINUE`, `FINAL_ANSWER`, `TOOL_CALL`, `PAUSE`, `ABORT`.

> **Full guide:** [Reasoning](./reasoning.md)

---

## Compression

`CompressionManager` summarizes large tool results before they consume context window budget.

```ts
import { CompressionManager } from 'confused-ai';

const compressor = new CompressionManager({
  llmProvider:    myLlm,
  maxTokens:      8_000,
  targetTokens:   2_000,
  compressionMode: 'aggressive',
});

if (compressor.shouldCompress(toolResult)) {
  const summary = await compressor.compress(toolResult, 'web_search');
  console.log(summary); // concise summary
}

// Async variant
const asyncSummary = await compressor.acompress(toolResult, 'database_query');
```

> **Full guide:** [Compression](./compression.md)

---

## Context Providers

`ContextProvider` and `ContextBackend` are abstract classes for injecting dynamic context (docs, tools, answers) before each agent run.

```ts
import { ContextProvider, ContextBackend, ContextMode } from 'confused-ai';

// Custom provider
class DocsContextProvider extends ContextProvider {
  async query(query: string, options?: QueryOptions): Promise<Answer[]> {
    const docs = await searchDocs(query);
    return docs.map(d => ({ text: d.content, source: d.url }));
  }
}

const provider = new DocsContextProvider({
  name: 'docs',
  mode: ContextMode.AGENT, // inject context before every run
  topK: 5,
});

// Wire into agent
const ai = agent({
  model: 'gpt-4o',
  instructions: 'You answer questions using the docs.',
  contextProviders: [provider],
});
```

`ContextMode` values: `DEFAULT`, `AGENT`, `TOOLS`.

> **Full guide:** [Context Providers](./context-provider.md)

---

## Scheduler

`ScheduleManager` runs cron jobs that trigger agent tasks on a schedule.

```ts
import { ScheduleManager, InMemoryScheduleStore, InMemoryScheduleRunStore } from 'confused-ai';

const manager = new ScheduleManager({
  store:    new InMemoryScheduleStore(),
  runStore: new InMemoryScheduleRunStore(),
  timezone: 'America/Los_Angeles',
});

manager.register('daily-report', async (schedule) => {
  const result = await reportAgent.run('Generate daily summary');
  console.log('Done:', result.text);
});

const schedule = await manager.create({
  id:      'daily-report',
  name:    'Daily Report',
  cron:    '0 9 * * *',   // 9 AM every day
  enabled: true,
  payload: { format: 'slack' },
});

await manager.start();
```

> **Full guide:** [Scheduler](./scheduler.md)

---

## Planner

`ClassicalPlanner` and `LLMPlanner` decompose goals into ordered, dependency-aware task lists.

```ts
import { ClassicalPlanner, LLMPlanner, PlanValidator, PlanningAlgorithm, TaskPriority } from 'confused-ai/planner';

// Classical (deterministic, no LLM)
const planner = new ClassicalPlanner({ algorithm: PlanningAlgorithm.HIERARCHICAL });
const plan    = await planner.plan('Launch a product update blog post');

// LLM-driven (flexible, handles novel goals)
const llmPlanner = new LLMPlanner({ temperature: 0.3 }, myLlmAdapter);
const plan2      = await llmPlanner.plan('Migrate the monolith to microservices');

// Validate
const validator = new PlanValidator();
const { valid, errors } = await validator.validate(plan);

// Iterate
for (const task of plan.tasks) {
  console.log(`[${TaskPriority[task.priority]}] ${task.name}`);
}
```

> **Full guide:** [Planner](./planner.md)

---

## Vision & Multimodal

Pass images, audio, and files to vision-capable models.

```ts
import { imageUrl, imageBuffer, imageFile, audioFile, multiModalToMessage } from 'confused-ai';
import type { MultiModalInput } from 'confused-ai';

const result = await ai.run('What is in this image?', {
  multiModal: {
    text:   'What is in this image?',
    images: [imageUrl('https://example.com/chart.png', 'high')],
  },
});

// From raw bytes
const bytes = await fs.readFile('./photo.jpg');
const img   = imageBuffer(bytes, 'image/jpeg');

// Multiple images
const comparison = {
  text:   'Compare these charts.',
  images: [
    imageUrl('https://cdn.example.com/q1.png'),
    imageUrl('https://cdn.example.com/q2.png'),
  ],
} satisfies MultiModalInput;
```

> **Full guide:** [Vision & Multimodal](./vision.md)

---

## Artifacts

Typed, versioned outputs with full history.

```ts
import { InMemoryArtifactStorage, createMarkdownArtifact, createDataArtifact } from 'confused-ai/artifacts';

const storage = new InMemoryArtifactStorage();

// Save
const doc = await storage.save(createMarkdownArtifact('report', '# Q1 Report\n\n...'));

// Version
const v2 = await storage.update(doc.id, { content: '# Q1 Report (v2)\n\n...' });
console.log(v2.version); // 2

// Retrieve by version
const original = await storage.getVersion(doc.id, 1);

// Search
const results = await storage.search('Q1 market');

// List by type
const reports = await storage.list({ type: 'markdown', limit: 20 });
```

> **Full guide:** [Artifacts](./artifacts.md)

---

## Video Generation

Generate YouTube Shorts from a topic string using OpenAI TTS and Pexels footage.

```ts
import { VideoOrchestrator } from 'confused-ai';

const orchestrator = new VideoOrchestrator();
const result = await orchestrator.generateShort('The history of TypeScript');

if (result.success) {
  console.log('Video:', result.videoPath);
}
```

Requires: `OPENAI_API_KEY`, `PEXELS_API_KEY`
Peer deps: `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `pexels`

> **Full guide:** [Video](./video.md)

