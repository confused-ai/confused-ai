---
title: Guardrails & Safety
description: PII detection, prompt injection, moderation, content safety, topic allowlists — all composable validators for agent inputs and outputs.
outline: [2, 3]
---

# Guardrails & Safety

Guardrails run synchronously in the agent loop — a blocked check stops execution and returns a structured rejection. They apply to both **inputs** (what the user sends) and **outputs** (what the LLM responds).

> **Adapter path:** Use a `GuardrailAdapter` to plug external content safety APIs (Azure Content Safety, AWS Bedrock Guardrails) without a `GuardrailEngine`. See the [Adapters guide](/guide/adapters).

---

## Quick start

```ts
import { createGuardrails } from 'confused-ai/guardrails';
import { agent } from 'confused-ai';

const guardrails = createGuardrails({
  // Restrict topics to this allowlist
  allowlist: ['billing', 'account management', 'subscription', 'pricing'],
});

const billingBot = agent({
  model:       'gpt-4o',
  instructions: 'You are a billing support assistant.',
  guardrails,
});
```

---

## Input & output validators

```ts
const guardrails = createGuardrails({
  validateInput: async (input) => {
    if (input.length > 10_000) {
      return { blocked: true, reason: 'Input too long' };
    }
    if (/\b(DROP|DELETE|TRUNCATE)\b/i.test(input)) {
      return { blocked: true, reason: 'SQL injection detected' };
    }
    return { blocked: false };
  },

  validateOutput: async (output) => {
    if (/(?:password|secret|api.?key)\s*[:=]/i.test(output)) {
      return { blocked: true, reason: 'Output may contain a credential' };
    }
    return { blocked: false };
  },
});
```

---

## Built-in safety rules

### PII Detection

Detect emails, phone numbers, SSNs, credit card numbers, and IP addresses:

```ts
import { createGuardrails, createPiiDetectionRule } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  validators: [
    {
      validateInput: createPiiDetectionRule({
        action: 'block',              // 'block' | 'warn'
        types: ['ssn', 'credit_card'], // omit to detect all PII types
      }),
    },
  ],
});
```

**Detect PII programmatically** (outside an agent):

```ts
import { detectPii } from 'confused-ai/guardrails';

const result = detectPii('Call me at 555-123-4567 or SSN 123-45-6789');
console.log(result.found);  // true
console.log(result.types);  // ['phone', 'ssn']
console.log(result.matches);
```

Supported types: `email`, `phone`, `ssn`, `credit_card`, `ip_address`, `date_of_birth`, `passport`

### Prompt Injection Detection

Heuristic detection of jailbreaks and role-override attempts:

```ts
import { createGuardrails, createPromptInjectionRule } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  validators: [
    {
      validateInput: createPromptInjectionRule({
        threshold: 0.6,   // sensitivity 0–1 (default 0.5)
        action:    'block',
      }),
    },
  ],
});
```

### OpenAI Moderation

Call the OpenAI Moderation API as a validator:

```ts
import { createGuardrails, createOpenAiModerationRule } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  validators: [
    {
      validateInput: createOpenAiModerationRule({
        apiKey: process.env.OPENAI_API_KEY!,
        // categories: ['hate', 'violence', 'sexual'], // optional subset
      }),
    },
  ],
});
```

---

## Custom validators

Implement `GuardrailValidator` to plug any external moderation API:

```ts
import type { GuardrailValidator } from 'confused-ai/guardrails';

const contentSafetyValidator: GuardrailValidator = {
  async validateInput(input) {
    const result = await azureContentSafety.analyze({ text: input });
    return result.hateScore > 0.5
      ? { blocked: true, reason: 'Content policy violation (hate)' }
      : { blocked: false };
  },

  async validateOutput(output) {
    // Optionally validate LLM responses too
    return { blocked: false };
  },
};

const guardrails = createGuardrails({
  validators: [contentSafetyValidator],
});
```

---

## Stack multiple validators

All validators run in order — first `blocked: true` stops the chain:

```ts
const guardrails = createGuardrails({
  validators: [
    piiValidator,
    injectionValidator,
    openAiModerationValidator,
    myCustomBusinessRuleValidator,
  ],
});
```

---

## Disable guardrails

```ts
// No guardrails at all
const rawAgent = agent({ model: 'gpt-4o', instructions: '...', guardrails: false });
```

---

## Guardrail result shape

```ts
interface GuardrailResult {
  blocked: boolean;
  reason?: string;   // shown to the caller when blocked: true
  score?:  number;   // optional confidence 0–1
  labels?: string[]; // optional category labels
}
```

When a guardrail blocks, `agent.run()` throws a `GuardrailError`:

```ts
import { GuardrailError } from 'confused-ai';

try {
  await ai.run(userInput);
} catch (err) {
  if (err instanceof GuardrailError) {
    console.log(err.reason);  // 'SQL injection detected'
    console.log(err.stage);   // 'input' | 'output'
  }
}
```

> **New:** Use a `GuardrailAdapter` (via `guardrailAdapter`) to plug external content safety APIs — Azure Content Safety, AWS Bedrock Guardrails, custom NLP services — without writing a `GuardrailEngine`. See the [Adapters guide](./adapters.md).

## Allowlist guardrails

Restrict topics the agent will engage with:

```ts
import { createGuardrails } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  // Only allow these topics
  allowlist: ['billing', 'account management', 'product pricing', 'subscription'],
});

const billingAgent = agent({
  model: 'gpt-4o',
  instructions: 'You are a billing support assistant.',
  guardrails,
});
```

## Input/output validation

```ts
const guardrails = createGuardrails({
  validateInput: async (input) => {
    if (input.length > 10_000) {
      return { blocked: true, reason: 'Input too long' };
    }
    if (/\b(sql|drop|delete|truncate)\b/i.test(input)) {
      return { blocked: true, reason: 'SQL injection detected' };
    }
    return { blocked: false };
  },

  validateOutput: async (output) => {
    if (output.includes('PASSWORD') || output.includes('SECRET')) {
      return { blocked: true, reason: 'Output contains sensitive data' };
    }
    return { blocked: false };
  },
});
```

## Disable guardrails

```ts
const rawAgent = defineAgent({
  model: 'gpt-4o',
  instructions: '...',
  guardrails: false,  // no guardrails at all
});
```

## Custom guardrail middleware

For complex guardrails that need external services (content moderation APIs, etc.):

```ts
import type { GuardrailValidator } from 'confused-ai/guardrails';

const moderationGuardrail: GuardrailValidator = {
  async validateInput(input) {
    const result = await openai.moderations.create({ input });
    const flagged = result.results[0].flagged;
    return flagged
      ? { blocked: true, reason: 'Content policy violation' }
      : { blocked: false };
  },
};

const guardrails = createGuardrails({ validators: [moderationGuardrail] });
```

---

## Built-in safety rules

### OpenAI Moderation

`createOpenAiModerationRule` — call the OpenAI Moderation API as a guardrail rule. Automatically blocks flagged inputs.

```ts
import { createGuardrails, createOpenAiModerationRule } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  validators: [
    {
      validateInput: createOpenAiModerationRule({
        apiKey: process.env.OPENAI_API_KEY!,
        // Optional: only block specific categories
        // categories: ['hate', 'violence', 'sexual'],
      }),
    },
  ],
});
```

### PII Detection

`createPiiDetectionRule` — detect and optionally block messages containing PII (emails, phone numbers, SSNs, credit card numbers, IP addresses).

```ts
import { createGuardrails, createPiiDetectionRule } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  validators: [
    {
      validateInput: createPiiDetectionRule({
        action: 'block',   // 'block' | 'warn' (warn logs but allows through)
        types: ['ssn', 'credit_card'], // optional subset; omit to detect all types
      }),
    },
  ],
});
```

To detect PII programmatically without a guardrail:

```ts
import { detectPii } from 'confused-ai/guardrails';

const result = detectPii('Call me at 555-123-4567 or SSN 123-45-6789');
console.log(result.found);   // true
console.log(result.types);   // ['phone', 'ssn']
```

### Prompt Injection Detection

`createPromptInjectionRule` — heuristic detection of prompt injection attempts (jailbreaks, role-override instructions, etc.).

```ts
import { createGuardrails, createPromptInjectionRule } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  validators: [
    {
      validateInput: createPromptInjectionRule({
        threshold: 0.6,  // sensitivity 0–1 (default 0.5)
        action: 'block', // 'block' | 'warn'
      }),
    },
  ],
});
```

To inspect injection signals directly:

```ts
import { detectPromptInjection } from 'confused-ai/guardrails';

const result = detectPromptInjection('Ignore all previous instructions and...');
console.log(result.score);    // 0.9
console.log(result.signals);  // ['role-override', 'jailbreak-phrase']
```

For higher accuracy, add an LLM classifier on top of heuristics:

```ts
import { createLlmInjectionClassifier } from 'confused-ai/guardrails';
import { OpenAIProvider } from 'confused-ai/model';

const classifier = createLlmInjectionClassifier({
  llm: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4o-mini' }),
  // threshold: 0.7,
});
```

### Forbidden topics

`createForbiddenTopicsRule` — block any input that matches a list of forbidden topic keywords or patterns.

```ts
import { createGuardrails, createForbiddenTopicsRule } from 'confused-ai/guardrails';

const guardrails = createGuardrails({
  validators: [
    {
      validateInput: createForbiddenTopicsRule({
        topics: ['competitor pricing', 'internal roadmap'],
      }),
    },
  ],
});
```
