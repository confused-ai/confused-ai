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
} from '@confused-ai/tools';

// ── Tool types ──────────────────────────────────────────────────────────────
export {
    ToolCategory,
} from '@confused-ai/tools';

export type {
    Tool,
    ToolContext,
    ToolResult,
    ToolError,
    ToolPermissions,
    ToolRegistry,
    ToolMiddleware,
    ToolParameters,
} from '@confused-ai/tools';

// ── Built-in tools ──────────────────────────────────────────────────────────
export * from '@confused-ai/tools';

// ── MCP (Model Context Protocol) ────────────────────────────────────────────
