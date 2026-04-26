# Compose & Pipe

`compose()` and `pipe()` build **agent pipelines** — the output of each agent becomes the input to the next. They are the primary building blocks for multi-step agentic workflows without subclassing.

## `compose()`

Chain agents sequentially. The final result of agent N is automatically passed as the prompt to agent N+1.

```ts
import { compose, createAgent } from 'confused-ai';
import { OpenAIProvider } from 'confused-ai/llm';

const llm = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o' });

const researcher = createAgent({ name: 'researcher', llm, instructions: 'Find key facts about the topic.' });
const writer     = createAgent({ name: 'writer',     llm, instructions: 'Write a blog post from the research notes.' });
const editor     = createAgent({ name: 'editor',     llm, instructions: 'Polish the blog post for clarity and style.' });

const pipeline = compose(researcher, writer, editor);

const result = await pipeline.run('The history of quantum computing');
console.log(result.text); // polished blog post
```

## `ComposeOptions`

All options can be passed as the last argument to `compose()`:

```ts
export interface ComposeOptions {
  // Stop early if this returns false — later agents in the chain are skipped
  when?: (result: AgenticRunResult, stepIndex: number) => boolean | Promise<boolean>;

  // Transform the output before passing it to the next agent
  transform?: (result: AgenticRunResult, stepIndex: number) => string | Promise<string>;

  // Share a session across all agents in the pipeline
  sessionId?: string;
}
```

### Early stopping with `when`

```ts
import { compose, createAgent } from 'confused-ai';

const classifier = createAgent({ name: 'classifier', llm, instructions: 'Classify the input as RELEVANT or IRRELEVANT.' });
const responder  = createAgent({ name: 'responder',  llm, instructions: 'Answer the question in detail.' });

const pipeline = compose(
  classifier,
  responder,
  {
    // Only pass to the responder if the classifier says RELEVANT
    when: (result) => result.text.toUpperCase().includes('RELEVANT'),
  },
);

const result = await pipeline.run('What is the weather?');
```

### Transforming output between stages

```ts
const pipeline = compose(
  researcher,
  writer,
  {
    // Prepend a header before the writer receives the researcher's output
    transform: (result, stepIndex) => {
      if (stepIndex === 0) return `## Research Notes\n\n${result.text}`;
      return result.text;
    },
  },
);
```

## `pipe()` — fluent builder

`pipe()` builds the same kind of pipeline but with a fluent `.then()` chain. Useful when different stages need different options.

```ts
import { pipe, createAgent } from 'confused-ai';

const result = await pipe(researcher)
  .then(writer, {
    transform: (r) => `## Research\n${r.text}`,
  })
  .then(editor, {
    when: (r) => r.text.length > 100,  // skip editor for very short drafts
  })
  .run('Quantum computing history', {
    onChunk: (text) => process.stdout.write(text), // stream last stage
  });
```

## Shared session across the pipeline

Pass a `sessionId` so all agents share conversation history:

```ts
const sessionId = crypto.randomUUID();

const pipeline = compose(researchAgent, summaryAgent, { sessionId });

// Both agents see the same conversation history
const result = await pipeline.run('Tell me about CRISPR', { sessionId });
```

## API reference

### `compose(...agents): ComposedAgent`
### `compose(...agents, options: ComposeOptions): ComposedAgent`

Returns a `ComposedAgent` with:

```ts
interface ComposedAgent {
  run(
    prompt: string,
    options?: {
      onChunk?: (text: string) => void; // stream output from the last agent
      sessionId?: string;
    },
  ): Promise<AgenticRunResult>;
}
```

### `pipe(first: CreateAgentResult): PipelineBuilder`

Returns a `PipelineBuilder` with:

```ts
class PipelineBuilder {
  then(agent: CreateAgentResult, options?: ComposeOptions): PipelineBuilder;
  run(
    prompt: string,
    options?: { onChunk?: (text: string) => void; sessionId?: string },
  ): Promise<AgenticRunResult>;
}
```

::: tip Hooks vs Pipelines
`compose()` / `pipe()` connect **separate agents** in a pipeline where output flows downstream. To merge multiple **hook sets** onto a single agent, use [`defineAgent().hooks()`](./hooks.md) directly.
:::
