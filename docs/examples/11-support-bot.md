# 11 · Customer Support Bot 🔴

A complete, production-grade support bot with sessions, guardrails, escalation,
and memory. This is what a real-world deployment looks like.

## What you'll learn

- Session management (multi-turn conversations)
- Guardrails (block harmful content, enforce topic boundaries)
- Escalation to a human agent
- Conversation memory per customer

## Architecture

```
Customer message
     ↓
Input guardrail (profanity, PII masking, topic check)
     ↓
Retrieve customer memory (name, past issues, preferences)
     ↓
Support Agent runs
  ├── searchKnowledgeBase tool
  ├── lookupOrder tool
  ├── createTicket tool
  └── escalateToHuman tool
     ↓
Output guardrail (no hallucinated phone numbers, no harmful advice)
     ↓
Save conversation to memory
     ↓
Customer receives response
```

## Code

```ts
// support-bot.ts
import { z } from 'zod';
import { createAgent, tool } from 'confused-ai';
import { Guardrail } from 'confused-ai/guardrails';
import { InMemoryStore } from 'confused-ai/memory';
import { createStorage } from 'confused-ai/storage';

// ── Storage + Memory ───────────────────────────────────────────────────────
const storage = createStorage({ type: 'file', path: './data/support.json' });
const customerMemory = new InMemoryStore({ storage });
await customerMemory.load();

// ── Guardrails ─────────────────────────────────────────────────────────────
const inputGuardrail = new Guardrail({
  name: 'input-safety',
  rules: [
    // Block out-of-scope topics
    {
      type: 'topic',
      blocked: ['politics', 'violence', 'adult content'],
      response: "I'm a customer support bot. I can only help with product-related questions.",
    },
    // Detect + mask PII before it reaches the LLM
    {
      type: 'pii',
      mask: true,           // replace with [REDACTED]
      fields: ['ssn', 'credit-card', 'password'],
    },
  ],
});

const outputGuardrail = new Guardrail({
  name: 'output-safety',
  rules: [
    // Never return hallucinated phone numbers
    {
      type: 'pattern',
      pattern: /\+?[\d\s\-()]{10,}/,
      action: 'warn',
      message: 'Agent returned a phone number — verify before sending.',
    },
  ],
});

// ── Tools ──────────────────────────────────────────────────────────────────
const searchKnowledge = tool({
  name: 'searchKnowledge',
  description: 'Search the product knowledge base for answers',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => ({
    results: [
      { title: 'How to reset password', content: 'Go to Settings > Security > Reset Password...' },
      { title: 'Billing cycle', content: 'Bills are generated on the 1st of each month...' },
    ],
  }),
});

const lookupOrder = tool({
  name: 'lookupOrder',
  description: 'Look up an order by ID or customer email',
  parameters: z.object({
    orderId: z.string().optional(),
    email: z.string().email().optional(),
  }),
  execute: async ({ orderId, email }) => ({
    orderId: orderId ?? 'ORD-5001',
    customer: 'Alice',
    status: 'shipped',
    estimatedDelivery: '2026-04-28',
    items: ['Pro Plan subscription'],
  }),
});

const createTicket = tool({
  name: 'createTicket',
  description: 'Create a support ticket for issues that need follow-up',
  parameters: z.object({
    subject: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
  }),
  needsApproval: false,
  execute: async ({ subject, priority }) => ({
    ticketId: `TKT-${Date.now()}`,
    subject,
    priority,
    status: 'open',
    message: 'A support agent will respond within 24 hours.',
  }),
});

const escalateToHuman = tool({
  name: 'escalateToHuman',
  description: 'Transfer the conversation to a human agent for complex issues',
  parameters: z.object({
    reason: z.string().describe('Why human intervention is needed'),
    urgency: z.enum(['low', 'medium', 'high', 'critical']),
    summary: z.string().describe('Summary of the conversation so far'),
  }),
  execute: async ({ reason, urgency, summary }) => {
    // In production: call your CRM / helpdesk API (Zendesk, Intercom, etc.)
    console.log(`🔴 ESCALATION [${urgency}]: ${reason}`);
    return {
      escalated: true,
      queuePosition: 3,
      estimatedWait: '8 minutes',
      message: `I've escalated this to our team (${urgency} priority). An agent will join shortly.`,
    };
  },
});

// ── Support Agent ──────────────────────────────────────────────────────────
const supportAgent = createAgent({
  name: 'support-bot',
  model: 'gpt-4o-mini',
  instructions: `
    You are a friendly, professional customer support agent.
    
    Guidelines:
    - Greet customers by name if you know it
    - Search the knowledge base before answering
    - Look up order details when asked about orders
    - Create a ticket if the issue needs follow-up
    - Escalate to a human if: the customer is very upset, the issue is complex,
      or you've tried twice without resolving it
    - Never make up information
    - Keep responses concise (3-5 sentences max)
    - End each response by asking if there's anything else you can help with
  `,
  tools: [
    searchKnowledge,
    lookupOrder,
    createTicket,
    escalateToHuman,
  ],
  guardrails: {
    input: inputGuardrail,
    output: outputGuardrail,
  },
  memory: customerMemory,
  sessionStore: new InMemoryStore(),
});

// ── Handle a conversation ──────────────────────────────────────────────────
const customerId = 'cust_alice_123';

// First message
const r1 = await supportAgent.run(
  "Hi, I can't log into my account. My email is alice@example.com.",
  { userId: customerId }
);
console.log('Bot:', r1.text);

// Follow-up
const r2 = await supportAgent.run(
  "I tried that but it still says 'invalid password'. This is urgent!",
  { userId: customerId }
);
console.log('Bot:', r2.text);

// Agent may escalate if frustrated tone detected
```

## HTTP server integration

Expose as a REST endpoint:

```ts
import { createServer } from 'node:http';

const sessions = new Map<string, InMemoryStore>();

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/chat') {
    res.writeHead(404); res.end(); return;
  }

  const body = await readBody(req);
  const { message, sessionId, userId } = JSON.parse(body);

  // Get or create session store per conversation
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new InMemoryStore());
  }

  const result = await supportAgent.run(message, {
    userId,
    sessionStore: sessions.get(sessionId),
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ text: result.text, sessionId }));
});

server.listen(3000);
```

## What's next?

- [12 · Observability & Hooks](./12-observability) — monitor every agent action
- [13 · Production Resilience](./13-production) — make it bulletproof
