/**
 * confused-ai/tool — Define, compose, and manage tools.
 *
 * ```ts
 * import { tool, createTools, defineTool, extendTool } from 'confused-ai/tool'
 * ```
 */

// ── Core tool helper ────────────────────────────────────────────────────────
export {
    tool,
    createTool,
    createTools,
    defineTool,
    extendTool,
    wrapTool,
    pipeTools,
    isLightweightTool,
    ToolBuilder,
    type ToolHelperConfig,
    type LightweightTool,
    type SimpleToolContext,
    type ToolWrapMiddleware,
    type ExtendToolOptions,
} from './tools/core/tool-helper.js';

// ── Tool types ──────────────────────────────────────────────────────────────
export {
    ToolCategory,
} from './tools/core/types.js';

export type {
    Tool,
    ToolContext,
    ToolResult,
    ToolError,
    ToolPermissions,
    ToolRegistry,
    ToolMiddleware,
    ToolParameters,
} from './tools/core/types.js';

// ── Built-in tools ──────────────────────────────────────────────────────────
export * from './tools/utils/index.js';

// ── MCP (Model Context Protocol) ────────────────────────────────────────────
export * from './tools/mcp/index.js';
