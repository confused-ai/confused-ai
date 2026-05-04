/**
 * confused-ai/playground — Interactive agent playground UI.
 *
 * ```ts
 * import { createPlayground } from 'confused-ai/playground';
 *
 * const svc = await createPlayground(
 *     [{ name: 'assistant', run: async (prompt) => agent.run(prompt) }],
 *     { port: 4000 },
 * );
 * console.log(`Open http://localhost:${svc.port}`);
 * ```
 */

export { createPlayground } from '@confused-ai/playground';
export type { PlaygroundAgent, PlaygroundOptions, PlaygroundServer } from '@confused-ai/playground';
