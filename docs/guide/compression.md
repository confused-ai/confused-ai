# Message Compression

`CompressionManager` detects when a conversation's message list is growing too large and uses an LLM to summarise verbose tool results into compact, fact-preserving representations. It mutates the message array in-place, replacing `content` fields with shorter summaries while preserving all key facts, IDs, numbers, and names.

This is especially valuable in long agentic loops where tool results accumulate — search results, API responses, and database rows can easily consume 80% of a context window before the task is done.

---

## Quick start

```ts
import { CompressionManager } from 'confused-ai';

const cm = new CompressionManager({
  // Same signature as ReasoningManager — provider-agnostic
  generate: async (messages) => {
    const r = await llm.generateText(messages, {});
    return r.text;
  },
  compressToolResults:      true, // compress tool/function call results
  compressToolResultsLimit: 3,    // trigger after 3 tool messages
});

// In your agent loop:
if (cm.shouldCompress(messages)) {
  await cm.acompress(messages); // parallel — mutates in-place
}
```

---

## When to use it

Call `shouldCompress()` before the next LLM step to check both triggers:

1. **Count trigger** — number of tool-result messages ≥ `compressToolResultsLimit` (default: 3)
2. **Token trigger** — any single message content exceeds `compressTokenLimit` (estimated as `content.length / 4`)

```ts
const messages = [...conversationHistory];

if (cm.shouldCompress(messages)) {
  // Parallel compression — all messages compressed concurrently
  await cm.acompress(messages);
}
// messages now has shorter tool result contents
```

---

## `compress` vs `acompress`

| Method | Behaviour | When to use |
|--------|-----------|-------------|
| `cm.compress(messages)` | Sequential — awaits each message one by one | When you need strict ordering or rate-limit compliance |
| `cm.acompress(messages)` | Parallel — fires all compressions concurrently | Default choice — faster when multiple messages need compression |

Both mutate the `messages` array in-place by setting `compressedContent` on affected messages. The original `content` is preserved in the object (not overwritten) so you can diff or audit.

---

## What the default prompt preserves

The built-in compression prompt is strict:

- ✅ Preserves all key facts, IDs, numbers, names, dates
- ✅ Keeps structured data structure, removes empty/null fields
- ✅ Keeps the same language as the input
- ✅ Uses direct language (no passive voice, no preambles)
- ✅ Outputs only the compressed content — no explanation
- ❌ Never invents or infers information not in the original

```ts
import { DEFAULT_COMPRESSION_PROMPT } from 'confused-ai';
// Use as a base for your custom prompt
```

---

## Custom compression prompt

```ts
const cm = new CompressionManager({
  generate,
  prompt: `You are a JSON compressor. 
Input is a verbose API response. 
Output only the essential fields as compact JSON.
Preserve: id, name, status, error fields.
Remove: timestamps, audit fields, empty arrays.`,
});
```

---

## Configuration reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `generate` | `(messages) => Promise<string>` | **required** | LLM callable |
| `compressToolResults` | `boolean` | `true` | Whether to compress tool/function results |
| `compressToolResultsLimit` | `number` | `3` | Trigger compression after this many tool messages |
| `compressTokenLimit` | `number` | `0` (disabled) | Compress any single message over this token estimate |
| `prompt` | `string` | Built-in | Override the compression system prompt |
| `debug` | `boolean` | `false` | Log compression activity to console |

---

## Inspect compression stats

```ts
const count = cm.compressionCount; // number of messages compressed so far
```

---

## `CompressibleMessage` shape

```ts
interface CompressibleMessage {
  role:               string;
  content?:           string | null;      // original content
  compressedContent?: string;             // set after compression
  [key: string]:      unknown;            // pass-through for tool-specific fields
}
```

Messages where `compressedContent` is set have been processed. The original `content` is unchanged, so you can inspect or log the compression delta.

---

## Integration pattern: sliding context window

Combine with `ContextWindowManager` for a fully managed context:

```ts
import { CompressionManager, ContextWindowManager } from 'confused-ai';

const cm = new CompressionManager({ generate, compressToolResultsLimit: 3 });
const cwm = new ContextWindowManager({
  model: 'gpt-4o',
  strategy: 'summarize',
  llm: llmProvider,
  reserveOutputTokens: 2000,
});

// Before each LLM call:
if (cm.shouldCompress(messages)) await cm.acompress(messages);
const fitted = await cwm.fit(messages);
const response = await llm.generateText(fitted, {});
```

---

## Related

- [Reasoning](./reasoning.md) — CoT loops that accumulate many tool results
- [All Modules — Context Window Manager](./all-modules.md#context-window-manager) — truncate or summarize at token limit
- [Agents](./agents.md) — hooks for injecting custom context management
