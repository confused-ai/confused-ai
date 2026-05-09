---
title: Multi-Agent Orchestration
description: Teams, pipelines, swarms, supervisors, routers, and A2A protocol for multi-agent systems.
outline: [2, 3]
---

# Multi-Agent Orchestration

`@confused-ai/orchestration` provides every multi-agent pattern you need. Compose agents into teams, pipelines, swarms, and hierarchies.

## `createTeam()` — ergonomic API

The easiest way to orchestrate agents:

```ts
import { createTeam } from 'confused-ai/orchestration';
import { defineRole } from 'confused-ai/orchestration';

const researcher = defineRole({
  role: 'Researcher',
  backstory: 'Expert at finding and verifying information online.',
  goal: 'Return well-sourced research notes.',
  llm: myProvider,
  tools: [webSearchTool, scraperTool],
});

const writer = defineRole({
  role: 'Writer',
  backstory: 'Expert at crafting clear, engaging articles.',
  goal: 'Write polished content from research notes.',
  llm: myProvider,
});

const reviewer = defineRole({
  role: 'Reviewer',
  backstory: 'Critical editor who checks facts and style.',
  goal: 'Return edited, publication-ready content.',
  llm: myProvider,
});

const team = createTeam({
  name: 'ContentTeam',
  mode: 'pipeline',               // research → write → review in sequence
  agents: [researcher, writer, reviewer],
});

const result = await team.run('Write a post about the future of TypeScript');
console.log(result.output);       // final reviewer output
console.log(result.agentResults); // per-agent breakdown
```

### Team modes

| Mode | Behaviour |
|------|-----------|
| `pipeline` | Sequential — each agent receives the previous agent's output |
| `collaborate` | Sequential — same as pipeline (alias) |
| `coordinate` | Parallel — all agents run concurrently, results are merged |
| `route` | Routes the prompt to the single most capable agent |

## AgentTeam

More control with `AgentTeam`:

```ts
import { AgentTeam } from 'confused-ai/orchestration';

const team = new AgentTeam([researchAgent, writerAgent, reviewerAgent]);
const result = await team.run('Research and write a blog post about Rust');
```

## AgentPipeline

Explicit sequential pipeline with named stages:

```ts
import { AgentPipeline } from 'confused-ai/orchestration';

const pipeline = new AgentPipeline([
  { name: 'research', agent: researchAgent },
  { name: 'draft',    agent: writerAgent },
  { name: 'review',   agent: reviewerAgent },
]);

const result = await pipeline.run('AI trends in 2025');
console.log(result.stageOutputs.research);  // researcher's notes
console.log(result.stageOutputs.draft);     // writer's draft
console.log(result.output);                 // reviewer's final text
```

## AgentSupervisor

Hierarchical — a supervisor agent delegates to specialist workers:

```ts
import { AgentSupervisor } from 'confused-ai/orchestration';

const supervisor = new AgentSupervisor({
  supervisor: plannerAgent,
  workers: [
    { name: 'coder',    agent: codingAgent },
    { name: 'tester',   agent: testingAgent },
    { name: 'deployer', agent: deployAgent },
  ],
});

const result = await supervisor.run('Build and deploy a REST API for user management');
```

The supervisor decides which worker to call and when to declare completion.

## AgentSwarm

Autonomous agents that hand off to each other dynamically:

```ts
import { AgentSwarm } from 'confused-ai/orchestration';

const swarm = new AgentSwarm({
  agents: [
    { name: 'triage',  agent: triageAgent,  capabilities: ['classify', 'route'] },
    { name: 'billing', agent: billingAgent, capabilities: ['payments', 'refunds'] },
    { name: 'support', agent: supportAgent, capabilities: ['troubleshoot', 'escalate'] },
  ],
  entryAgent: 'triage',
  maxHandoffs: 5,
});

const result = await swarm.run('I was charged twice for my subscription');
```

## AgentRouter

Route to the right specialist based on the prompt:

```ts
import { AgentRouter } from 'confused-ai/orchestration';

const router = new AgentRouter({
  agents: [
    { name: 'sql-expert',  agent: sqlAgent,     capabilities: ['SQL', 'database', 'query'] },
    { name: 'py-expert',   agent: pythonAgent,  capabilities: ['Python', 'pandas', 'numpy'] },
    { name: 'ts-expert',   agent: tsAgent,      capabilities: ['TypeScript', 'JavaScript', 'Node'] },
  ],
  strategy: 'semantic',  // 'semantic' | 'keyword' | 'llm'
});

const result = await router.run('Write a pandas DataFrame transformation');
// → routed to py-expert
```

## Consensus (multi-agent voting)

Get multiple agents to vote and agree on an answer:

```ts
import { AgentConsensus } from 'confused-ai/orchestration';

const consensus = new AgentConsensus({
  agents: [agentA, agentB, agentC],
  strategy: 'majority',   // 'majority' | 'unanimous' | 'weighted'
  timeout: 30_000,
});

const result = await consensus.run('Should we migrate to microservices?');
console.log(result.decision);    // agreed answer
console.log(result.votes);       // per-agent votes
console.log(result.confidence);  // agreement score
```

## compose() and pipe()

Functional helpers for simple chains:

```ts
import { compose, pipe } from 'confused-ai';

// compose: output of one feeds next
const chain = compose(researchAgent, writerAgent);
const result = await chain.run('AI in 2025');

// pipe: same as compose, just different syntax
const result2 = await pipe(userInput, [triage, specialist, formatter]);
```

## Agent-to-Agent (A2A) protocol

Distributed agents over HTTP following Google's A2A spec:

```ts
import { A2AServer, A2AClient } from 'confused-ai/orchestration';

// Server side — expose an agent over HTTP
const server = new A2AServer({ agent: myAgent, port: 8080 });
await server.start();

// Client side — call a remote agent as if it were local
const client = new A2AClient({ url: 'http://agent-service:8080' });
const result = await client.run({ prompt: 'Analyse this dataset' });
```

## Message Bus

Pub/sub event bus for agent-to-agent communication:

```ts
import { MessageBusImpl } from 'confused-ai/orchestration';

const bus = new MessageBusImpl({ maxMessages: 10_000 });

// Subscribe
bus.subscribe('analysis-done', async (message) => {
  console.log('Received:', message.payload);
});

// Publish
bus.publish({ topic: 'analysis-done', payload: { result: '...' } });

// Wait for a topic
const event = await bus.waitFor('analysis-done', { timeout: 10_000 });
```

## Load balancing

Distribute requests across multiple agent instances:

```ts
import { RoundRobinLoadBalancer, LeastLoadedBalancer } from 'confused-ai/orchestration';

const balancer = new RoundRobinLoadBalancer([agent1, agent2, agent3]);
// or
const smart = new LeastLoadedBalancer([agent1, agent2, agent3]);

const agent = await smart.next();
const result = await agent.run({ prompt: '...' });
```

## Distributed tracing across agents

```ts
import { generateTraceparent, injectTraceHeaders, extractTraceContext } from 'confused-ai/orchestration';

// Generate a W3C trace context
const trace = generateTraceparent();

// Inject into outgoing HTTP headers
const headers = injectTraceHeaders({}, trace);

// Extract from incoming request
const ctx = extractTraceContext(req.headers);
```
