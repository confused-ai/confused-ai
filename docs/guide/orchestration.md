---
title: Orchestration
description: Build multi-agent teams, supervisors, swarms, handoffs, consensus protocols, and A2A communication with the orchestration primitives.
outline: [2, 3]
---

# Orchestration

The framework ships a full orchestration layer for coordinating multiple agents. Import from `confused-ai/workflow` or `confused-ai`.

```ts
import {
  Team, SwarmOrchestrator, createSupervisor, createHandoff,
  createAgentRouter, createConsensus, createPipeline,
  compose, pipe,
} from 'confused-ai/workflow';
```

---

## `compose` — sequential pipeline

Chain agents sequentially. Each agent's output becomes the next agent's input.

```ts
import { compose, createAgent } from 'confused-ai';

const researcher = createAgent({ name: 'researcher', instructions: 'Research the topic.', model: 'gpt-4o', apiKey: '...' });
const writer     = createAgent({ name: 'writer',     instructions: 'Write a clear report from the research.', model: 'gpt-4o-mini', apiKey: '...' });
const editor     = createAgent({ name: 'editor',     instructions: 'Edit and polish the report.', model: 'gpt-4o-mini', apiKey: '...' });

const pipeline = compose(researcher, writer, editor);

const result = await pipeline.run('Write a report on the state of quantum computing in 2026.');
console.log(result.text);
```

### `pipe` — functional style

```ts
import { pipe } from 'confused-ai/workflow';

const process = pipe(
  (input: string) => researcher.run(input),
  (r) => writer.run(r.text),
  (r) => editor.run(r.text),
);

const result = await process('Quantum computing 2026');
```

---

## `Team` — role-based coordination

Coordinate a team of specialist agents under a named team identity:

```ts
import { Team, createAgent } from 'confused-ai';

const codeAgent   = createAgent({ name: 'coder',    instructions: 'Write production-quality TypeScript.', model: 'gpt-4o', apiKey: '...' });
const reviewAgent = createAgent({ name: 'reviewer', instructions: 'Review code for bugs and style.', model: 'gpt-4o-mini', apiKey: '...' });
const docsAgent   = createAgent({ name: 'docs',     instructions: 'Write API documentation.', model: 'gpt-4o-mini', apiKey: '...' });

const engineeringTeam = new Team({
  name: 'engineering',
  members: [codeAgent, reviewAgent, docsAgent],
  coordinator: 'round-robin',  // 'round-robin' | 'least-loaded' | 'capability'
});

const result = await engineeringTeam.run('Implement a rate-limiter class with tests and docs.');
console.log(result.text);
```

---

## `createSupervisor` — delegating coordinator

A supervisor agent decides which specialist to delegate each task to:

```ts
import { createSupervisor, createAgent } from 'confused-ai';

const supervisor = createSupervisor({
  name: 'triage',
  instructions: `
    You are a triage coordinator. Route each request to the right specialist:
    - billing questions → billing agent
    - technical issues → tech support agent
    - general questions → general agent
  `,
  llm: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o-mini' }),
  agents: {
    billing: createAgent({ name: 'billing', instructions: 'Handle billing and payment questions.', model: 'gpt-4o-mini', apiKey: '...' }),
    tech:    createAgent({ name: 'tech',    instructions: 'Solve technical product issues.', model: 'gpt-4o', apiKey: '...' }),
    general: createAgent({ name: 'general', instructions: 'Answer general questions.', model: 'gpt-4o-mini', apiKey: '...' }),
  },
});

const result = await supervisor.run('My invoice shows the wrong amount.');
// Supervisor routes this to the billing agent automatically
console.log(result.text);
```

---

## `createHandoff` — explicit handoff protocol

Define explicit handoff conditions so agents can transfer control at runtime:

```ts
import { createHandoff, createAgent } from 'confused-ai';

const triageAgent = createAgent({
  name: 'triage',
  instructions: 'Triage the request. Hand off to specialists when needed.',
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY!,
});

const specialistAgent = createAgent({
  name: 'specialist',
  instructions: 'Handle complex technical escalations.',
  model: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY!,
});

const handoff = createHandoff({
  source: triageAgent,
  targets: { specialist: specialistAgent },
  condition: (result) => result.text.includes('[ESCALATE]'),
  // or: condition: 'always'
});

const result = await handoff.run('My database is returning corrupted data after the migration.');
console.log(result.text);  // answered by the specialist if escalated
```

---

## `createAgentRouter` — capability-based routing

Route requests to agents based on declared capabilities:

```ts
import { createAgentRouter, createAgent } from 'confused-ai';

const router = createAgentRouter({
  strategy: 'capability',  // 'capability' | 'round-robin' | 'least-loaded'
  agents: [
    { agent: createAgent({ name: 'code-agent', instructions: '...', model: 'gpt-4o', apiKey: '...' }), capabilities: ['coding', 'debugging'] },
    { agent: createAgent({ name: 'data-agent', instructions: '...', model: 'gpt-4o', apiKey: '...' }), capabilities: ['data-analysis', 'sql'] },
    { agent: createAgent({ name: 'write-agent', instructions: '...', model: 'gpt-4o-mini', apiKey: '...' }), capabilities: ['writing', 'editing'] },
  ],
});

const result = await router.run({ prompt: 'Fix the SQL query performance issue.', capability: 'sql' });
```

---

## `createConsensus` — multi-agent voting

Run multiple agents on the same prompt and pick the best answer by consensus:

```ts
import { createConsensus, createAgent } from 'confused-ai';

const consensus = createConsensus({
  agents: [
    createAgent({ name: 'agent-a', instructions: 'Answer carefully.', model: 'gpt-4o', apiKey: '...' }),
    createAgent({ name: 'agent-b', instructions: 'Answer carefully.', model: 'claude-sonnet-4-20250514', apiKey: '...' }),
    createAgent({ name: 'agent-c', instructions: 'Answer carefully.', model: 'gpt-4o-mini', apiKey: '...' }),
  ],
  strategy: 'majority',  // 'majority' | 'best-of' | 'synthesise'
  judge: createAgent({ name: 'judge', instructions: 'Pick the most accurate answer.', model: 'gpt-4o', apiKey: '...' }),
});

const result = await consensus.run('What is the most efficient sorting algorithm for nearly-sorted data?');
console.log(result.text);
```

---

## `SwarmOrchestrator` — dynamic agent swarm

A self-organising swarm where agents spawn sub-agents and hand off dynamically:

```ts
import { SwarmOrchestrator, createRunnableAgent } from 'confused-ai';

const swarm = new SwarmOrchestrator({
  agents: [
    createRunnableAgent(plannerAgent),
    createRunnableAgent(researchAgent),
    createRunnableAgent(writerAgent),
  ],
  entryAgent: 'planner',
  maxHandoffs: 10,
});

const result = await swarm.run('Produce a detailed market analysis report for the EV charging industry.');
```

---

## `createPipeline` — typed data pipeline

Chain agents with typed input/output contracts:

```ts
import { createPipeline } from 'confused-ai';

const pipeline = createPipeline([
  { agent: extractAgent, transform: (r) => ({ rawData: r.text }) },
  { agent: enrichAgent,  transform: (r) => ({ enriched: r.text }) },
  { agent: reportAgent,  transform: (r) => r.text },
]);

const report = await pipeline.run('Extract, enrich, and report on the sales data.');
```

---

## A2A (agent-to-agent) HTTP communication

Expose an agent as an HTTP service and connect to it from another process:

```ts
import { A2AServer, createHttpA2AClient } from 'confused-ai/workflow';

// Server side
const server = new A2AServer({ agent: myAgent, port: 3100 });
await server.start();

// Client side (different process / container)
const client = createHttpA2AClient({ url: 'http://agent-service:3100' });
const result = await client.run({ prompt: 'Analyse the data.' });
```

---

## Load balancers

```ts
import {
  RoundRobinLoadBalancer,
  LeastConnectionsLoadBalancer,
  WeightedResponseTimeLoadBalancer,
} from 'confused-ai/workflow';

const balancer = new LeastConnectionsLoadBalancer([agentA, agentB, agentC]);
const agent = balancer.pick();
```

---

## `createGSDCoordinator` — spec-driven execution (GSD)

The **GSD (Get Shit Done) Protocol** is a spec-driven multi-agent pattern that separates execution into three distinct phases to prevent context pollution:
1. **Plan**: An agent analyzes the goal, creates a structured roadmap, and writes requirements.
2. **Execute**: An execution agent completes the roadmap steps sequentially, with each task running in a clean, isolated agent session.
3. **Verify**: A validation agent reviews the roadmap and output to verify all requirements are met.

State is kept aligned by writing to a `.planning` workspace folder containing `REQUIREMENTS.md`, `ROADMAP.md`, and `STATE.md`.

```ts
import { createGSDCoordinator, FilesystemGSDStorage } from 'confused-ai';

const gsd = createGSDCoordinator({
  projectDir: './my-project',
  plannerAgent,
  executorAgent,
  verifierAgent,
  // Write planning files to disk (defaults to InMemoryGSDStorage if omitted)
  storage: new FilesystemGSDStorage('./my-project/.planning'),
});

// Phase 1: Create the roadmap and requirements
await gsd.plan('Implement a rate limiter class');

// Phase 2: Execute the next incomplete task (run until completed is true)
let step = await gsd.executeStep();
console.log(`Executed: ${step.taskName}`);

// Phase 3: Verify requirements are satisfied
const verification = await gsd.verify();
if (verification.success) {
  console.log('Project verified successfully!');
}
```

---

## `createRalphLoop` — context-isolated cycles (RALF)

The **Ralph / RALF Loop Protocol** (Read-Act-Loop-Finish) runs a single agent in an iterative loop to solve complex tasks. To avoid context bloat and performance degradation, it creates a fresh session instance for each cycle while propagating concise summaries of preceding cycles in the prompt.

```ts
import { createRalphLoop } from 'confused-ai';

const loop = createRalphLoop({
  agent: codingAgent,
  maxCycles: 5,
  checkComplete: async (ctx) => {
    // Return true once the task is verified (e.g. running tests or validation check)
    return ctx.lastResult.includes('Tests passed');
  },
});

const result = await loop.run('Fix the failing test in src/index.ts');
console.log(result.success);      // true
console.log(result.cyclesRun);   // e.g. 3
```

---

## Extended Multi-Agent Orchestration Patterns

The framework supports 9 advanced agentic interaction patterns under `confused-ai` to orchestrate agents for specific reasoning, code execution, or tutoring tasks.

### 1. Mixture-of-Agents (MoA)
Combines multiple proposer agents to generate candidate responses in parallel, then refines them across rounds before a single aggregator agent synthesizes the final result.

```ts
import { createMixtureOfAgents } from 'confused-ai';

const moa = createMixtureOfAgents({
  name: 'MoA-Synthesizer',
  proposers: [coderA, coderB, coderC],
  aggregator: leadCritic,
  rounds: 2,
});

const outcome = await moa.run({ prompt: 'Write an optimized matrix multiplication in TS.' });
```

### 2. Actor-Critic
An Actor agent generates an answer, which a Critic agent reviews. The Actor refines the answer based on the Critic's feedback, looping until satisfying a validator or reaching `maxRefinements`.

```ts
import { createActorCritic } from 'confused-ai';

const actorCritic = createActorCritic({
  name: 'Code-Review-Loop',
  actor: codeAgent,
  critic: reviewerAgent,
  maxRefinements: 3,
  isSatisfactory: (critique) => critique.toLowerCase().includes('looks good'),
});
```

### 3. Socratic Tutor
Wraps an agent to guide users conceptually without giving direct answers, forcing reflection by asking clarifying questions or pointing out contradictions.

```ts
import { createSocraticAgent } from 'confused-ai';

const tutor = createSocraticAgent({
  name: 'Math-Tutor',
  agent: generalAgent,
  topic: 'linear algebra',
  instructions: 'Guide the user to solve systems of equations.',
});
```

### 4. Prompt Chaining
Sequentially pipes a series of structured tasks where each agent's execution depends on the outputs of preceding agents.

```ts
import { createPromptChain } from 'confused-ai';

const chain = createPromptChain({
  name: 'Content-Pipeline',
  steps: [
    { name: 'outline', agent: outlineAgent },
    { 
      name: 'draft', 
      agent: writerAgent,
      template: (input, prev) => `Outline:\n${prev.outline}\n\nWrite a post on: ${input}` 
    },
    { name: 'seo', agent: seoAgent },
  ],
});
```

### 5. Program-of-Thought (PoT)
Delegates mathematical or algorithmic tasks to an agent by prompting it to write executable code (e.g. JavaScript), executes that code in a sandbox runtime, and feeds the results back to the agent to synthesize the final answer.

```ts
import { createProgramOfThought } from 'confused-ai';

const pot = createProgramOfThought({
  name: 'Math-PoT',
  agent: codingAgent,
  // Custom sandbox executor (defaults to a safe Function evaluation)
  executor: async (code) => {
    return { stdout: 'Result: 42', stderr: '' };
  },
});
```

### 6. Skeleton-of-Thought (SoT)
Speeds up long generation tasks by first generating a structured outline (skeleton), then invoking worker agents in parallel to write details for each section, finally joining the details together.

```ts
import { createSkeletonOfThought } from 'confused-ai';

const sot = createSkeletonOfThought({
  name: 'Article-Generator',
  planner: layoutAgent,
  worker: sectionWriterAgent,
  parallel: true, // Generate sections concurrently
});
```

### 7. Step-Back Abstraction
Prompts an agent to "step back" and analyze the underlying conceptual principle or broader context of a task first, then feeds that abstraction as context to a solver agent to resolve the original question.

```ts
import { createStepBackAgent } from 'confused-ai';

const stepBack = createStepBackAgent({
  name: 'Physics-Solver',
  stepBackAgent: conceptualAgent,
  solverAgent: mathAgent,
});
```

### 8. Rejection Sampling (Best-of-N)
Generates `N` candidate answers in parallel and evaluates each candidate using a scoring function or a Judge agent, returning the highest-scoring candidate.

```ts
import { createRejectionSampling } from 'confused-ai';

const bestOfN = createRejectionSampling({
  name: 'Creative-Writer',
  agent: writerAgent,
  n: 3,
  judge: async (candidate) => {
    return candidate.includes('metaphor') ? 10 : 5; // custom score logic
  },
});
```

### 9. Self-Correction / Self-Debugging
Runs an agentic loop that tests the agent's output against a validator function. If the output fails validation, the agent is prompted with the errors to self-correct its answer, up to `maxRetries`.

```ts
import { createSelfCorrection } from 'confused-ai';

const selfDebugger = createSelfCorrection({
  name: 'JSON-Validator',
  agent: jsonAgent,
  validator: (output) => {
    try {
      JSON.parse(output);
      return { valid: true };
    } catch (e: any) {
      return { valid: false, errors: [e.message] };
    }
  },
  maxRetries: 3,
});
```

---

## Where to go next

- [Workflows](./workflows) — DAG-based graph workflows with branching and retries.
- [Reasoning](./reasoning) — step-by-step reasoning loops inside an agent.
- [Production](./production) — circuit breakers and health checks for distributed agent systems.

