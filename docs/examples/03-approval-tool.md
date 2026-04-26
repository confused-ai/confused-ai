# 03 · Tool with Approval 🟢

Some actions are risky — sending emails, deleting files, making purchases.
The approval pattern pauses execution and asks a human "are you sure?"
before the tool runs.

## What you'll learn

- How to require human approval before a tool executes
- How to implement a custom approval handler
- When to use this pattern (irreversible or expensive actions)

## Code

```ts
// approval-agent.ts
import { z } from 'zod';
import { createAgent, tool } from 'confused-ai';
import * as readline from 'node:readline/promises';

// ── Approval helper ────────────────────────────────────────────────────────
async function askHuman(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n⚠️  ${question}\nApprove? (yes/no): `);
  rl.close();
  return answer.toLowerCase().startsWith('y');
}

// ── Tool that requires approval ────────────────────────────────────────────
const sendEmail = tool({
  name: 'sendEmail',
  description: 'Send an email to a recipient. Always requires human approval.',
  parameters: z.object({
    to:      z.string().email().describe('Recipient email address'),
    subject: z.string().describe('Email subject line'),
    body:    z.string().describe('Email body text'),
  }),

  // needsApproval = true → pause before execute()
  needsApproval: true,

  execute: async ({ to, subject, body }) => {
    // In a real app: call your email service (SendGrid, SES, etc.)
    console.log(`\n📧 Email sent to ${to}`);
    return { success: true, messageId: `msg_${Date.now()}` };
  },
});

// ── Dynamic approval — only ask for external domains ──────────────────────
const sendEmailSmart = tool({
  name: 'sendEmailSmart',
  description: 'Send email — asks approval only for external addresses.',
  parameters: z.object({
    to:      z.string().email(),
    subject: z.string(),
    body:    z.string(),
  }),

  // Approval only when sending outside your company
  needsApproval: ({ to }) => !to.endsWith('@mycompany.com'),

  execute: async ({ to, subject, body }) => {
    console.log(`📧 Sent to ${to}: ${subject}`);
    return { success: true };
  },
});

// ── Agent ──────────────────────────────────────────────────────────────────
const agent = createAgent({
  name: 'email-agent',
  model: 'gpt-4o-mini',
  instructions: 'You help draft and send emails. Always confirm before sending.',
  tools: [sendEmail],

  // Wire up the approval handler
  onToolApprovalRequired: async ({ toolName, params }) => {
    const paramsStr = JSON.stringify(params, null, 2);
    const approved = await askHuman(
      `Agent wants to call "${toolName}" with:\n${paramsStr}`
    );
    return { approved };
  },
});

// ── Run ────────────────────────────────────────────────────────────────────
const result = await agent.run(
  'Send a quick email to bob@example.com saying the meeting is moved to 3pm.'
);
console.log(result.text);
```

## Terminal interaction

```
⚠️  Agent wants to call "sendEmail" with:
{
  "to": "bob@example.com",
  "subject": "Meeting Rescheduled",
  "body": "Hi Bob, just a heads up that the meeting has been moved to 3pm."
}
Approve? (yes/no): yes

📧 Email sent to bob@example.com
"I've sent Bob the email about the rescheduled meeting."
```

## Skip approval in tests

```ts
// In your test suite — auto-approve everything
const testAgent = createAgent({
  ...agentConfig,
  onToolApprovalRequired: async () => ({ approved: true }),
});
```

## Auto-deny dangerous patterns

```ts
onToolApprovalRequired: async ({ toolName, params }) => {
  // Automatically block bulk operations
  if (params.recipients?.length > 10) {
    console.warn('Blocked: bulk email not allowed');
    return { approved: false, reason: 'Bulk email requires manual review' };
  }
  return askHuman(`Allow ${toolName}?`);
},
```

## What's next?

- [04 · Extend & Wrap Tools](./04-extend-tools) — add middleware to any tool
