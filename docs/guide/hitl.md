---
title: Human-in-the-Loop
description: Pause agent execution, require human approval, then resume — with SQLite, Redis, and custom approval stores.
outline: [2, 3]
---

# Human-in-the-Loop (HITL)

When an agent is about to take a high-risk action — sending an email, charging a card, deleting records — you can pause execution and require a human to approve before proceeding.

The HITL system has three parts:

| Component | Purpose |
|-----------|---------|
| `ApprovalStore` | Durable pending-approval queue |
| `waitForApproval()` | Tool helper that pauses the agent run |
| HTTP endpoint `POST /v1/approvals/:id` | Auto-exposed by `createHttpService` |

---

## How it works

```
agent.run()
  └─ tool executes
       └─ waitForApproval() ← stores approval request, throws PendingApprovalError
            └─ HTTP handler receives approve / reject decision
                 └─ agent.resume(runId) ← continues from where it paused
```

---

## Quick start

```ts
import { agent, defineTool }          from 'confused-ai';
import { createSqliteApprovalStore,
         waitForApproval }            from 'confused-ai/guard';
import { createHttpService }          from 'confused-ai/serve';
import { z }                          from 'zod';

// 1. Create a durable approval store
const approvalStore = createSqliteApprovalStore('./approvals.db');

// 2. Define a tool that requires approval
const sendEmail = defineTool()
  .name('sendEmail')
  .description('Send an email — requires human approval before sending')
  .parameters(z.object({
    to:      z.string().email(),
    subject: z.string(),
    body:    z.string(),
  }))
  .execute(async (params, ctx) => {
    // This pauses the run until a human approves
    await waitForApproval({
      runId:         ctx.runId,
      store:         approvalStore,
      actionSummary: `Send email to ${params.to}: "${params.subject}"`,
      payload:       params,
    });

    // After approval, execution resumes here
    await emailService.send(params);
    return { sent: true };
  })
  .build();

// 3. Attach to an agent and expose HTTP service
const ai = agent({
  model:        'gpt-4o',
  instructions: 'You are an email assistant.',
  tools:        [sendEmail],
});

const server = createHttpService({ agents: { email: ai }, approvalStore });
server.listen(3000);
```

---

## HTTP approval endpoints

`createHttpService` exposes these automatically:

```http
# List pending approvals
GET /v1/approvals

# Approve a pending action
POST /v1/approvals/:id/approve
Content-Type: application/json
{ "comment": "Looks good, send it" }

# Reject a pending action
POST /v1/approvals/:id/reject
Content-Type: application/json
{ "reason": "Wrong recipient" }
```

---

## Resume a paused run

```ts
// After a human submits their decision via POST /v1/approvals/:id/approve
// the server calls:
await ai.resume(runId);

// The agent run continues from after the waitForApproval() call
```

---

## Approval stores

| Store | Function | Notes |
|-------|----------|-------|
| SQLite | `createSqliteApprovalStore(path)` | Single-server persistence |
| In-memory | `new InMemoryApprovalStore()` | Dev / testing |
| Custom | Implement `ApprovalStore` interface | Redis, Postgres, etc. |

### Custom approval store

```ts
import type { ApprovalStore, ApprovalRequest } from 'confused-ai/guard';

const myApprovalStore: ApprovalStore = {
  async create(request: ApprovalRequest): Promise<string> {
    const id = crypto.randomUUID();
    await db.approvals.insert({ id, ...request });
    await notifySlack(`New approval needed: ${request.actionSummary}`);
    return id;
  },
  async getById(id: string) {
    return db.approvals.findOne({ id });
  },
  async resolve(id: string, decision: 'approved' | 'rejected', comment?: string) {
    await db.approvals.update({ id }, { decision, comment, resolvedAt: new Date() });
  },
  async listPending() {
    return db.approvals.find({ decision: null });
  },
};
```

---

## `waitForApproval()` options

| Option | Type | Description |
|--------|------|-------------|
| `runId` | `string` | From tool context `ctx.runId` |
| `store` | `ApprovalStore` | Where to persist the approval |
| `actionSummary` | `string` | Human-readable description shown in the UI |
| `payload` | `object` | Full action parameters for reviewer context |
| `timeoutMs` | `number` | Reject after N ms if unanswered (optional) |

confused-ai provides a complete HITL system:
- **`ApprovalStore`** — durable pending-approval queue
- **`requireApprovalTool`** — tool factory that creates the gate in the agentic loop
- HTTP endpoint `POST /v1/approvals/:id` exposed automatically via `createHttpService`

> **Import path:** `confused-ai/production`

---

## How it works

```
agent.run()
  └─► LLM decides to call sendEmail
        └─► requireApprovalTool intercepts
              └─► persists HitlRequest (status: 'pending')
                    └─► agent loop pauses (awaits decision)
                          └─► human reviews at /approvals UI
                                └─► POST /v1/approvals/:id { approved: true }
                                      └─► agent loop resumes
                                            └─► sendEmail executes
```

---

## Quick start

```ts
import { createAgent } from 'confused-ai';
import { defineTool } from 'confused-ai';
import {
  createSqliteApprovalStore,
  waitForApproval,
} from 'confused-ai/guard';
import { z } from 'zod';

const approvalStore = createSqliteApprovalStore('./agent.db');

// Build a HITL gate tool — the agent calls this before any risky action
const requestApproval = defineTool()
  .name('requestApproval')
  .description('Request human approval for a high-risk action before proceeding')
  .parameters(z.object({
    toolName:    z.string().describe('The tool/action requiring approval'),
    description: z.string().describe('Why this action is needed'),
    riskLevel:   z.enum(['low', 'medium', 'high', 'critical']),
  }))
  .execute(async ({ toolName, description, riskLevel }, ctx) => {
    const req = await approvalStore.create({
      runId:         ctx.runId ?? 'unknown',
      agentName:     'SupportAgent',
      toolName,
      toolArguments: { description },
      riskLevel,
      description,
      ttlMs: 30 * 60 * 1000, // 30 min window
    });
    // Blocks until a human decides (polls the store)
    const decision = await waitForApproval(approvalStore, req.id, {
      pollIntervalMs: 2_000,
      timeoutMs:      30 * 60 * 1_000,
    });
    return { approved: true, comment: decision.comment };
  })
  .build();

const sendEmail = defineTool()
  .name('sendEmail')
  .description('Send an email to a customer')
  .parameters(z.object({ to: z.string().email(), subject: z.string(), body: z.string() }))
  .execute(async ({ to, subject, body }) => {
    await mailer.send({ to, subject, body });
    return { sent: true };
  })
  .build();

const agent = createAgent({
  name: 'SupportAgent',
  instructions: 'Help customers. Always call requestApproval before sending emails.',
  tools: [requestApproval, sendEmail],
});
```

---

## HTTP runtime integration

Pass `approvalStore` to `createHttpService` — it auto-wires the approval endpoint:

```ts
import { createHttpService } from 'confused-ai/serve';
import { createSqliteApprovalStore } from 'confused-ai/guard';

const approvalStore = createSqliteApprovalStore('./agent.db');

const service = createHttpService({
  agents: { support: supportAgent },
  approvalStore,
});

// Now available:
// GET  /v1/approvals          — list pending approvals
// GET  /v1/approvals/:id      — get one approval
// POST /v1/approvals/:id      — submit a decision
```

---

## Submit a decision

```ts
// From your approval UI or webhook
await fetch(`/v1/approvals/${approvalId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    approved: true,
    comment: 'Reviewed and OK',
    decidedBy: 'supervisor@company.com',
  }),
});
```

Or directly via the store:

```ts
await approvalStore.decide(approvalId, {
  approved: false,
  comment: 'Do not contact this customer',
  decidedBy: 'alice@company.com',
});
```

---

## Approval stores

### SQLite (durable default)

```ts
import { createSqliteApprovalStore } from 'confused-ai/guard';

const store = createSqliteApprovalStore('./agent.db');
```

### In-memory (tests)

```ts
import { InMemoryApprovalStore } from 'confused-ai/guard';

const store = new InMemoryApprovalStore();
```

### Custom (Postgres, Redis, etc.)

```ts
import type { ApprovalStore, HitlRequest, ApprovalDecision } from 'confused-ai/guard';

class PostgresApprovalStore implements ApprovalStore {
  async create(req) { /* INSERT */ }
  async get(id)     { /* SELECT */ }
  async getByRunId(runId) { /* SELECT WHERE run_id = $1 */ }
  async decide(id, decision) { /* UPDATE */ }
  async listPending(agentName?) { /* SELECT WHERE status = 'pending' */ }
}
```

---

## `HitlRequest` shape

```ts
interface HitlRequest {
  id: string;
  runId: string;
  agentName: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  comment?: string;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  requestedBy?: string;
  decidedBy?: string;
}
```

---

## Handling rejection

When an approval is rejected, the agent throws `ApprovalRejectedError`. Handle it gracefully:

```ts
import { ApprovalRejectedError } from 'confused-ai/guard';

try {
  const result = await agent.run('Send a welcome email to alice@acme.com', { runId: 'run-001' });
} catch (err) {
  if (err instanceof ApprovalRejectedError) {
    console.log(`Rejected: ${err.toolName} — ${err.comment}`);
    // Notify the user, log to audit trail, etc.
  }
}
```

---

## Expiry and cleanup

Approvals automatically expire. The `expireStale()` method (if implemented) marks them:

```ts
// Run on a schedule to clean up old requests
setInterval(async () => {
  const count = await approvalStore.expireStale?.();
  if (count) console.log(`Expired ${count} stale approvals`);
}, 60_000);
```

---

## Exports

| Export | Description |
|--------|-------------|
| `waitForApproval` | Poll store until human decides (or times out) |
| `createSqliteApprovalStore` | SQLite-backed approval store |
| `InMemoryApprovalStore` | In-memory approval store (tests) |
| `SqliteApprovalStore` | Class-based SQLite approval store |
| `ApprovalRejectedError` | Thrown when an approval is rejected or times out |
| `ApprovalStore` | Interface — implement custom backend |
| `HitlRequest` | Pending approval request shape |
| `ApprovalDecision` | Decision shape |
| `ApprovalStatus` | `'pending' \| 'approved' \| 'rejected' \| 'expired'` |
