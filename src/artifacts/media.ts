/**
 * Media artifacts: image, audio, and video
 *
 * Production-grade media handling:
 * - Image generation and storage
 * - Audio transcription and synthesis artifacts
 * - Video processing artifacts
 * - URL and base64 support
 */

import type { ArtifactStorage, BinaryArtifact, ArtifactMetadata } from './artifact.js';

/** Image generation result */
export interface ImageArtifact extends Omit<BinaryArtifact, 'type'> {
    type: 'image';
    /** Image width in pixels */
    readonly width?: number;
    /** Image height in pixels */
    readonly height?: number;
    /** Generation prompt (if AI-generated) */
    readonly prompt?: string;
    /** Negative prompt (if applicable) */
    readonly negativePrompt?: string;
    /** Model used for generation */
    readonly model?: string;
    /** Seed for reproducibility */
    readonly seed?: number;
}

/** Audio artifact */
export interface AudioArtifact extends Omit<BinaryArtifact, 'type'> {
    type: 'audio';
    /** Duration in seconds */
    readonly durationSeconds?: number;
    /** Sample rate in Hz */
    readonly sampleRate?: number;
    /** Number of channels */
    readonly channels?: number;
    /** Transcript (if available) */
    readonly transcript?: string;
    /** Voice ID (for TTS) */
    readonly voiceId?: string;
}

/** Video artifact */
export interface VideoArtifact extends Omit<BinaryArtifact, 'type'> {
    type: 'video';
    /** Duration in seconds */
    readonly durationSeconds?: number;
    /** Width in pixels */
    readonly width?: number;
    /** Height in pixels */
    readonly height?: number;
    /** Frame rate */
    readonly fps?: number;
    /** Thumbnail URL */
    readonly thumbnailUrl?: string;
}

// --- Media Artifact Helpers ---

/**
 * Create an image artifact from URL
 */
export function createImageFromUrl(
    name: string,
    url: string,
    options?: {
        width?: number;
        height?: number;
        prompt?: string;
        model?: string;
        tags?: string[];
    }
): Omit<ImageArtifact, 'id' | 'createdAt' | 'updatedAt' | 'version'> {
    return {
        name,
        type: 'image',
        content: url,
        url,
        mimeType: guessImageMimeType(url),
        width: options?.width,
        height: options?.height,
        prompt: options?.prompt,
        model: options?.model,
        tags: options?.tags,
    };
}

/**
 * Create an image artifact from base64
 */
export function createImageFromBase64(
    name: string,
    base64: string,
    mimeType: string,
    options?: {
        width?: number;
        height?: number;
        prompt?: string;
        model?: string;
        tags?: string[];
    }
): Omit<ImageArtifact, 'id' | 'createdAt' | 'updatedAt' | 'version'> {
    return {
        name,
        type: 'image',
        content: base64,
        base64,
        mimeType,
        width: options?.width,
        height: options?.height,
        prompt: options?.prompt,
        model: options?.model,
        tags: options?.tags,
    };
}

/**
 * Create an audio artifact from URL
 */
export function createAudioFromUrl(
    name: string,
    url: string,
    options?: {
        durationSeconds?: number;
        transcript?: string;
        voiceId?: string;
        tags?: string[];
    }
): Omit<AudioArtifact, 'id' | 'createdAt' | 'updatedAt' | 'version'> {
    return {
        name,
        type: 'audio',
        content: url,
        url,
        mimeType: guessAudioMimeType(url),
        durationSeconds: options?.durationSeconds,
        transcript: options?.transcript,
        voiceId: options?.voiceId,
        tags: options?.tags,
    };
}

/**
 * Create a video artifact from URL
 */
export function createVideoFromUrl(
    name: string,
    url: string,
    options?: {
        durationSeconds?: number;
        width?: number;
        height?: number;
        fps?: number;
        thumbnailUrl?: string;
        tags?: string[];
    }
): Omit<VideoArtifact, 'id' | 'createdAt' | 'updatedAt' | 'version'> {
    return {
        name,
        type: 'video',
        content: url,
        url,
        mimeType: guessVideoMimeType(url),
        durationSeconds: options?.durationSeconds,
        width: options?.width,
        height: options?.height,
        fps: options?.fps,
        thumbnailUrl: options?.thumbnailUrl,
        tags: options?.tags,
    };
}

// --- Media Manager ---

/**
 * MediaManager - handles media artifact operations
 */
export class MediaManager {
    constructor(private readonly storage: ArtifactStorage) { }

    /** Save an image artifact */
    async saveImage(
        name: string,
        source: string | { base64: string; mimeType: string },
        options?: {
            width?: number;
            height?: number;
            prompt?: string;
            model?: string;
            tags?: string[];
        }
    ): Promise<ImageArtifact> {
        const artifact = typeof source === 'string'
            ? createImageFromUrl(name, source, options)
            : createImageFromBase64(name, source.base64, source.mimeType, options);

        return await this.storage.save(artifact) as ImageArtifact;
    }

    /** Save an audio artifact */
    async saveAudio(
        name: string,
        url: string,
        options?: {
            durationSeconds?: number;
            transcript?: string;
            voiceId?: string;
            tags?: string[];
        }
    ): Promise<AudioArtifact> {
        const artifact = createAudioFromUrl(name, url, options);
        return await this.storage.save(artifact) as AudioArtifact;
    }

    /** Save a video artifact */
    async saveVideo(
        name: string,
        url: string,
        options?: {
            durationSeconds?: number;
            width?: number;
            height?: number;
            fps?: number;
            thumbnailUrl?: string;
            tags?: string[];
        }
    ): Promise<VideoArtifact> {
        const artifact = createVideoFromUrl(name, url, options);
        return await this.storage.save(artifact) as VideoArtifact;
    }

    /** Get an image by ID */
    async getImage(id: string): Promise<ImageArtifact | null> {
        return await this.storage.get<ImageArtifact['content']>(id) as ImageArtifact | null;
    }

    /** Get an audio by ID */
    async getAudio(id: string): Promise<AudioArtifact | null> {
        return await this.storage.get<AudioArtifact['content']>(id) as AudioArtifact | null;
    }

    /** Get a video by ID */
    async getVideo(id: string): Promise<VideoArtifact | null> {
        return await this.storage.get<VideoArtifact['content']>(id) as VideoArtifact | null;
    }

    /** List all images */
    async listImages(limit?: number): Promise<ArtifactMetadata[]> {
        return await this.storage.list({ type: 'image', limit });
    }

    /** List all audio */
    async listAudio(limit?: number): Promise<ArtifactMetadata[]> {
        return await this.storage.list({ type: 'audio', limit });
    }

    /** List all videos */
    async listVideos(limit?: number): Promise<ArtifactMetadata[]> {
        return await this.storage.list({ type: 'video', limit });
    }
}

// --- Helpers ---

function guessImageMimeType(url: string): string {
    const ext = url.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        bmp: 'image/bmp',
    };
    return mimeTypes[ext ?? ''] ?? 'image/png';
}

function guessAudioMimeType(url: string): string {
    const ext = url.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        flac: 'audio/flac',
        aac: 'audio/aac',
        m4a: 'audio/mp4',
    };
    return mimeTypes[ext ?? ''] ?? 'audio/mpeg';
}

function guessVideoMimeType(url: string): string {
    const ext = url.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
        mp4: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime',
        avi: 'video/x-msvideo',
        mkv: 'video/x-matroska',
    };
    return mimeTypes[ext ?? ''] ?? 'video/mp4';
}
