---
title: Guardrails & Safety
description: PII detection, prompt injection defense, content moderation, tool allowlists, and output validation.
outline: [2, 3]
---

# Guardrails & Safety

`@confused-ai/guardrails` provides safety layers for agent inputs and outputs. Rules run before and after every LLM response.

## Quick start

```ts
import { agent } from 'confused-ai';
import {
  GuardrailValidator,
  createPiiDetectionRule,
  createPromptInjectionRule,
  createMaxLengthRule,
} from 'confused-ai/guardrails';

const guardrails = new GuardrailValidator({
  rules: [
    createPromptInjectionRule({ threshold: 0.7 }),  // block injection attempts
    createPiiDetectionRule({ redact: true }),         // redact PII in output
    createMaxLengthRule('output-limit', 10_000),     // cap output length
  ],
});

const ai = agent({
  model: 'gpt-4o',
  guardrails,
});
```

## Built-in rules

### PII detection & redaction

Detects and optionally redacts: email, phone, SSN, credit card, passport, IP address, JWT tokens, AWS keys, and more:

```ts
import { createPiiDetectionRule } from 'confused-ai/guardrails';

const piiRule = createPiiDetectionRule({
  redact: true,          // replace PII with [REDACTED]
  severity: 'high',      // 'low' | 'medium' | 'high'
  patterns: ['email', 'phone', 'ssn', 'credit_card'],  // defaults to all
});
```

Detect PII in any string directly:

```ts
import { detectPii } from 'confused-ai/guardrails';

const result = await detectPii('Call me at 555-1234 or email@example.com');
console.log(result.found);    // true
console.log(result.types);    // ['phone', 'email']
console.log(result.redacted); // 'Call me at [PHONE] or [EMAIL]'
```

### Prompt injection defense

Detects attempts to hijack the agent's instructions:

```ts
import { createPromptInjectionRule } from 'confused-ai/guardrails';

const injectionRule = createPromptInjectionRule({
  threshold: 0.7,    // 0–1 confidence threshold
  mode: 'pattern',   // 'pattern' | 'llm' | 'both'
});
```

### Content rules

Block or allow specific patterns in outputs:

```ts
import { createContentRule, createForbiddenTopicsRule } from 'confused-ai/guardrails';

// Block outputs matching a regex
const noHarmful = createContentRule(
  'no-harmful',
  'Block harmful content',
  /\b(harm|hurt|kill)\b/i,
  'high'
);

// Block specific topics
const noCompetitors = createForbiddenTopicsRule({
  topics: ['CompetitorA', 'CompetitorB'],
  severity: 'medium',
});
```

### Tool allowlist

Only permit specific tools to be called:

```ts
import { createToolAllowlistRule } from 'confused-ai/guardrails';

const toolRule = createToolAllowlistRule(['web_search', 'calculator', 'get_weather']);
// Agent will refuse to call any other tool
```

### URL validation

Prevent SSRF by allowlisting domains:

```ts
import { createUrlValidationRule } from 'confused-ai/guardrails';

const urlRule = createUrlValidationRule({
  allowedDomains: ['api.myservice.com', 'docs.example.com'],
  blockPrivateIps: true,
  blockHttp: true,  // require HTTPS
});
```

### Output length cap

```ts
import { createMaxLengthRule } from 'confused-ai/guardrails';

const lengthRule = createMaxLengthRule('output-limit', 8_000, 'medium');
```

### OpenAI Moderation API

```ts
import { createOpenAiModerationRule } from 'confused-ai/guardrails';

const modRule = createOpenAiModerationRule({
  apiKey: process.env.OPENAI_API_KEY!,
  blockedCategories: ['hate', 'violence', 'sexual'],
});
```

## Composing multiple rules

```ts
const guardrails = new GuardrailValidator({
  rules: [
    createPromptInjectionRule(),
    createPiiDetectionRule({ redact: true }),
    createToolAllowlistRule(['web_search', 'calculator']),
    createMaxLengthRule('limit', 10_000),
    createOpenAiModerationRule({ apiKey: process.env.OPENAI_API_KEY! }),
  ],
  // Called when any rule triggers
  onViolation: async (violation) => {
    await auditLog.write({
      rule: violation.rule,
      severity: violation.severity,
      message: violation.message,
    });
  },
});
```

## HITL — Human-in-the-Loop

Request human approval before sensitive tool calls:

```ts
import { agent } from 'confused-ai';

const ai = agent({
  model: 'gpt-4o',
  humanInTheLoop: {
    beforeToolCall: async (tool, args) => {
      if (['send_email', 'delete_record', 'execute_sql'].includes(tool.id)) {
        // POST to your approval API — agent pauses here until decision
        const decision = await approvalStore.request({
          tool: tool.id,
          args,
          requestedBy: 'agent',
        });
        return { approved: decision.approved, reason: decision.comment };
      }
      return { approved: true };
    },
    beforeFinish: async (result) => {
      // Review final answer before returning to user
      return { approved: true };
    },
  },
});
```

### Approval store via HTTP API

When using `serve()`, approvals are managed via REST:

```ts
// List pending approvals
GET /v1/approvals

// Submit a decision
POST /v1/approvals/:id
{ "approved": true, "comment": "Looks good", "decidedBy": "alice" }
```

## Custom guardrail rules

```ts
import type { GuardrailRule, GuardrailContext } from 'confused-ai/guardrails';

const noCodeExecution: GuardrailRule = {
  name: 'no-code-execution',
  severity: 'critical',
  check: async (ctx: GuardrailContext) => {
    if (ctx.toolCall?.id === 'execute_code') {
      return {
        passed: false,
        message: 'Code execution is not allowed in this context',
      };
    }
    return { passed: true };
  },
};

const guardrails = new GuardrailValidator({ rules: [noCodeExecution] });
```
