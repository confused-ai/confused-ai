/**
 * LLM provider abstraction for production-grade agent frameworks.
 * Implement this interface to plug in OpenAI, Anthropic, Google, or custom backends.
 */

/**
 * Role of a message in a conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Multimodal content part: text, image_url, etc. (OpenAI-style)
 */
export type ContentPart =
    | { readonly type: 'text'; readonly text: string }
    | { readonly type: 'image_url'; readonly image_url: { readonly url: string; readonly detail?: 'low' | 'high' | 'auto' } }
    | { readonly type: 'file'; readonly file: { readonly url: string; readonly filename?: string } }
    | { readonly type: 'audio'; readonly audio: { readonly url: string } }
    | { readonly type: 'video'; readonly video: { readonly url: string } };

/**
 * A single message in a conversation.
 * content can be string (text-only) or ContentPart[] for multimodal (text, images, audio, video, files).
 */
export interface Message {
    readonly role: MessageRole;
    readonly content: string | ContentPart[];
}

/**
 * Message with optional toolCallId (for role 'tool')
 */
export interface MessageWithToolId extends Message {
    readonly toolCallId?: string;
}

/**
 * Tool call requested by the model (name + arguments)
 */
export interface ToolCall {
    readonly id: string;
    readonly name: string;
    readonly arguments: Record<string, unknown>;
}

/**
 * Tool result to send back to the model
 */
export interface ToolResultMessage {
    readonly toolCallId: string;
    readonly content: string;
}

/**
 * Assistant message that may include tool calls
 */
export interface AssistantMessage extends Message {
    role: 'assistant';
    content: string;
    toolCalls?: ToolCall[];
}

/**
 * Tool definition for the LLM (name, description, parameters schema as JSON Schema)
 */
export interface LLMToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>; // JSON Schema
}

/**
 * Result of a single generation (no streaming)
 */
export interface GenerateResult {
    readonly text: string;
    readonly toolCalls?: ToolCall[];
    readonly finishReason?: string;
    readonly usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

/**
 * Options for generateText
 */
export interface GenerateOptions {
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly tools?: LLMToolDefinition[];
    readonly toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
    readonly stop?: string[];
}

/**
 * Chunk from streaming (text delta or tool call delta)
 */
export interface StreamChunk {
    readonly type: 'text';
    readonly text: string;
}

export interface StreamToolCallChunk {
    readonly type: 'tool_call';
    readonly id: string;
    readonly name: string;
    readonly argsDelta: string;
}

export type StreamDelta = StreamChunk | StreamToolCallChunk;

/**
 * Options for streamText
 */
export interface StreamOptions extends GenerateOptions {
    readonly onChunk?: (delta: StreamDelta) => void;
}

/**
 * LLM provider interface.
 * Implement for OpenAI, Anthropic, Google, local models, etc.
 */
export interface LLMProvider {
    /**
     * Generate a single response (and optional tool calls) from messages.
     */
    generateText(messages: Message[], options?: GenerateOptions): Promise<GenerateResult>;

    /**
     * Stream response tokens and optional tool calls. Call onChunk for each delta.
     */
    streamText?(messages: Message[], options?: StreamOptions): Promise<GenerateResult>;
}
