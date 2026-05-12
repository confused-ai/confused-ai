/**
 * fal.ai tools — generate images and videos via fal.ai API.
 * API docs: https://fal.ai/docs
 * API key: https://fal.ai/dashboard/keys
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface FalToolConfig {
    /** fal.ai API key (or FAL_KEY env var) */
    apiKey?: string;
}

function getKey(config: FalToolConfig): string {
    const key = config.apiKey ?? process.env['FAL_KEY'];
    if (!key) throw new Error('FalTools require FAL_KEY');
    return key;
}

async function falRun(key: string, appId: string, input: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`https://fal.run/${appId}`, {
        method: 'POST',
        headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`fal.ai API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const GenerateImageSchema = z.object({
    prompt: z.string().describe('Text prompt for image generation'),
    model: z.string().optional().default('fal-ai/flux/schnell')
        .describe('fal.ai model ID (e.g. "fal-ai/flux/schnell", "fal-ai/flux/dev", "fal-ai/stable-diffusion-v3-medium")'),
    imageSize: z.enum(['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'])
        .optional().default('landscape_4_3').describe('Output image size'),
    numImages: z.number().int().min(1).max(4).optional().default(1).describe('Number of images to generate'),
    numInferenceSteps: z.number().int().optional().describe('Number of inference steps'),
    guidanceScale: z.number().optional().describe('Guidance scale for prompt adherence'),
    seed: z.number().int().optional().describe('Seed for reproducibility'),
    enableSafetyChecker: z.boolean().optional().default(true).describe('Enable safety checker'),
});

const GenerateVideoSchema = z.object({
    prompt: z.string().describe('Text prompt for video generation'),
    model: z.string().optional().default('fal-ai/kling-video/v1/standard/text-to-video')
        .describe('fal.ai model ID for video generation'),
    duration: z.enum(['5', '10']).optional().default('5').describe('Video duration in seconds'),
    aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9').describe('Video aspect ratio'),
});

const ImageToImageSchema = z.object({
    prompt: z.string().describe('Transformation prompt'),
    imageUrl: z.string().url().describe('Source image URL'),
    model: z.string().optional().default('fal-ai/flux/dev/image-to-image')
        .describe('fal.ai image-to-image model ID'),
    strength: z.number().min(0).max(1).optional().default(0.75)
        .describe('Transformation strength (0=keep original, 1=full transformation)'),
    numInferenceSteps: z.number().int().optional().default(28),
});

const RemoveBackgroundSchema = z.object({
    imageUrl: z.string().url().describe('URL of the image to remove background from'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class FalGenerateImageTool extends BaseTool<typeof GenerateImageSchema> {
    constructor(private config: FalToolConfig = {}) {
        super({
            id: 'fal_generate_image',
            name: 'fal.ai Generate Image',
            description: 'Generate images using fal.ai models (Flux, Stable Diffusion, etc.).',
            category: ToolCategory.AI,
            parameters: GenerateImageSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 120000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GenerateImageSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        return falRun(key, input.model ?? 'fal-ai/flux/schnell', {
            prompt: input.prompt,
            image_size: input.imageSize ?? 'landscape_4_3',
            num_images: input.numImages ?? 1,
            num_inference_steps: input.numInferenceSteps,
            guidance_scale: input.guidanceScale,
            seed: input.seed,
            enable_safety_checker: input.enableSafetyChecker ?? true,
        });
    }
}

export class FalGenerateVideoTool extends BaseTool<typeof GenerateVideoSchema> {
    constructor(private config: FalToolConfig = {}) {
        super({
            id: 'fal_generate_video',
            name: 'fal.ai Generate Video',
            description: 'Generate videos from text prompts using fal.ai models.',
            category: ToolCategory.AI,
            parameters: GenerateVideoSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 300000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GenerateVideoSchema>, _ctx: ToolContext) {
        return falRun(getKey(this.config), input.model ?? 'fal-ai/kling-video/v1/standard/text-to-video', {
            prompt: input.prompt,
            duration: input.duration ?? '5',
            aspect_ratio: input.aspectRatio ?? '16:9',
        });
    }
}

export class FalImageToImageTool extends BaseTool<typeof ImageToImageSchema> {
    constructor(private config: FalToolConfig = {}) {
        super({
            id: 'fal_image_to_image',
            name: 'fal.ai Image to Image',
            description: 'Transform an existing image using a text prompt via fal.ai.',
            category: ToolCategory.AI,
            parameters: ImageToImageSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 120000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ImageToImageSchema>, _ctx: ToolContext) {
        return falRun(getKey(this.config), input.model ?? 'fal-ai/flux/dev/image-to-image', {
            prompt: input.prompt,
            image_url: input.imageUrl,
            strength: input.strength ?? 0.75,
            num_inference_steps: input.numInferenceSteps ?? 28,
        });
    }
}

export class FalRemoveBackgroundTool extends BaseTool<typeof RemoveBackgroundSchema> {
    constructor(private config: FalToolConfig = {}) {
        super({
            id: 'fal_remove_background',
            name: 'fal.ai Remove Background',
            description: 'Remove the background from an image using fal.ai.',
            category: ToolCategory.AI,
            parameters: RemoveBackgroundSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 60000 },
        });
    }

    protected async performExecute(input: z.infer<typeof RemoveBackgroundSchema>, _ctx: ToolContext) {
        return falRun(getKey(this.config), 'fal-ai/birefnet', { image_url: input.imageUrl });
    }
}

export class FalToolkit {
    readonly generateImage: FalGenerateImageTool;
    readonly generateVideo: FalGenerateVideoTool;
    readonly imageToImage: FalImageToImageTool;
    readonly removeBackground: FalRemoveBackgroundTool;

    constructor(config: FalToolConfig = {}) {
        this.generateImage = new FalGenerateImageTool(config);
        this.generateVideo = new FalGenerateVideoTool(config);
        this.imageToImage = new FalImageToImageTool(config);
        this.removeBackground = new FalRemoveBackgroundTool(config);
    }

    getTools() {
        return [this.generateImage, this.generateVideo, this.imageToImage, this.removeBackground];
    }
}
