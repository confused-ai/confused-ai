# Orchestration

Build multi-agent systems with routers, handoffs, consensus voting, supervisors, and swarms.

## Router

Route requests to the most appropriate agent based on content or metadata:

```ts
import { AgentRouter } from 'confused-ai/orchestration';

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
import { createHandoff } from 'confused-ai/orchestration';

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
import { ConsensusProtocol } from 'confused-ai/orchestration';

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
import { createSupervisor, createRole } from 'confused-ai/orchestration';

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
import { createSwarm, createSwarmAgent } from 'confused-ai/orchestration';

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
import { createPipeline } from 'confused-ai/orchestration';

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
import { MessageBusImpl } from 'confused-ai/orchestration';

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
import { RoundRobinLoadBalancer } from 'confused-ai/orchestration';

const lb = new RoundRobinLoadBalancer({
  agents: [agentInstance1, agentInstance2, agentInstance3],
});

// Requests are distributed in round-robin order
const result = await lb.route({ prompt: 'Process this request' });
```
