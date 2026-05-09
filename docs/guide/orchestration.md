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

## `Team` — direct team class

More control with `Team` directly:

```ts
import { Team } from 'confused-ai/orchestration';
import type { TeamAgent } from 'confused-ai/orchestration';

const members: TeamAgent[] = [
  { id: 'researcher', name: 'Researcher', agent: researchAgent, role: { name: 'Researcher', description: 'Finds facts' } },
  { id: 'writer',     name: 'Writer',     agent: writerAgent,   role: { name: 'Writer',     description: 'Writes content' } },
  { id: 'reviewer',   name: 'Reviewer',   agent: reviewerAgent, role: { name: 'Reviewer',   description: 'Reviews output' } },
];

const team = new Team({
  name: 'ContentTeam',
  agents: members,
  strategy: 'sequential',  // 'parallel' | 'sequential' | 'hierarchical'
});

const result = await team.run('Research and write a blog post about Rust');
```

## `createPipeline()` — sequential pipeline

Run agents in sequence — output of each feeds into the next:

```ts
import { createPipeline } from 'confused-ai/orchestration';

const pipeline = createPipeline({
  name: 'ContentPipeline',
  agents: [researchAgent, writerAgent, reviewerAgent],
});

// pipeline is an OrchestrableAgent — call .run() on it
const result = await pipeline.run({ prompt: 'AI trends in 2025' }, ctx);
```

## `createSupervisor()` — hierarchical delegation

A coordinator that delegates subtasks to specialist sub-agents:

```ts
import { createSupervisor } from 'confused-ai/orchestration';
import { CoordinationType } from 'confused-ai/orchestration';

const supervisor = createSupervisor({
  name: 'EngineeringSupervisor',
  subAgents: [
    { agent: codingAgent,   role: { name: 'Coder',    description: 'Writes code' } },
    { agent: testingAgent,  role: { name: 'Tester',   description: 'Writes tests' } },
    { agent: deployAgent,   role: { name: 'Deployer', description: 'Deploys artifacts' } },
  ],
  coordinationType: CoordinationType.SEQUENTIAL, // or PARALLEL
});

// supervisor is an OrchestrableAgent
const result = await supervisor.run({ prompt: 'Build and deploy a REST API' }, ctx);
```

## `SwarmOrchestrator` / `createSwarm()` — dynamic swarm

Autonomous agents that decompose tasks and run subtasks in parallel:

```ts
import { createSwarm } from 'confused-ai/orchestration';

const swarm = createSwarm({
  llmConfig: {
    provider: myLLMProvider,
    temperature: 0.7,
  },
  maxSubagents: 5,
  maxExecutionTimeMs: 60_000,
});

const result = await swarm.run(
  { prompt: 'I was charged twice for my subscription. Investigate and resolve.' },
  ctx,
);
// result.aggregatedOutput — combined output
// result.metrics          — parallelism efficiency
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

## Consensus — `ConsensusProtocol` / `createConsensus()`

Get multiple agents to independently analyse and vote:

```ts
import { createConsensus } from 'confused-ai/orchestration';

const consensus = createConsensus({
  agents: { analyst1: agentA, analyst2: agentB, analyst3: agentC },
  strategy: 'majority-vote',  // 'majority-vote' | 'unanimous' | 'weighted' | 'best-of-n'
  quorum: 2,                  // min agents that must agree (default: ceil(n/2))
  parallel: true,             // run all agents concurrently
  agentTimeoutMs: 30_000,
});

const result = await consensus.decide('Should we migrate to microservices?');
console.log(result.decision);    // agreed answer
console.log(result.confidence);  // agreement ratio (e.g. 0.67)
console.log(result.votes);       // per-agent votes
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
