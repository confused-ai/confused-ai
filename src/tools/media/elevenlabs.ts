/**
 * ElevenLabs TTS tools — text-to-speech and voice management via ElevenLabs API.
 * API docs: https://elevenlabs.io/docs/api-reference
 * API key: https://elevenlabs.io/app/speech-synthesis
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface ElevenLabsToolConfig {
    /** ElevenLabs API key (or ELEVEN_LABS_API_KEY env var) */
    apiKey?: string;
    /** Default voice ID */
    defaultVoiceId?: string;
    /** Default model ID */
    defaultModelId?: string;
}

function getKey(config: ElevenLabsToolConfig): string {
    const key = config.apiKey ?? process.env.ELEVEN_LABS_API_KEY;
    if (!key) throw new Error('ElevenLabsTools require ELEVEN_LABS_API_KEY');
    return key;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const TextToSpeechSchema = z.object({
    text: z.string().min(1).describe('Text to convert to speech'),
    voiceId: z.string().optional().default('JBFqnCBsd6RMkjVDRZzb')
        .describe('ElevenLabs voice ID (default: George)'),
    modelId: z.string().optional().default('eleven_multilingual_v2')
        .describe('Model ID (eleven_multilingual_v2, eleven_turbo_v2, eleven_monolingual_v1)'),
    outputFormat: z.enum(['mp3_22050_32', 'mp3_44100_32', 'mp3_44100_64', 'mp3_44100_128', 'mp3_44100_192', 'pcm_16000', 'pcm_22050', 'pcm_24000', 'pcm_44100'])
        .optional().default('mp3_44100_128').describe('Audio output format'),
    voiceSettings: z.object({
        stability: z.number().min(0).max(1).optional().default(0.5)
            .describe('Voice stability (0=more variable, 1=more stable)'),
        similarityBoost: z.number().min(0).max(1).optional().default(0.75)
            .describe('Similarity boost for voice matching'),
        style: z.number().min(0).max(1).optional().default(0)
            .describe('Style exaggeration (0=neutral, 1=exaggerated)'),
        useSpeakerBoost: z.boolean().optional().default(true).describe('Use speaker boost'),
    }).optional().describe('Voice settings'),
    returnBase64: z.boolean().optional().default(true)
        .describe('Return audio as base64 (true) or stream URL info only'),
});

const ListVoicesSchema = z.object({
    showLegacy: z.boolean().optional().default(false).describe('Include legacy voices'),
});

const GetVoiceSchema = z.object({
    voiceId: z.string().describe('ElevenLabs voice ID'),
});

const SoundEffectSchema = z.object({
    text: z.string().describe('Description of the sound effect to generate'),
    durationSeconds: z.number().min(0.5).max(22).optional()
        .describe('Duration in seconds (0.5-22)'),
    promptInfluence: z.number().min(0).max(1).optional().default(0.3)
        .describe('How closely to follow the prompt (0-1)'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ElevenLabsTTSTool extends BaseTool<typeof TextToSpeechSchema, {
    audioBase64?: string;
    audioFormat: string;
    voiceId: string;
    characterCount: number;
}> {
    constructor(private config: ElevenLabsToolConfig = {}) {
        super({
            id: 'elevenlabs_tts',
            name: 'ElevenLabs Text to Speech',
            description: 'Convert text to natural-sounding speech using ElevenLabs AI voices.',
            category: ToolCategory.AI,
            parameters: TextToSpeechSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 60000 },
        });
    }

    protected async performExecute(input: z.infer<typeof TextToSpeechSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const voiceId = input.voiceId ?? this.config.defaultVoiceId ?? 'JBFqnCBsd6RMkjVDRZzb';
        const modelId = input.modelId ?? this.config.defaultModelId ?? 'eleven_multilingual_v2';
        const outputFormat = input.outputFormat ?? 'mp3_44100_128';

        const res = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`,
            {
                method: 'POST',
                headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: input.text,
                    model_id: modelId,
                    voice_settings: input.voiceSettings ? {
                        stability: input.voiceSettings.stability ?? 0.5,
                        similarity_boost: input.voiceSettings.similarityBoost ?? 0.75,
                        style: input.voiceSettings.style ?? 0,
                        use_speaker_boost: input.voiceSettings.useSpeakerBoost ?? true,
                    } : undefined,
                }),
            }
        );
        if (!res.ok) throw new Error(`ElevenLabs API ${res.status}: ${await res.text()}`);

        if (input.returnBase64 ?? true) {
            const buffer = await res.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            return {
                audioBase64: base64,
                audioFormat: outputFormat,
                voiceId,
                characterCount: input.text.length,
            };
        }

        return { audioFormat: outputFormat, voiceId, characterCount: input.text.length };
    }
}

export class ElevenLabsListVoicesTool extends BaseTool<typeof ListVoicesSchema, {
    voices: Array<{ voiceId: string; name: string; category: string; description?: string; previewUrl?: string }>;
}> {
    constructor(private config: ElevenLabsToolConfig = {}) {
        super({
            id: 'elevenlabs_list_voices',
            name: 'ElevenLabs List Voices',
            description: 'List available ElevenLabs voices.',
            category: ToolCategory.AI,
            parameters: ListVoicesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListVoicesSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const params = new URLSearchParams({ show_legacy: String(input.showLegacy ?? false) });
        const res = await fetch(`https://api.elevenlabs.io/v1/voices?${params}`, {
            headers: { 'xi-api-key': key },
        });
        if (!res.ok) throw new Error(`ElevenLabs API ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            voices?: Array<{ voice_id: string; name: string; category: string; description?: string; preview_url?: string }>;
        };
        return {
            voices: (data.voices ?? []).map(v => ({
                voiceId: v.voice_id,
                name: v.name,
                category: v.category,
                description: v.description,
                previewUrl: v.preview_url,
            })),
        };
    }
}

export class ElevenLabsGetVoiceTool extends BaseTool<typeof GetVoiceSchema> {
    constructor(private config: ElevenLabsToolConfig = {}) {
        super({
            id: 'elevenlabs_get_voice',
            name: 'ElevenLabs Get Voice',
            description: 'Get details of a specific ElevenLabs voice.',
            category: ToolCategory.AI,
            parameters: GetVoiceSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetVoiceSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const res = await fetch(`https://api.elevenlabs.io/v1/voices/${input.voiceId}`, {
            headers: { 'xi-api-key': key },
        });
        if (!res.ok) throw new Error(`ElevenLabs API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class ElevenLabsSoundEffectTool extends BaseTool<typeof SoundEffectSchema, {
    audioBase64: string;
    audioFormat: string;
}> {
    constructor(private config: ElevenLabsToolConfig = {}) {
        super({
            id: 'elevenlabs_sound_effect',
            name: 'ElevenLabs Sound Effect',
            description: 'Generate a sound effect from a text description using ElevenLabs.',
            category: ToolCategory.AI,
            parameters: SoundEffectSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 60000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SoundEffectSchema>, _ctx: ToolContext) {
        const key = getKey(this.config);
        const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
            method: 'POST',
            headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: input.text,
                duration_seconds: input.durationSeconds,
                prompt_influence: input.promptInfluence ?? 0.3,
            }),
        });
        if (!res.ok) throw new Error(`ElevenLabs API ${res.status}: ${await res.text()}`);
        const buffer = await res.arrayBuffer();
        return {
            audioBase64: Buffer.from(buffer).toString('base64'),
            audioFormat: 'mp3_44100_128',
        };
    }
}

export class ElevenLabsToolkit {
    readonly tts: ElevenLabsTTSTool;
    readonly listVoices: ElevenLabsListVoicesTool;
    readonly getVoice: ElevenLabsGetVoiceTool;
    readonly soundEffect: ElevenLabsSoundEffectTool;

    constructor(config: ElevenLabsToolConfig = {}) {
        this.tts = new ElevenLabsTTSTool(config);
        this.listVoices = new ElevenLabsListVoicesTool(config);
        this.getVoice = new ElevenLabsGetVoiceTool(config);
        this.soundEffect = new ElevenLabsSoundEffectTool(config);
    }

    getTools() {
        return [this.tts, this.listVoices, this.getVoice, this.soundEffect];
    }
}
