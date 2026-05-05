/**
 * OpenAI tool implementation - TypeScript OpenAITools
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';

/**
 * OpenAI API types
 */
interface OpenAIImageResponse {
    data: Array<{
        url?: string;
        b64_json?: string;
    }>;
}

interface OpenAITranscriptionResponse {
    text: string;
}

interface OpenAIResult {
    data?: unknown;
    error?: string;
}

/**
 * Base OpenAI tool with common authentication
 */
abstract class BaseOpenAITool<TParams extends z.ZodObject<Record<string, z.ZodType>>> extends BaseTool<TParams, OpenAIResult> {
    protected apiKey: string;
    protected baseUrl = 'https://api.openai.com/v1';

    constructor(
        config: Partial<Omit<BaseToolConfig<TParams>, 'parameters'>> & {
            apiKey?: string;
        },
        params: TParams
    ) {
        super({
            name: config.name || 'openai_tool',
            description: config.description || 'OpenAI tool',
            parameters: params,
            category: config.category || ToolCategory.AI,
            permissions: {
                allowNetwork: true,
                maxExecutionTimeMs: 60000,
                ...config.permissions,
            },
            ...config,
        });

        this.apiKey = config.apiKey || process.env['OPENAI_API_KEY'] || '';

        if (!this.apiKey) {
            throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey in config.');
        }
    }

    protected async openAIRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
        return fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                ...(options.headers || {}),
            },
        });
    }
}

/**
 * Generate image tool
 */
const OpenAIGenerateImageParameters = z.object({
    prompt: z.string().describe('Text description of the image to generate'),
    size: z.enum(['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792']).optional().default('1024x1024'),
    quality: z.enum(['standard', 'hd']).optional().default('standard'),
    style: z.enum(['vivid', 'natural']).optional().default('vivid'),
    model: z.enum(['dall-e-2', 'dall-e-3', 'gpt-image-1']).optional().default('dall-e-3'),
});

export class OpenAIGenerateImageTool extends BaseOpenAITool<typeof OpenAIGenerateImageParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof OpenAIGenerateImageParameters>, 'parameters'>> & {
            apiKey?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'openai_generate_image',
                description: config?.description ?? 'Generate an image using OpenAI DALL-E',
                ...config,
            },
            OpenAIGenerateImageParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof OpenAIGenerateImageParameters>,
        _context: ToolContext
    ): Promise<OpenAIResult> {
        try {
            const body: Record<string, unknown> = {
                model: params.model,
                prompt: params.prompt,
                n: 1,
                size: params.size,
            };

            if (params.model === 'dall-e-3') {
                body['quality'] = params['quality'];
                body['style'] = params['style'];
            }

            const response = await this.openAIRequest('/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorData = (await response.json()) as { error?: { message?: string } };
                throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
            }

            const data = (await response.json()) as OpenAIImageResponse;
            const imageData = data.data[0];
            if (!imageData) throw new Error('No image data returned from OpenAI');

            return {
                data: {
                    url: imageData.url,
                    b64_json: imageData.b64_json,
                    prompt: params.prompt,
                },
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * Transcribe audio tool
 */
const OpenAITranscribeAudioParameters = z.object({
    audio_url: z.string().describe('URL or path to the audio file'),
    model: z.enum(['whisper-1']).optional().default('whisper-1'),
    language: z.string().optional().describe('Language code (e.g., en, es)'),
});

export class OpenAITranscribeAudioTool extends BaseOpenAITool<typeof OpenAITranscribeAudioParameters> {
    constructor(
        config?: Partial<Omit<BaseToolConfig<typeof OpenAITranscribeAudioParameters>, 'parameters'>> & {
            apiKey?: string;
        }
    ) {
        super(
            {
                name: config?.name ?? 'openai_transcribe_audio',
                description: config?.description ?? 'Transcribe audio using OpenAI Whisper',
                ...config,
            },
            OpenAITranscribeAudioParameters
        );
    }

    protected async performExecute(
        params: z.infer<typeof OpenAITranscribeAudioParameters>,
        _context: ToolContext
    ): Promise<OpenAIResult> {
        try {
            // For URL-based audio, we need to fetch it first
            const audioResponse = await fetch(params.audio_url);
            if (!audioResponse.ok) {
                throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
            }

            const audioBlob = await audioResponse.blob();
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.mp3');
            formData.append('model', params.model);
            if (params.language) {
                formData.append('language', params.language);
            }

            const response = await this.openAIRequest('/audio/transcriptions', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = (await response.json()) as { error?: { message?: string } };
                throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
            }

            const data = (await response.json()) as OpenAITranscriptionResponse;

            return {
                data: {
                    text: data.text,
                },
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}

/**
 * OpenAI toolkit
 */
export class OpenAIToolkit {
    static create(options?: {
        apiKey?: string;
        enableImageGeneration?: boolean;
        enableTranscription?: boolean;
    }): Array<OpenAIGenerateImageTool | OpenAITranscribeAudioTool> {
        const tools: Array<OpenAIGenerateImageTool | OpenAITranscribeAudioTool> = [];

        if (options?.enableImageGeneration !== false) {
            tools.push(new OpenAIGenerateImageTool({ ...(options?.apiKey !== undefined && { apiKey: options.apiKey }) }));
        }
        if (options?.enableTranscription !== false) {
            tools.push(new OpenAITranscribeAudioTool({ ...(options?.apiKey !== undefined && { apiKey: options.apiKey }) }));
        }

        return tools;
    }
}
