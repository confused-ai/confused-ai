/**
 * Voice Provider — TTS/STT Support
 *
 * Text-to-speech and speech-to-text capabilities:
 * - OpenAI voice support
 * - ElevenLabs integration
 * - Custom voice provider interface
 */

/** Voice configuration */
export interface VoiceConfig {
    /** Voice provider type */
    readonly provider: 'openai' | 'elevenlabs' | 'custom';
    /** Voice ID */
    readonly voiceId?: string;
    /** Model for TTS */
    readonly model?: string;
    /** Speed (0.25 to 4.0) */
    readonly speed?: number;
    /** API key (if not in env) */
    readonly apiKey?: string;
}

/** TTS result */
export interface TTSResult {
    /** Audio data as ArrayBuffer */
    readonly audio: ArrayBuffer;
    /** Audio format */
    readonly format: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
    /** Duration in seconds */
    readonly durationSeconds?: number;
    /** Character count */
    readonly characterCount: number;
}

/** STT result */
export interface STTResult {
    /** Transcribed text */
    readonly text: string;
    /** Language detected */
    readonly language?: string;
    /** Confidence score (0-1) */
    readonly confidence?: number;
    /** Duration of audio in seconds */
    readonly durationSeconds?: number;
}

/** Voice provider interface */
export interface VoiceProvider {
    /** Text-to-speech */
    textToSpeech(text: string, options?: Partial<VoiceConfig>): Promise<TTSResult>;

    /** Speech-to-text */
    speechToText?(audio: ArrayBuffer | Blob, options?: { language?: string }): Promise<STTResult>;

    /** List available voices */
    listVoices?(): Promise<Array<{ id: string; name: string; preview_url?: string }>>;
}

/** OpenAI voice IDs */
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/**
 * OpenAI Voice Provider
 *
 * @example
 * const voice = new OpenAIVoiceProvider();
 * const audio = await voice.textToSpeech('Hello, world!', { voiceId: 'nova' });
 */
export class OpenAIVoiceProvider implements VoiceProvider {
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(config?: { apiKey?: string; baseUrl?: string }) {
        this.apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
        this.baseUrl = config?.baseUrl ?? 'https://api.openai.com/v1';

        if (!this.apiKey) {
            throw new Error('OpenAI API key required for voice provider');
        }
    }

    async textToSpeech(text: string, options?: Partial<VoiceConfig>): Promise<TTSResult> {
        const voice = (options?.voiceId ?? 'alloy') as OpenAIVoice;
        const model = options?.model ?? 'tts-1';
        const speed = options?.speed ?? 1.0;

        const response = await fetch(`${this.baseUrl}/audio/speech`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                input: text,
                voice,
                speed,
                response_format: 'mp3',
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI TTS failed: ${response.status} ${await response.text()}`);
        }

        const audio = await response.arrayBuffer();

        return {
            audio,
            format: 'mp3',
            characterCount: text.length,
        };
    }

    async speechToText(audio: ArrayBuffer | Blob, options?: { language?: string }): Promise<STTResult> {
        const formData = new FormData();

        const blob = audio instanceof Blob ? audio : new Blob([audio], { type: 'audio/wav' });
        formData.append('file', blob, 'audio.wav');
        formData.append('model', 'whisper-1');

        if (options?.language) {
            formData.append('language', options.language);
        }

        const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`OpenAI STT failed: ${response.status} ${await response.text()}`);
        }

        const result = await response.json() as { text: string; language?: string };

        return {
            text: result.text,
            language: result.language,
        };
    }

    async listVoices(): Promise<Array<{ id: string; name: string }>> {
        return [
            { id: 'alloy', name: 'Alloy' },
            { id: 'echo', name: 'Echo' },
            { id: 'fable', name: 'Fable' },
            { id: 'onyx', name: 'Onyx' },
            { id: 'nova', name: 'Nova' },
            { id: 'shimmer', name: 'Shimmer' },
        ];
    }
}

/**
 * ElevenLabs Voice Provider (stub - requires implementation)
 */
export class ElevenLabsVoiceProvider implements VoiceProvider {
    private readonly apiKey: string;
    private readonly baseUrl = 'https://api.elevenlabs.io/v1';

    constructor(config?: { apiKey?: string }) {
        this.apiKey = config?.apiKey ?? process.env.ELEVENLABS_API_KEY ?? '';
    }

    async textToSpeech(text: string, options?: Partial<VoiceConfig>): Promise<TTSResult> {
        const voiceId = options?.voiceId ?? '21m00Tcm4TlvDq8ikWAM'; // Rachel

        const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': this.apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                model_id: options?.model ?? 'eleven_monolingual_v1',
            }),
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs TTS failed: ${response.status}`);
        }

        const audio = await response.arrayBuffer();

        return {
            audio,
            format: 'mp3',
            characterCount: text.length,
        };
    }

    async listVoices(): Promise<Array<{ id: string; name: string; preview_url?: string }>> {
        const response = await fetch(`${this.baseUrl}/voices`, {
            headers: { 'xi-api-key': this.apiKey },
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs list voices failed: ${response.status}`);
        }

        const data = await response.json() as { voices: Array<{ voice_id: string; name: string; preview_url?: string }> };
        return data.voices.map((v) => ({
            id: v.voice_id,
            name: v.name,
            preview_url: v.preview_url,
        }));
    }
}

/**
 * Create a voice provider based on configuration
 */
export function createVoiceProvider(config: VoiceConfig): VoiceProvider {
    switch (config.provider) {
        case 'openai':
            return new OpenAIVoiceProvider({ apiKey: config.apiKey });
        case 'elevenlabs':
            return new ElevenLabsVoiceProvider({ apiKey: config.apiKey });
        default:
            throw new Error(`Unknown voice provider: ${config.provider}`);
    }
}
