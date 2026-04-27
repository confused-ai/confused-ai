# Guardrails

Guardrails validate and filter agent inputs and outputs to enforce safety, compliance, and business rules.

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
