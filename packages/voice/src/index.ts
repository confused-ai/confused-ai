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
