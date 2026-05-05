# Integration Blueprints — confused-ai

> **Audience:** Integration engineers, platform teams, enterprise architects  
> **Purpose:** Production-ready integration patterns with complete, runnable code  
> **Version:** 1.1.7+

---

## Blueprint Index

| # | Blueprint | Complexity | Time to Implement |
|---|-----------|:----------:|:-----------------:|
| 1 | [Multi-Tenant SaaS API](#1-multi-tenant-saas-api) | Advanced | 2–4 hours |
| 2 | [RAG-Powered Knowledge Assistant](#2-rag-powered-knowledge-assistant) | Intermediate | 1–2 hours |
| 3 | [Cost-Controlled LLM Gateway](#3-cost-controlled-llm-gateway) | Advanced | 2–3 hours |
| 4 | [Distributed Graph Workflow](#4-distributed-graph-workflow) | Advanced | 3–5 hours |
| 5 | [Human-in-the-Loop Approval System](#5-human-in-the-loop-approval-system) | Intermediate | 1–2 hours |
| 6 | [Multi-Agent Research Pipeline](#6-multi-agent-research-pipeline) | Intermediate | 1–2 hours |
| 7 | [Production HTTP Service with Full Observability](#7-production-http-service-with-full-observability) | Advanced | 2–4 hours |
| 8 | [Background Job Processing Agent](#8-background-job-processing-agent) | Intermediate | 1–2 hours |
| 9 | [MCP Tool Server and Client](#9-mcp-tool-server-and-client) | Intermediate | 1–2 hours |

---

## 1. Multi-Tenant SaaS API

**Use case:** SaaS product where each customer (tenant) gets isolated agent sessions, independent rate limits, and separate monthly budget caps.

**Key primitives:** `createTenantContext`, `TenantScopedSessionStore`, `BudgetEnforcer`, `RateLimiter`, `createHttpService`

```typescript
// src/agent-service.ts
import { createAgent }          from 'confused-ai';
import { anthropic }            from 'confused-ai/model';
import { createHttpService }    from 'confused-ai/runtime';
import {
  createTenantContext,
  TenantScopedSessionStore,
  BudgetEnforcer,
  InMemoryBudgetStore,
  RateLimiter,
} from 'confused-ai/production';
import { createSqliteSessionStore } from 'confused-ai/session';
import { createSqliteAuditStore }   from 'confused-ai/production';

// ─── Infrastructure ────────────────────────────────────────────
const baseSessionStore = createSqliteSessionStore({ path: './data/sessions.db' });
const auditStore       = createSqliteAuditStore({ path: './data/audit.db' });
const budgetStore      = new InMemoryBudgetStore();  // swap for RedisStore in production

// ─── Per-tenant factory ─────────────────────────────────────────
interface TenantConfig {
  tenantId:      string;
  plan:          'starter' | 'pro' | 'enterprise';
  monthlyBudget: number;   // USD
}

const PLAN_LIMITS: Record<TenantConfig['plan'], { rpm: number; budget: number }> = {
  starter:    { rpm: 10,  budget: 10  },
  pro:        { rpm: 60,  budget: 100 },
  enterprise: { rpm: 300, budget: 1000 },
};

function createTenantAgent(config: TenantConfig) {
  const limits = PLAN_LIMITS[config.plan];

  const tenantCtx = createTenantContext({
    tenantId:  config.tenantId,
    budget:    { monthlyUsdLimit: Math.min(config.monthlyBudget, limits.budget), store: budgetStore },
    rateLimit: { maxRpm: limits.rpm },
  });

  return createAgent({
    name:         `assistant-${config.tenantId}`,
    instructions: 'You are a helpful assistant.',
    llm:          anthropic({ model: 'claude-3-5-haiku-20241022' }),
    sessionStore: new TenantScopedSessionStore(baseSessionStore, config.tenantId),
    tenantContext: tenantCtx,
  });
}

// ─── HTTP service ───────────────────────────────────────────────
// In a real app, resolve tenant from JWT / API key
const agentByTenant = new Map<string, ReturnType<typeof createTenantAgent>>();

async function getOrCreateTenantAgent(tenantId: string) {
  if (!agentByTenant.has(tenantId)) {
    // Fetch tenant config from your database
    const config: TenantConfig = await fetchTenantConfig(tenantId);
    agentByTenant.set(tenantId, createTenantAgent(config));
  }
  return agentByTenant.get(tenantId)!;
}

const service = createHttpService({
  port:       3000,
  auditStore,
  auth:       async (req) => {
    const tenantId = await validateApiKey(req.headers['x-api-key'] as string);
    if (!tenantId) return false;
    req.tenantId = tenantId;
    return true;
  },
  agent:      async (req) => getOrCreateTenantAgent(req.tenantId),
  idempotency: { store: new InMemoryIdempotencyStore(), ttlMs: 24 * 60 * 60 * 1000 },
});

await service.listen();
console.log('Multi-tenant agent service running on :3000');
```

**Test the blueprint:**
```bash
# Tenant A call
curl -X POST http://localhost:3000/v1/chat \
  -H 'x-api-key: tenant-a-key' \
  -H 'content-type: application/json' \
  -d '{"message": "What is quantum computing?"}'

# Tenant B call (isolated session, separate budget)
curl -X POST http://localhost:3000/v1/chat \
  -H 'x-api-key: tenant-b-key' \
  -H 'content-type: application/json' \
  -d '{"message": "Summarise our Q1 report", "sessionId": "sess-b-001"}'
```

---

## 2. RAG-Powered Knowledge Assistant

**Use case:** Customer support agent that answers questions using a company knowledge base, with vector search and hybrid (semantic + keyword) retrieval.

**Key primitives:** `KnowledgeEngine`, `PgVectorStore`, `OpenAIEmbeddingProvider`, `TextLoader`, `URLLoader`

```typescript
// src/knowledge-agent.ts
import { createAgent }              from 'confused-ai';
import { openai }                   from 'confused-ai/model';
import { KnowledgeEngine, TextLoader, URLLoader } from 'confused-ai/knowledge';
import { PgVectorStore }            from 'confused-ai/memory';
import { OpenAIEmbeddingProvider }  from 'confused-ai/memory';

// ─── Knowledge base setup ───────────────────────────────────────
const embeddingProvider = new OpenAIEmbeddingProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model:  'text-embedding-3-small',  // 1536 dims, cost-effective
});

const vectorStore = new PgVectorStore({
  connectionString: process.env.DATABASE_URL!,
  tableName:        'knowledge_embeddings',
  dimensions:       1536,
});

const knowledge = new KnowledgeEngine({
  embeddingProvider,
  vectorStore,
  chunkSize:    500,   // tokens per chunk
  chunkOverlap: 50,    // token overlap between chunks
  topK:         5,     // documents returned per query
});

// ─── Ingest documents ───────────────────────────────────────────
async function ingestKnowledgeBase() {
  const loaders = [
    // Local files
    new TextLoader('./docs/product-guide.md'),
    new TextLoader('./docs/faq.md'),
    // Remote URLs
    new URLLoader('https://docs.yourproduct.com/api-reference'),
  ];

  for (const loader of loaders) {
    const documents = await loader.load();
    await knowledge.ingest(documents);
    console.log(`Ingested: ${documents.length} documents from ${loader.source}`);
  }
}

// ─── Agent ──────────────────────────────────────────────────────
const supportAgent = createAgent({
  name:         'support-assistant',
  instructions: `You are a customer support assistant for AcmeCorp.
Answer questions using the provided knowledge base context.
If you cannot find the answer in the context, say so honestly — do not hallucinate.
Always cite the source document when answering.`,
  llm:          openai({ model: 'gpt-4o-mini' }),
  knowledgebase: knowledge,
  // Fallback context injection: top-K docs injected as system context before each run
  knowledgeOptions: {
    topK:            5,
    minScore:        0.75,  // discard low-relevance chunks
    hybridSearch:    true,  // combine semantic + BM25 keyword search
  },
});

// ─── Usage ──────────────────────────────────────────────────────
await ingestKnowledgeBase();

const { text } = await supportAgent.run(
  'What is the cancellation policy for enterprise plans?',
  { sessionId: 'user-123' }
);
console.log(text);

// Streaming with session
for await (const chunk of supportAgent.stream(
  'How do I configure SSO for my team?',
  { sessionId: 'user-123' }
)) {
  process.stdout.write(chunk);
}
```

---

## 3. Cost-Controlled LLM Gateway

**Use case:** Internal AI platform where different user groups get different model tiers, with automatic cost optimization and hard spending caps.

**Key primitives:** `createCostOptimizedRouter`, `BudgetEnforcer`, `withResilience`, `LLMRouter`

```typescript
// src/llm-gateway.ts
import { createAgent }                   from 'confused-ai';
import { openai, anthropic }             from 'confused-ai/model';
import { createCostOptimizedRouter }     from 'confused-ai/router';
import {
  BudgetEnforcer,
  InMemoryBudgetStore,
  withResilience,
} from 'confused-ai/production';

// ─── Model catalogue ────────────────────────────────────────────
// Cost per 1M tokens (input/output average), May 2026 pricing
const MODELS = {
  'gpt-4o-mini':            { provider: openai({ model: 'gpt-4o-mini' }),            costPer1M: 0.30 },
  'gpt-4o':                 { provider: openai({ model: 'gpt-4o' }),                  costPer1M: 5.00 },
  'claude-3-haiku':         { provider: anthropic({ model: 'claude-3-5-haiku-20241022' }), costPer1M: 1.25 },
  'claude-3-sonnet':        { provider: anthropic({ model: 'claude-3-5-sonnet-20241022' }), costPer1M: 15.00 },
} as const;

// ─── Cost-optimized router ──────────────────────────────────────
// Picks cheapest model that meets minimum capability score
const router = createCostOptimizedRouter({
  providers: new Map(
    Object.entries(MODELS).map(([id, { provider }]) => [id, provider])
  ),
  minCapability: 6,  // 1–10 scale; 6 = GPT-4o-mini tier
});

// ─── User tier → model policy ───────────────────────────────────
type UserTier = 'free' | 'pro' | 'enterprise';

const TIER_POLICY: Record<UserTier, { minCapability: number; monthlyBudget: number }> = {
  free:       { minCapability: 5,  monthlyBudget: 1.00  },
  pro:        { minCapability: 7,  monthlyBudget: 20.00 },
  enterprise: { minCapability: 9,  monthlyBudget: 500.00 },
};

// ─── Budget store (use Redis in production) ─────────────────────
const budgetStore = new InMemoryBudgetStore();

// ─── Per-user agent factory ─────────────────────────────────────
async function createUserAgent(userId: string, tier: UserTier) {
  const policy  = TIER_POLICY[tier];
  const { provider } = router.select('', { minCapability: policy.minCapability });

  const budget = new BudgetEnforcer({
    userId,
    store:          budgetStore,
    monthlyUsdLimit: policy.monthlyBudget,
    perRunUsdLimit:  policy.monthlyBudget * 0.1,  // max 10% of monthly in one run
  });

  const agent = createAgent({
    name:         `assistant-${userId}`,
    instructions: 'You are a helpful assistant.',
    llm:          provider,
    budget,
  });

  // Wrap with resilience: circuit breaker + retry + health reporting
  return withResilience(agent, {
    circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 60_000 },
    retry:          { maxRetries: 2, backoffMs: 1000 },
  });
}

// ─── Gateway endpoint example ───────────────────────────────────
async function handleChatRequest(userId: string, tier: UserTier, message: string) {
  const agent = await createUserAgent(userId, tier);

  try {
    const { text, usage } = await agent.run(message);
    console.log(`User ${userId} [${tier}] — ${usage.costUsd.toFixed(4)} USD`);
    return { text, cost: usage.costUsd };
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return { error: 'Monthly spending limit reached. Upgrade your plan to continue.' };
    }
    throw error;
  }
}
```

---

## 4. Distributed Graph Workflow

**Use case:** Long-running document processing pipeline that can span hours, survive process restarts, and scale across multiple workers.

**Key primitives:** `createGraph`, `DurableExecutor`, `DistributedEngine`, `RedisTaskQueue`, `SqliteEventStore`

```typescript
// src/document-pipeline.ts
import {
  createGraph,
  DurableExecutor,
  DistributedEngine,
  RedisTaskQueue,
  SqliteEventStore,
  agentNode,
} from 'confused-ai/graph';
import { createAgent } from 'confused-ai';
import { openai }      from 'confused-ai/model';

// ─── Agent definitions ───────────────────────────────────────────
const llm = openai({ model: 'gpt-4o-mini' });

const extractorAgent = createAgent({
  name: 'extractor',
  instructions: 'Extract key facts, entities, and claims from the provided document. Return structured JSON.',
  llm,
});

const summarizerAgent = createAgent({
  name: 'summarizer',
  instructions: 'Write a 3-paragraph executive summary from the extracted facts.',
  llm,
});

const classifierAgent = createAgent({
  name: 'classifier',
  instructions: 'Classify the document: urgency (low/medium/high), category, and required action.',
  llm,
});

const reviewerAgent = createAgent({
  name: 'reviewer',
  instructions: 'Review the summary and classification for accuracy and completeness.',
  llm,
});

// ─── Graph definition ────────────────────────────────────────────
const documentGraph = createGraph()
  .addNode(agentNode('extract',    extractorAgent))
  .addNode(agentNode('summarize',  summarizerAgent))
  .addNode(agentNode('classify',   classifierAgent))
  .addNode(agentNode('review',     reviewerAgent))
  // extract → summarize AND classify (parallel fan-out)
  .addEdge('extract',   'summarize')
  .addEdge('extract',   'classify')
  // both paths converge at review
  .addEdge('summarize', 'review')
  .addEdge('classify',  'review')
  .build();

// ─── Durable executor (crash-resume) ────────────────────────────
const eventStore = new SqliteEventStore({ path: './data/graph-events.db' });

const executor = new DurableExecutor({
  graph:      documentGraph,
  eventStore,
  checkpointInterval: 'every-node',  // checkpoint after each node completes
});

// ─── Start a run ─────────────────────────────────────────────────
async function processDocument(documentText: string): Promise<string> {
  const runId = `doc-${Date.now()}`;

  const result = await executor.run(
    { input: documentText },
    { runId }
  );

  return result.outputs['review'];
}

// ─── Resume a crashed run ────────────────────────────────────────
async function resumeRun(runId: string): Promise<string> {
  const result = await executor.resume(runId);
  return result.outputs['review'];
}

// ─── Distributed mode (multiple workers) ─────────────────────────
const taskQueue = new RedisTaskQueue({
  redisUrl: process.env.REDIS_URL!,
  queueName: 'document-processing',
});

const distributed = new DistributedEngine({
  graph:     documentGraph,
  taskQueue,
  eventStore,
  workers:   4,
});

// Worker process:
await distributed.startWorker();

// Dispatcher process:
await distributed.dispatch({ input: documentText }, { runId: `batch-${Date.now()}` });
```

---

## 5. Human-in-the-Loop Approval System

**Use case:** Financial agent that requires human approval before executing transactions above a threshold.

**Key primitives:** `waitForApproval`, `InMemoryApprovalStore`, `createSqliteApprovalStore`, `createHttpService`

```typescript
// src/financial-agent.ts
import { createAgent, defineTool } from 'confused-ai';
import { openai }                  from 'confused-ai/model';
import { z }                       from 'zod';
import {
  waitForApproval,
  createSqliteApprovalStore,
  ApprovalRejectedError,
} from 'confused-ai/production';
import { createHttpService } from 'confused-ai/runtime';

const approvalStore = createSqliteApprovalStore({ path: './data/approvals.db' });

// ─── Tools requiring approval above threshold ────────────────────
const transferFunds = defineTool()
  .name('transferFunds')
  .description('Transfer funds between accounts')
  .parameters(z.object({
    fromAccount: z.string(),
    toAccount:   z.string(),
    amount:      z.number().positive(),
    currency:    z.string().default('USD'),
    memo:        z.string().optional(),
  }))
  .execute(async ({ fromAccount, toAccount, amount, currency, memo }, ctx) => {
    // Require human approval for transactions > $1,000
    if (amount > 1000) {
      const decision = await waitForApproval(approvalStore, {
        approvalId: `transfer-${ctx.runId}`,
        prompt:     `Approve transfer of ${currency} ${amount.toFixed(2)} from ${fromAccount} to ${toAccount}${memo ? ` (${memo})` : ''}?`,
        timeoutMs:  5 * 60 * 1000,  // 5-minute approval window
        metadata:   { amount, fromAccount, toAccount, currency },
      });

      if (decision.action === 'reject') {
        throw new ApprovalRejectedError(`Transfer rejected: ${decision.reason ?? 'No reason given'}`);
      }
    }

    // Execute the transfer
    const txId = await bankingApi.transfer({ fromAccount, toAccount, amount, currency, memo });
    return { success: true, transactionId: txId, amount, currency };
  })
  .build();

// ─── Agent ──────────────────────────────────────────────────────
const financeAgent = createAgent({
  name:         'finance-assistant',
  instructions: `You are a financial operations assistant. 
You can check balances, transfer funds, and process payments.
For transfers over $1,000, a human approval is automatically requested — inform the user to check their approval queue.`,
  llm:          openai({ model: 'gpt-4o' }),
  tools:        [transferFunds],
  approvalStore,
});

// ─── HTTP service with approval endpoint ─────────────────────────
const service = createHttpService({
  port:  3001,
  agent: financeAgent,
  approvalStore,   // auto-mounts POST /v1/approvals/:id
  auth: 'bearer',
});

// The POST /v1/approvals/:id endpoint signature:
// Body: { action: 'approve' | 'reject', reason?: string, approvedBy: string }
// This is auto-wired when approvalStore is passed — no extra code needed.

await service.listen();
```

---

## 6. Multi-Agent Research Pipeline

**Use case:** Autonomous research team with specialized roles, parallel information gathering, and synthesis.

**Key primitives:** `createSupervisor`, `createSwarm`, `compose`, built-in search tools

```typescript
// src/research-pipeline.ts
import { createAgent, compose }   from 'confused-ai';
import { openai }                  from 'confused-ai/model';
import { createSupervisor }        from 'confused-ai/workflow';
import { TavilySearchTool, ArxivSearchTool, WikipediaTool } from 'confused-ai/tools';

const llm = openai({ model: 'gpt-4o-mini' });

// ─── Specialist agents ───────────────────────────────────────────
const webResearcher = createAgent({
  name:         'web-researcher',
  instructions: 'Search the web for current information on the given topic. Focus on authoritative sources published in the last 12 months.',
  llm,
  tools: [new TavilySearchTool({ apiKey: process.env.TAVILY_API_KEY! })],
});

const academicResearcher = createAgent({
  name:         'academic-researcher',
  instructions: 'Search academic papers and Wikipedia for foundational knowledge on the topic. Focus on peer-reviewed sources.',
  llm,
  tools: [
    new ArxivSearchTool(),
    new WikipediaTool(),
  ],
});

const factChecker = createAgent({
  name:         'fact-checker',
  instructions: 'Verify the key claims made in the research. Identify any contradictions or unverified assertions. Be skeptical.',
  llm,
  tools: [new TavilySearchTool({ apiKey: process.env.TAVILY_API_KEY! })],
});

const synthesizer = createAgent({
  name:         'synthesizer',
  instructions: `Write a comprehensive, well-structured research report.
Include: Executive Summary, Key Findings, Supporting Evidence, Contradictions/Uncertainties, Recommendations.
Use citations in [Source: URL] format.`,
  llm: openai({ model: 'gpt-4o' }),  // use better model for final synthesis
});

// ─── Supervisor orchestration ────────────────────────────────────
// Supervisor routes to appropriate specialist and manages parallel research
const researchSupervisor = createSupervisor({
  name:    'research-director',
  agents:  { webResearcher, academicResearcher, factChecker },
  llm:     openai({ model: 'gpt-4o' }),
  instructions: 'Coordinate the research team. Delegate to web researcher and academic researcher in parallel. Then send results to fact checker.',
  strategy: 'parallel',  // run web + academic simultaneously
});

// Sequential pipeline: supervisor → synthesizer
const researchPipeline = compose(researchSupervisor, synthesizer);

// ─── Run ─────────────────────────────────────────────────────────
const { text } = await researchPipeline.run(
  'What are the current state-of-the-art techniques for AI alignment and their limitations?'
);

console.log(text);
```

---

## 7. Production HTTP Service with Full Observability

**Use case:** A production-grade HTTP API with OTLP tracing, structured logging, Prometheus metrics, circuit breakers, and audit logging.

```typescript
// src/production-service.ts
import { createAgent }       from 'confused-ai';
import { openai }            from 'confused-ai/model';
import { createHttpService } from 'confused-ai/runtime';
import { OtlpExporter }      from 'confused-ai/observe';
import {
  withResilience,
  createSqliteAuditStore,
  InMemoryBudgetStore,
  BudgetEnforcer,
  createGracefulShutdown,
  GracefulShutdown,
} from 'confused-ai/production';

// ─── Observability ───────────────────────────────────────────────
const otlp = new OtlpExporter({
  endpoint: process.env.OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
  headers:  process.env.HONEYCOMB_API_KEY
    ? { 'x-honeycomb-team': process.env.HONEYCOMB_API_KEY }
    : {},
  serviceName: 'confused-ai-production',
});

// ─── Infrastructure ──────────────────────────────────────────────
const auditStore  = createSqliteAuditStore({ path: './data/audit.db' });
const budgetStore = new InMemoryBudgetStore();  // swap for Redis in multi-instance

// ─── Agent with full production wrapping ────────────────────────
const baseAgent = createAgent({
  name:         'production-assistant',
  instructions: 'You are a helpful assistant. Be concise and accurate.',
  llm:          openai({ model: 'gpt-4o-mini' }),
  tracer:       otlp.getTracer('agent'),
  budget:       new BudgetEnforcer({
    store:           budgetStore,
    monthlyUsdLimit: 1000,
    perRunUsdLimit:  1,
  }),
});

const agent = withResilience(baseAgent, {
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000, callTimeoutMs: 60_000 },
  rateLimit:      { maxRpm: 100 },
  retry:          { maxRetries: 2, backoffMs: 500, maxBackoffMs: 5_000 },
  gracefulShutdown: true,
});

// ─── HTTP service ────────────────────────────────────────────────
const service = createHttpService({
  port:        3000,
  agent,
  auditStore,
  auth:        'bearer',
  maxBodyBytes: 1024 * 64,  // 64KB max request
  websocket:   true,        // enable ws://host/v1/ws
  idempotency: {
    store:  new InMemoryIdempotencyStore(),
    ttlMs:  24 * 60 * 60 * 1000,  // 24h dedup window
  },
  // Prometheus metrics endpoint (requires prometheusExporter option in v1.2+)
  // prometheusExporter: true,
});

// ─── Health probes ───────────────────────────────────────────────
// GET /health → liveness (always 200 if process is running)
// GET /v1/health → readiness (503 if DB unavailable)

// ─── Graceful shutdown ───────────────────────────────────────────
const shutdown = createGracefulShutdown({ timeoutMs: 30_000 });

shutdown.onSignal(async () => {
  await service.close();
  await auditStore.close?.();
  await otlp.shutdown();
});

await service.listen();
console.log(`Production service on :3000`);
console.log(`Health: http://localhost:3000/health`);
console.log(`OpenAPI: http://localhost:3000/v1/openapi.json`);
```

**Deployment checklist for this blueprint:**
- Set `AUTH_SECRET` (JWT secret or JWKS endpoint)
- Set `OTLP_ENDPOINT` to your Jaeger/Honeycomb/Datadog endpoint
- Replace `InMemoryBudgetStore` with `RedisRateLimiter` for multi-instance
- Configure liveness probe: `GET /health`
- Configure readiness probe: `GET /v1/health`
- Mount pre-stop hook to `/shutdown` for graceful SIGTERM handling

---

## 8. Background Job Processing Agent

**Use case:** Process user-submitted tasks asynchronously via a durable job queue.

```typescript
// src/background-processor.ts
import { createAgent }           from 'confused-ai';
import { openai }                from 'confused-ai/model';
import { BullMQBackgroundQueue, queueHook } from 'confused-ai/background';

const queue = new BullMQBackgroundQueue({
  redisUrl:  process.env.REDIS_URL!,
  queueName: 'agent-tasks',
  concurrency: 5,
});

const processorAgent = createAgent({
  name:         'background-processor',
  instructions: 'Process the given task and return a structured result.',
  llm:          openai({ model: 'gpt-4o-mini' }),
  hooks:        {
    // Emit queue events on agent lifecycle
    onRunStart:  queueHook(queue, 'task:started'),
    onRunEnd:    queueHook(queue, 'task:completed'),
    onRunError:  queueHook(queue, 'task:failed'),
  },
});

// ─── Producer (enqueue from API) ─────────────────────────────────
export async function enqueueTask(task: string, userId: string) {
  const jobId = await queue.add({ task, userId }, {
    attempts:   3,
    backoff:    { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
  });
  return jobId;
}

// ─── Consumer (worker process) ───────────────────────────────────
await queue.process(async (job) => {
  const { task, userId } = job.data;
  const { text, usage } = await processorAgent.run(task, {
    sessionId: `user-${userId}`,
    metadata:  { jobId: job.id, userId },
  });

  return { result: text, cost: usage.costUsd };
});

console.log('Background processor running. Waiting for jobs...');
```

---

## 9. MCP Tool Server and Client

**Use case:** Expose your internal tools as an MCP server consumable by Claude Desktop, other agents, or any MCP-compatible client.

```typescript
// src/mcp-server.ts — expose tools via MCP
import { createMcpServer, McpHttpServer } from 'confused-ai/tools';
import { defineTool }                      from 'confused-ai';
import { z }                               from 'zod';

const inventoryTool = defineTool()
  .name('checkInventory')
  .description('Check product inventory levels')
  .parameters(z.object({
    sku:        z.string().describe('Product SKU'),
    warehouseId: z.string().optional().describe('Filter by warehouse'),
  }))
  .execute(async ({ sku, warehouseId }) => {
    return inventoryDb.query(sku, warehouseId);
  })
  .build();

const orderTool = defineTool()
  .name('createOrder')
  .description('Create a purchase order')
  .parameters(z.object({
    sku:      z.string(),
    quantity: z.number().int().positive(),
    urgent:   z.boolean().default(false),
  }))
  .execute(async (params) => {
    return orderService.create(params);
  })
  .build();

const mcpServer = createMcpServer({
  name:    'inventory-mcp',
  version: '1.0.0',
  tools:   [inventoryTool, orderTool],
});

const httpServer = new McpHttpServer({ port: 8080, server: mcpServer });
await httpServer.start();
console.log('MCP server running on :8080');
```

```typescript
// src/mcp-client-agent.ts — consume an MCP server in an agent
import { createAgent }             from 'confused-ai';
import { openai }                  from 'confused-ai/model';
import { loadMcpToolsFromUrl }     from 'confused-ai/tools';

// Dynamically load tools from any MCP server
const mcpTools = await loadMcpToolsFromUrl('http://localhost:8080');

const procurementAgent = createAgent({
  name:         'procurement-assistant',
  instructions: 'Help with inventory management and purchasing decisions.',
  llm:          openai({ model: 'gpt-4o-mini' }),
  tools:        mcpTools,  // all tools from MCP server injected automatically
});

const { text } = await procurementAgent.run(
  'We need 500 units of SKU-4892. Check inventory and create an urgent order if stock is below 200.'
);
console.log(text);
```
