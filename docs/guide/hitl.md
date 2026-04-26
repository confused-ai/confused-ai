# Human-in-the-Loop (HITL)

When an agent is about to take a high-risk action — sending an email, charging a card, deleting records — you can pause execution and require a human to approve before proceeding.

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
} from 'confused-ai/production';
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
import { createHttpService } from 'confused-ai/runtime';
import { createSqliteApprovalStore } from 'confused-ai/production';

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
import { createSqliteApprovalStore } from 'confused-ai/production';

const store = createSqliteApprovalStore('./agent.db');
```

### In-memory (tests)

```ts
import { InMemoryApprovalStore } from 'confused-ai/production';

const store = new InMemoryApprovalStore();
```

### Custom (Postgres, Redis, etc.)

```ts
import type { ApprovalStore, HitlRequest, ApprovalDecision } from 'confused-ai/production';

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
import { ApprovalRejectedError } from 'confused-ai/production';

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
