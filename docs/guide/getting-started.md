# Getting Started

## Installation

```bash
npm install fluxion
# or
bun add fluxion
```

You'll also need at least one LLM provider key in your environment:

```bash
# Pick one (or more)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
```

## Your first agent

```ts
import { agent } from 'fluxion';

const myAgent = agent({
  model: 'gpt-4o-mini',                    // or 'claude-3-haiku', 'gemini-flash', ...
  instructions: 'You are a helpful assistant.',
});

const result = await myAgent.run('What is 12 * 8?');
console.log(result.text);          // "The answer is 96."
// Save the response as a .md file
await fs.writeFile('answer.md', result.markdown.content);
```

## Add a custom tool

```ts
import { agent, defineTool } from 'fluxion';
import { z } from 'zod';

const getWeather = defineTool()
  .name('getWeather')
  .description('Get current weather for a city')
  .parameters(z.object({ city: z.string().describe('City name') }))
  .execute(async ({ city }) => {
    // replace with a real API call
    return { city, temp: 22, condition: 'sunny' };
  })
  .build();

const weatherAgent = agent({
  model: 'gpt-4o-mini',
  instructions: 'Help with weather queries.',
  tools: [getWeather],
});

const r = await weatherAgent.run('What is the weather in Paris?');
console.log(r.text);
```

## Add RAG

```ts
import { agent } from 'fluxion';
import { KnowledgeEngine, TextLoader, InMemoryVectorStore } from 'fluxion/knowledge';
import { OpenAIEmbeddingProvider } from 'fluxion/memory';

const knowledge = new KnowledgeEngine({
  embeddingProvider: new OpenAIEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  vectorStore: new InMemoryVectorStore(),
});

// Ingest a document
await knowledge.ingest([{ id: 'readme', content: 'fluxion is a TypeScript framework...' }]);

const ragAgent = agent({
  model: 'gpt-4o-mini',
  instructions: 'Answer questions using the knowledge base.',
  ragEngine: knowledge,
});

const r = await ragAgent.run('What is fluxion?');
console.log(r.text);
```

## Multi-agent pipeline

Use `compose()` to chain agents — output of the first becomes input of the next:

```ts
import { agent, compose } from 'fluxion';

const researcher = agent({ model: 'gpt-4o', instructions: 'Research topics thoroughly and return key findings.' });
const writer     = agent({ model: 'gpt-4o', instructions: 'Write clear, concise summaries from research notes.' });

const pipeline = compose(researcher, writer);
const result = await pipeline.run('Write a summary of quantum computing.');
console.log(result.text);
```

## Next steps

- [Custom Tools](/guide/custom-tools) — all three APIs (`tool`, `defineTool`, `createTool`)
- [RAG / Knowledge](/guide/rag) — document loaders, embeddings, vector search
- [Storage](/guide/storage) — key-value store with memory, file, or custom backends
- [Orchestration](/guide/orchestration) — multi-agent router, handoff, consensus
- [Production](/guide/production) — resilience, guardrails, observability
