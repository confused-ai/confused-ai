/**
 * Replicate AI tools — run AI models (image, video, audio) via Replicate.
 * API docs: https://replicate.com/docs/reference/http
 * API key: https://replicate.com/account/api-tokens
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface ReplicateToolConfig {
    /** Replicate API token (or REPLICATE_API_TOKEN env var) */
    apiToken?: string;
}

function getToken(config: ReplicateToolConfig): string {
    const token = config.apiToken ?? process.env['REPLICATE_API_TOKEN'];
    if (!token) throw new Error('ReplicateTools require REPLICATE_API_TOKEN');
    return token;
}

async function runPrediction(token: string, model: string, input: Record<string, unknown>): Promise<{
    id: string;
    status: string;
    output?: unknown;
    urls?: { get: string };
}> {
    const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
        body: JSON.stringify({ input }),
    });
    if (!res.ok) throw new Error(`Replicate API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<{ id: string; status: string; output?: unknown; urls?: { get: string } }>;
}

async function getPrediction(token: string, predictionId: string): Promise<unknown> {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Replicate API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const GenerateImageSchema = z.object({
    prompt: z.string().describe('Text prompt for image generation'),
    model: z.string().optional().default('stability-ai/sdxl')
        .describe('Replicate model path (e.g. "stability-ai/sdxl", "black-forest-labs/flux-schnell")'),
    negativePrompt: z.string().optional().describe('Negative prompt to avoid certain elements'),
    width: z.number().int().optional().default(1024).describe('Image width in pixels'),
    height: z.number().int().optional().default(1024).describe('Image height in pixels'),
    numOutputs: z.number().int().min(1).max(4).optional().default(1).describe('Number of images to generate'),
    numInferenceSteps: z.number().int().optional().describe('Number of denoising steps'),
    guidanceScale: z.number().optional().describe('Guidance scale for prompt adherence'),
});

const GenerateVideoSchema = z.object({
    prompt: z.string().describe('Text prompt for video generation'),
    model: z.string().optional().default('minimax/video-01')
        .describe('Replicate model path for video generation'),
    duration: z.number().optional().describe('Video duration in seconds (model-dependent)'),
    fps: z.number().int().optional().describe('Frames per second'),
});

const TranscribeAudioSchema = z.object({
    audioUrl: z.string().url().describe('URL of the audio file to transcribe'),
    model: z.string().optional().default('openai/whisper')
        .describe('Replicate model for transcription'),
    language: z.string().optional().describe('Language code (e.g. "en") — auto-detected if omitted'),
});

const GetPredictionSchema = z.object({
    predictionId: z.string().describe('Replicate prediction ID to check status'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ReplicateGenerateImageTool extends BaseTool<typeof GenerateImageSchema> {
    constructor(private config: ReplicateToolConfig = {}) {
        super({
            id: 'replicate_generate_image',
            name: 'Replicate Generate Image',
            description: 'Generate images using AI models on Replicate (SDXL, Flux, DALL-E alternatives, etc.).',
            category: ToolCategory.AI,
            parameters: GenerateImageSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 120000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GenerateImageSchema>, _ctx: ToolContext) {
        const token = getToken(this.config);
        const modelInput: Record<string, unknown> = {
            prompt: input.prompt,
            width: input.width ?? 1024,
            height: input.height ?? 1024,
            num_outputs: input.numOutputs ?? 1,
        };
        if (input.negativePrompt) modelInput['negative_prompt'] = input.negativePrompt;
        if (input.numInferenceSteps) modelInput['num_inference_steps'] = input.numInferenceSteps;
        if (input.guidanceScale) modelInput['guidance_scale'] = input.guidanceScale;

        return runPrediction(token, input.model ?? 'stability-ai/sdxl', modelInput);
    }
}

export class ReplicateGenerateVideoTool extends BaseTool<typeof GenerateVideoSchema> {
    constructor(private config: ReplicateToolConfig = {}) {
        super({
            id: 'replicate_generate_video',
            name: 'Replicate Generate Video',
            description: 'Generate videos using AI models on Replicate.',
            category: ToolCategory.AI,
            parameters: GenerateVideoSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 300000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GenerateVideoSchema>, _ctx: ToolContext) {
        const token = getToken(this.config);
        const modelInput: Record<string, unknown> = { prompt: input.prompt };
        if (input.duration) modelInput['duration'] = input.duration;
        if (input.fps) modelInput['fps'] = input.fps;
        return runPrediction(token, input.model ?? 'minimax/video-01', modelInput);
    }
}

export class ReplicateTranscribeAudioTool extends BaseTool<typeof TranscribeAudioSchema> {
    constructor(private config: ReplicateToolConfig = {}) {
        super({
            id: 'replicate_transcribe_audio',
            name: 'Replicate Transcribe Audio',
            description: 'Transcribe audio to text using Whisper or other models on Replicate.',
            category: ToolCategory.AI,
            parameters: TranscribeAudioSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 120000 },
        });
    }

    protected async performExecute(input: z.infer<typeof TranscribeAudioSchema>, _ctx: ToolContext) {
        const token = getToken(this.config);
        const modelInput: Record<string, unknown> = { audio: input.audioUrl };
        if (input.language) modelInput['language'] = input.language;
        return runPrediction(token, input.model ?? 'openai/whisper', modelInput);
    }
}

export class ReplicateGetPredictionTool extends BaseTool<typeof GetPredictionSchema> {
    constructor(private config: ReplicateToolConfig = {}) {
        super({
            id: 'replicate_get_prediction',
            name: 'Replicate Get Prediction',
            description: 'Get the status and output of a Replicate prediction by ID.',
            category: ToolCategory.AI,
            parameters: GetPredictionSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetPredictionSchema>, _ctx: ToolContext) {
        return getPrediction(getToken(this.config), input.predictionId);
    }
}

export class ReplicateToolkit {
    readonly generateImage: ReplicateGenerateImageTool;
    readonly generateVideo: ReplicateGenerateVideoTool;
    readonly transcribeAudio: ReplicateTranscribeAudioTool;
    readonly getPrediction: ReplicateGetPredictionTool;

    constructor(config: ReplicateToolConfig = {}) {
        this.generateImage = new ReplicateGenerateImageTool(config);
        this.generateVideo = new ReplicateGenerateVideoTool(config);
        this.transcribeAudio = new ReplicateTranscribeAudioTool(config);
        this.getPrediction = new ReplicateGetPredictionTool(config);
    }

    getTools() {
        return [this.generateImage, this.generateVideo, this.transcribeAudio, this.getPrediction];
    }
}
