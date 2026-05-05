---
title: Orchestration
description: Multi-agent patterns — router, handoff, consensus, supervisor, swarm, pipeline, message bus. Any topology in TypeScript.
outline: [2, 3]
---

# Orchestration

confused-ai provides six multi-agent patterns. Mix and match them in a single application — they all implement the same run interface.

| Pattern | API | Use case |
|---------|-----|---------|
| **Pipeline** | `compose()` | Serial: output flows A → B → C |
| **Router** | `AgentRouter` | One of N agents handles the request |
| **Handoff** | `createHandoff` | Agent A delegates to a specialist mid-run |
| **Consensus** | `ConsensusProtocol` | Multiple agents vote on a response |
| **Supervisor** | `createSupervisor` | Coordinator manages a worker team |
| **Swarm** | `createSwarm` | Peer-to-peer handoffs |

---

## Pipeline — `compose()`

Chain agents serially — output of each becomes input of the next.

```ts
import { agent, compose } from 'confused-ai';

const researcher = agent({
  model:        'gpt-4o',
  instructions: 'Research the topic thoroughly. Return bullet-point findings with sources.',
});

const writer = agent({
  model:        'gpt-4o',
  instructions: 'Write a polished blog post from the research notes provided.',
});

const editor = agent({
  model:        'gpt-4o-mini',
  instructions: 'Proofread for grammar, clarity, and conciseness. Return the improved text.',
});

// researcher → writer → editor
const pipeline = compose(researcher, writer, editor);
const result   = await pipeline.run('The rise of edge computing in 2026');
console.log(result.text); // editor-polished blog post
```

Optional transform between stages:

```ts
const pipeline = compose(researcher, writer, {
  when:      (result) => result.text.length > 50, // skip writer if no findings
  transform: (result) => `Research findings:\n\n${result.text}`,
});
```

---

## Router — `AgentRouter`

Route each request to the most capable agent based on content, keywords, or metadata.

```ts
import { AgentRouter } from 'confused-ai/workflow';

const router = new AgentRouter({
  agents: {
    billing: {
      agent:        billingAgent,
      capabilities: ['invoice', 'payment', 'refund', 'charge', 'subscription'],
    },
    support: {
      agent:        supportAgent,
      capabilities: ['help', 'issue', 'bug', 'error', 'troubleshoot'],
    },
    general: {
      agent:        generalAgent,
      capabilities: [],             // catch-all
    },
  },
  strategy: 'capability-match',    // 'capability-match' | 'round-robin' | 'least-loaded'
  fallback:  'general',
});

const result = await router.route('I need a refund for invoice #1042');
// → routed to billingAgent automatically
```

---

## Handoff — `createHandoff`

One agent handles the initial classification, then hands off to the right specialist.

```ts
import { createHandoff } from 'confused-ai/workflow';

const handoff = createHandoff({
  from: triageAgent,
  to: {
    billing:   billingAgent,
    technical: techSupportAgent,
    legal:     legalAgent,
  },
  router: async (context) => {
    const text = context.prompt.toLowerCase();
    if (/bill|invoice|charge|refund/i.test(text)) return 'billing';
    if (/legal|contract|gdpr/i.test(text))         return 'legal';
    return 'technical';
  },
});

const result = await handoff.execute('My app keeps crashing on login after the latest update');
// triageAgent classifies → techSupportAgent finishes
```

---

## Consensus — `ConsensusProtocol`

Multiple agents independently answer, then a voting strategy picks or merges the best response. Use for high-stakes decisions.

```ts
import { ConsensusProtocol } from 'confused-ai/workflow';

const panel = new ConsensusProtocol({
  agents: {
    analyst1: agent({ model: 'gpt-4o',       instructions: 'Financial risk analyst.' }),
    analyst2: agent({ model: 'claude-opus-4-5', instructions: 'Financial risk analyst.' }),
    analyst3: agent({ model: 'gpt-4o',       instructions: 'Financial risk analyst.' }),
  },
  strategy: 'majority-vote',  // 'majority-vote' | 'unanimous' | 'weighted' | 'best-of-n'
  weights: { analyst1: 1, analyst2: 2, analyst3: 1 }, // analyst2 gets double weight
  quorum: 2,
});

const result = await panel.decide('Should we approve this $500,000 wire transfer?');
console.log(result.decision);    // 'approved' | 'rejected'
console.log(result.confidence);  // 0.75
console.log(result.votes);       // individual agent responses
```

---

## Supervisor — `createSupervisor`

A coordinator agent delegates tasks to specialist workers and merges their outputs.

```ts
import { createSupervisor, createRole } from 'confused-ai/workflow';

const supervisor = createSupervisor({
  name: 'ArticleSupervisor',
  subAgents: [
    { agent: researchAgent, role: createRole('researcher', 'Gathers facts and sources') },
    { agent: writerAgent,   role: createRole('writer',     'Writes clear, engaging prose') },
    { agent: editorAgent,   role: createRole('editor',     'Polishes grammar and clarity') },
  ],
  coordinationType: 'sequential', // 'sequential' | 'parallel'
});

const result = await supervisor.run(
  { prompt: 'Write a 1000-word article about the TypeScript 6.0 release' },
  context
);
```

---

## Swarm — `createSwarm`

Agents collaborate peer-to-peer, handing control to each other based on expertise.

```ts
import { createSwarm, createSwarmAgent } from 'confused-ai/workflow';

const swarm = createSwarm({
  name: 'SupportSwarm',
  agents: [
    createSwarmAgent({
      name:         'triage',
      instructions: 'Classify the request. Hand off to billing or support.',
    }),
    createSwarmAgent({
      name:         'billing',
      instructions: 'Resolve billing and payment questions. Hand off to support for technical issues.',
    }),
    createSwarmAgent({
      name:         'support',
      instructions: 'Resolve technical issues. Escalate complex ones back to triage.',
    }),
  ],
  maxSubtasks: 10,
});

const result = await swarm.orchestrate('I was charged twice for my subscription last month');
console.log(result.finalOutput);
```

---

## Message Bus

Decouple agents with a publish/subscribe bus — good for event-driven architectures.

```ts
import { MessageBusImpl } from 'confused-ai/workflow';

const bus = new MessageBusImpl();

// Subscribe (by agent ID + message type filter)
bus.subscribe('processor', { type: 'data-ready' }, async (msg) => {
  const analysis = await analyserAgent.run(`Analyse: ${JSON.stringify(msg.payload)}`);
  await bus.send({ from: 'processor', to: 'reporter', type: 'analysis-done', payload: { analysis: analysis.text } });
});

// Publish
await bus.send({
  from:     'fetcher',
  to:       'processor',
  type:     'data-ready',
  payload:  { rows: fetchedRows },
  priority: 'high',
});
```

---

## Load Balancer

Distribute requests across identical agent instances:

```ts
import { RoundRobinLoadBalancer } from 'confused-ai/workflow';

const lb = new RoundRobinLoadBalancer({
  agents: [agentInstance1, agentInstance2, agentInstance3],
});

// Routes automatically round-robin
const result = await lb.run('Process this task');
```

---

## A2A — Agent-to-Agent (HTTP)

Call agents hosted on external services via the [Google A2A spec](https://google.github.io/A2A/):

```ts
import { createHttpA2AClient } from 'confused-ai/workflow';

const a2a = createHttpA2AClient({
  baseUrl: 'https://broker.example.com/a2a',
});

const reply = await a2a.send({
  from:    'my-agent',
  to:      'remote-summariser',
  type:    'request',
  payload: { task: 'Summarise this document', doc: longText },
});

console.log(reply.payload);
```

## Router

Route requests to the most appropriate agent based on content or metadata:

```ts
import { AgentRouter } from 'confused-ai/workflow';

const router = new AgentRouter({
  agents: {
    billing: {
      agent: billingAgent,
      capabilities: ['invoice', 'payment', 'refund', 'charge'],
    },
    support: {
      agent: supportAgent,
      capabilities: ['help', 'issue', 'bug', 'troubleshoot'],
    },
    general: {
      agent: generalAgent,
      capabilities: ['general', 'question', 'information'],
    },
  },
  strategy: 'capability-match', // or 'round-robin', 'least-loaded'
  fallback: 'general',
});

const result = await router.route('I need a refund for my last invoice');
// Routed to billingAgent automatically
```

## Handoff

One agent hands off to another mid-conversation:

```ts
import { createHandoff } from 'confused-ai/workflow';

const handoff = createHandoff({
  from: triageAgent,
  to: {
    billing: billingAgent,
    technical: techSupportAgent,
  },
  // Router decides which specialist to use
  router: async (context) => {
    if (/bill|invoice|charge/i.test(context.prompt)) return 'billing';
    return 'technical';
  },
});

const result = await handoff.execute('My app keeps crashing on login');
// → triageAgent starts, router picks 'technical', techSupportAgent finishes
```

## Consensus

Multiple agents vote on a response — use for high-stakes decisions:

```ts
import { ConsensusProtocol } from 'confused-ai/workflow';

const consensus = new ConsensusProtocol({
  agents: { analyst1: agent1, analyst2: agent2, analyst3: agent3 },
  strategy: 'majority-vote',  // 'majority-vote' | 'unanimous' | 'weighted' | 'best-of-n'
  weights: { analyst1: 1, analyst2: 2, analyst3: 1 }, // optional — analyst2 double weight
  quorum: 2,
});

const result = await consensus.decide('Should we approve this transaction for $50,000?');
console.log(result.decision);    // 'approved'
console.log(result.confidence);  // 0.67
console.log(result.votes);       // individual agent votes
```

## Supervisor

A supervisor agent manages a team and delegates tasks:

```ts
import { createSupervisor, createRole } from 'confused-ai/workflow';

const supervisor = createSupervisor({
  name: 'ArticleSupervisor',
  subAgents: [
    { agent: researchAgent, role: createRole('researcher', 'Gathers information and facts') },
    { agent: writerAgent,   role: createRole('writer',     'Writes clear prose from research') },
    { agent: editorAgent,   role: createRole('editor',     'Polishes and proofreads content') },
  ],
  coordinationType: 'sequential', // or 'parallel'
});

const output = await supervisor.run(
  { prompt: 'Write a 1000-word article about TypeScript 5.0' },
  context
);
```

## Swarm

Agents collaborate peer-to-peer, handing off freely among themselves:

```ts
import { createSwarm, createSwarmAgent } from 'confused-ai/workflow';

const swarm = createSwarm({
  name: 'SupportSwarm',
  agents: [
    createSwarmAgent({ name: 'triage',  instructions: 'Classify the request and hand off.' }),
    createSwarmAgent({ name: 'billing', instructions: 'Handle billing and payment questions.' }),
    createSwarmAgent({ name: 'support', instructions: 'Resolve technical issues.' }),
  ],
  maxSubtasks: 10,
});

const result = await swarm.orchestrate('I have a billing issue with my account');
console.log(result.finalOutput);
```

## Sequential pipeline

Chain agents with `compose()` — output of each becomes input of the next:

```ts
import { agent, compose } from 'confused-ai';

const researcher = agent('Research topics and return key findings.');
const analyst    = agent('Analyse findings and identify key trends.');

const pipeline = compose(researcher, analyst);
const result   = await pipeline.run('Analyze the current state of the AI industry');
console.log(result.text);
```

For a conditional pipeline, pass options:

```ts
const conditional = compose(researcher, analyst, {
  when:      (result) => result.text.length > 100,
  transform: (result) => `Research findings:\n\n${result.text}`,
});
```

## Low-level pipeline

For pipelines involving `AgenticRunner`-style `Agent` instances (not `createAgent` results), use `createPipeline()`:

```ts
import { createPipeline } from 'confused-ai/workflow';

const pipeline = createPipeline({
  name: 'DataPipeline',
  agents: [
    fetchDataAgent,    // fetches raw data
    cleanDataAgent,    // cleans and normalizes
    analyzeDataAgent,  // performs analysis
    reportAgent,       // writes the final report
  ],
});

const output = await pipeline.run({ prompt: 'Analyze Q3 sales data' }, context);
```

## Message bus

Decouple agents with a publish/subscribe message bus:

```ts
import { MessageBusImpl } from 'confused-ai/workflow';

const bus = new MessageBusImpl();

// Subscribe (by agent ID + filter)
bus.subscribe('processor-agent', { type: 'data-ready' }, async (msg) => {
  console.log('Received:', msg.payload);
});

// Send a message
await bus.send({
  from:    'fetcher-agent',
  to:      'processor-agent',
  type:    'data-ready',
  payload: { data: fetchedData },
  priority: 'high',
});
```

## Load balancer

Distribute requests across multiple instances of the same agent:

```ts
import { RoundRobinLoadBalancer } from 'confused-ai/workflow';

const lb = new RoundRobinLoadBalancer({
  agents: [agentInstance1, agentInstance2, agentInstance3],
});

// Requests are distributed in round-robin order
const result = await lb.route({ prompt: 'Process this request' });
```
