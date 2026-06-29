/**
 * confused-ai/lite — modern minimal entry point.
 *
 * Use this when you want the cleanest import surface and the smallest
 * runtime bundle. Pull in optional capabilities from focused subpaths such as
 * `confused-ai/tool`, `confused-ai/session`, or `confused-ai/knowledge` only
 * when you need them.
 */

export { agent } from './dx/agent.js';
export { bare } from './dx/bare.js';
export { defineAgent } from './dx/define-agent.js';
export { compose, pipe } from './dx/compose.js';
export type {
    AgentMinimalOptions,
} from './dx/agent.js';
export type {
    BareAgentOptions,
} from './dx/bare.js';
export type {
    DefineAgentOptions,
} from './dx/define-agent.js';
export type {
    ComposeOptions,
    ComposedAgent,
} from './dx/compose.js';

export { createAgent } from './create-agent.js';
export type {
    CreateAgentOptions,
    AgentRunOptions,
    CreateAgentResult,
    StreamChunk,
} from './create-agent.js';
