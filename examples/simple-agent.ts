/**
 * Minimal agent using the framework.
 *
 * Uses the lean `create-agent` entry (in apps: `import { createAgent } from "confused-ai/create-agent"`).
 *
 * Requires: OPENAI_API_KEY in `examples/.env` (or your env) — see `resolveLlmForCreateAgent`.
 *
 * Run: `bun run example:simple`  or  `bun examples/simple-agent.ts`
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/** Load `examples/.env` even when you run from the repo root */
config({
    path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env'),
    quiet: true,
});

import { createAgent } from '../src/create-agent.js';
import { LearningMode } from '../src/learning/types.js';
import { InMemorySessionStore } from '../src/session/index.js';
import { HttpClientTool } from '../src/tools/http-tool.js';
import { BrowserTool } from '../src/tools/browser-tool.js';

async function main() {
    const agent = createAgent({
        name: 'SimpleAssistant',
        instructions: 'You are a helpful assistant. Be concise.',
        /** No tools — chat only. Add HttpClientTool, etc. from `confused-ai/tools` when needed. */
        tools: [],
        dev: true,
        learningMode: LearningMode.AGENTIC,
        sessionStore: new InMemorySessionStore(),

      
    });

    const prompt = process.argv.slice(2).join(' ') || 'What is 2+2? Reply in one short sentence.';
    const result = await agent.run(prompt);

    console.log('\n--- reply ---\n');
    console.log(result.text);
    console.log(`\n(finish: ${result.finishReason}, steps: ${result.steps})`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
