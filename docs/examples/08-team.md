# 08 · Multi-Agent Team 🔴

A team is a group of specialized agents where a **router** decides which agent
should handle each request. Each agent is an expert in its domain.

## What you'll learn

- How to create specialized sub-agents
- How to build a router that delegates to the right expert
- How to use `Team` for automatic routing
- How to handle handoffs between agents

## Architecture

```
User message
     ↓
  Router (decides)
  ├── BillingAgent    ← billing, refunds, invoices
  ├── TechAgent       ← bugs, errors, how-to questions
  └── SalesAgent      ← pricing, upgrades, new features
     ↓
  Chosen agent handles the request
     ↓
  User gets expert answer
```

## Code

```ts
// multi-agent-team.ts
import { z } from 'zod';
import { createAgent, tool } from 'confused-ai';
import { Team } from 'confused-ai/orchestration';

// ── Specialist tools ───────────────────────────────────────────────────────
const lookupInvoice = tool({
  name: 'lookupInvoice',
  description: 'Look up an invoice by ID',
  parameters: z.object({ invoiceId: z.string() }),
  execute: async ({ invoiceId }) => ({
    id: invoiceId,
    amount: 99.00,
    status: 'paid',
    date: '2026-03-01',
  }),
});

const searchDocs = tool({
  name: 'searchDocs',
  description: 'Search technical documentation',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => ({
    results: [
      { title: 'Getting Started', url: '/docs/start', snippet: '...' },
      { title: 'API Reference', url: '/docs/api', snippet: '...' },
    ],
  }),
});

const getPricing = tool({
  name: 'getPricing',
  description: 'Get pricing plans and feature comparisons',
  parameters: z.object({ plan: z.string().optional() }),
  execute: async ({ plan }) => ({
    plans: [
      { name: 'Starter', price: '$0/mo', features: ['5 agents', '1k calls/mo'] },
      { name: 'Pro', price: '$49/mo', features: ['Unlimited agents', '100k calls/mo'] },
      { name: 'Enterprise', price: 'Custom', features: ['SLA', 'Custom models'] },
    ],
  }),
});

// ── Specialist agents ──────────────────────────────────────────────────────
const billingAgent = createAgent({
  name: 'billing-specialist',
  model: 'gpt-4o-mini',
  instructions: `
    You are a billing specialist. Handle questions about:
    - Invoices and receipts
    - Refunds and chargebacks
    - Payment methods and billing cycles
    Be precise with numbers. Always look up invoice details before discussing them.
  `,
  tools: [lookupInvoice],
});

const techAgent = createAgent({
  name: 'tech-specialist',
  model: 'gpt-4o',   // more capable model for technical reasoning
  instructions: `
    You are a technical support specialist. Handle questions about:
    - API errors and debugging
    - Integration issues
    - How-to questions about the product
    Search documentation before answering. Give code examples when helpful.
  `,
  tools: [searchDocs],
});

const salesAgent = createAgent({
  name: 'sales-specialist',
  model: 'gpt-4o-mini',
  instructions: `
    You are a sales consultant. Handle questions about:
    - Pricing and plan comparisons
    - Feature availability
    - Upgrades and enterprise deals
    Be helpful and informative, not pushy.
  `,
  tools: [getPricing],
});

// ── Build the team ─────────────────────────────────────────────────────────
const team = new Team({
  name: 'customer-success-team',
  agents: [billingAgent, techAgent, salesAgent],
  // The router can be automatic (LLM-based) or custom:
  router: 'auto',  // LLM reads each agent's name+instructions to route
});

// ── Run it ─────────────────────────────────────────────────────────────────
const r1 = await team.run("I was charged twice for invoice INV-1234, can you help?");
console.log(r1.text);
// → billing-specialist handles it, looks up INV-1234

const r2 = await team.run("How do I set up webhooks in your API?");
console.log(r2.text);
// → tech-specialist handles it, searches docs

const r3 = await team.run("What's the difference between Pro and Enterprise?");
console.log(r3.text);
// → sales-specialist handles it, returns plan comparison
```

## Custom router

```ts
const team = new Team({
  agents: [billingAgent, techAgent, salesAgent],
  router: async (message, agents) => {
    // Simple keyword routing (deterministic, no LLM call)
    const msg = message.toLowerCase();
    if (msg.includes('invoice') || msg.includes('refund') || msg.includes('charge')) {
      return agents.find(a => a.name === 'billing-specialist')!;
    }
    if (msg.includes('error') || msg.includes('api') || msg.includes('how to')) {
      return agents.find(a => a.name === 'tech-specialist')!;
    }
    if (msg.includes('price') || msg.includes('plan') || msg.includes('upgrade')) {
      return agents.find(a => a.name === 'sales-specialist')!;
    }
    // Default to tech for anything unrecognised
    return agents.find(a => a.name === 'tech-specialist')!;
  },
});
```

## Agent handoffs

An agent can hand off to another mid-conversation:

```ts
import { handoff } from 'confused-ai/orchestration';

const triageAgent = createAgent({
  name: 'triage',
  model: 'gpt-4o-mini',
  instructions: 'Determine what the user needs and hand off to the right specialist.',
  tools: [
    handoff(billingAgent, 'Hand off to billing when user has invoice or payment questions'),
    handoff(techAgent,    'Hand off to tech when user has technical or API questions'),
    handoff(salesAgent,   'Hand off to sales when user asks about plans or pricing'),
  ],
});
```

## What's next?

- [09 · Supervisor Workflow](./09-supervisor) — one boss, many workers
- [11 · Customer Support Bot](./11-support-bot) — team inside a real product
