/**
 * @confused-ai/voice — Voice provider module
 */
export {
    OpenAIVoiceProvider,
    ElevenLabsVoiceProvider,
    createVoiceProvider,
} from './voice-provider.js';

export type {
    VoiceConfig,
    VoiceProvider,
    TTSResult,
    STTResult,
    OpenAIVoice,
} from './voice-provider.js';

// ── Real-time streaming ──────────────────────────────────────────────────────
export { VoiceStreamSession } from './stream.js';
export type {
    VoiceStreamConfig,
    VoiceStreamEvent,
    VoiceStreamEventType,
} from './stream.js';
