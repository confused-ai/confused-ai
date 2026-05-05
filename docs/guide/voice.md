---
title: Voice (TTS & STT)
description: Text-to-speech and speech-to-text with OpenAI and ElevenLabs — build voice assistants, podcast generators, and audio pipelines.
outline: [2, 3]
---

# Voice (TTS & STT)

The voice module provides text-to-speech (TTS) and speech-to-text (STT) via OpenAI and ElevenLabs. Wire it into agents to build voice assistants, podcast generators, transcription pipelines, and phone bots.

| Provider | TTS | STT | Notes |
|----------|-----|-----|-------|
| OpenAI | ✅ | ✅ | tts-1, tts-1-hd; whisper-1 |
| ElevenLabs | ✅ | ❌ | 30+ voices, custom cloning |

---

## Quick start

```ts
import { createVoiceProvider, OpenAIVoiceProvider } from 'confused-ai/voice';
import { agent }                                     from 'confused-ai';

const voice = createVoiceProvider(new OpenAIVoiceProvider({
  apiKey:    process.env.OPENAI_API_KEY!,
  ttsModel:  'tts-1-hd',
  ttsVoice:  'nova',
  sttModel:  'whisper-1',
}));

const ai = agent({
  model:        'gpt-4o',
  instructions: 'You are a voice assistant.',
  voice,
});

// Run with text input — get text + audio response
const result = await ai.run('Tell me a short joke');
console.log(result.text);              // text response
await writeFile('response.mp3', result.audio!);  // audio buffer
```

---

## OpenAI voice provider

```ts
import { OpenAIVoiceProvider } from 'confused-ai/voice';

const provider = new OpenAIVoiceProvider({
  apiKey:    process.env.OPENAI_API_KEY!,
  ttsModel:  'tts-1-hd',  // 'tts-1' (faster) | 'tts-1-hd' (higher quality)
  ttsVoice:  'nova',
  sttModel:  'whisper-1',
});

// Text-to-speech directly
const audioBuffer = await provider.tts('Hello! Welcome to the voice assistant.');
await writeFile('hello.mp3', audioBuffer);

// Speech-to-text from a file
const audioData = await readFile('./user-recording.mp3');
const transcript = await provider.stt(audioData);
console.log(transcript.text);  // transcribed text
```

### Available OpenAI voices

| Voice | Description |
|-------|-------------|
| `alloy` | Neutral, versatile |
| `echo` | Clear male |
| `fable` | Expressive, British |
| `onyx` | Deep, authoritative |
| `nova` | Friendly female |
| `shimmer` | Soft, warm female |

---

## ElevenLabs voice provider

```ts
import { ElevenLabsVoiceProvider } from 'confused-ai/voice';

const provider = new ElevenLabsVoiceProvider({
  apiKey:  process.env.ELEVENLABS_API_KEY!,
  voiceId: 'EXAVITQu4vr4xnSDxMaL',  // Rachel (ElevenLabs ID)
  model:   'eleven_turbo_v2',        // 'eleven_multilingual_v2' | 'eleven_turbo_v2'
});

const audioBuffer = await provider.tts('Your report is ready. Here is the summary...');
await writeFile('report.mp3', audioBuffer);
```

### Listing available voices

```ts
const voices = await provider.listVoices();
for (const v of voices) {
  console.log(`${v.name} — ${v.voiceId}`);
}
```

---

## Audio agent (speech → agent → speech)

Build a full round-trip voice agent:

```ts
import { OpenAIVoiceProvider } from 'confused-ai/voice';
import { agent }               from 'confused-ai';
import { readFile, writeFile } from 'fs/promises';

const voiceProvider = new OpenAIVoiceProvider({
  apiKey:    process.env.OPENAI_API_KEY!,
  ttsVoice:  'nova',
  sttModel:  'whisper-1',
});

const ai = agent({
  model:        'gpt-4o',
  instructions: 'You are a helpful voice assistant. Keep answers under 3 sentences.',
});

// 1. Transcribe user audio
const userAudio  = await readFile('./user-question.mp3');
const transcript = await voiceProvider.stt(userAudio);

// 2. Run agent
const result     = await ai.run(transcript.text);

// 3. Convert response to speech
const audioOut   = await voiceProvider.tts(result.text);
await writeFile('./assistant-response.mp3', audioOut);
```

---

## Streaming TTS

For low-latency playback, stream audio chunks as they are generated:

```ts
const stream = await provider.ttsStream('Long text that should be read aloud...');

for await (const chunk of stream) {
  audioPlayer.push(chunk);  // push to audio player in real time
}
```

---

## Quick start

```ts
import { createVoiceProvider } from 'confused-ai/voice';

// Auto-selects OpenAI if OPENAI_API_KEY is set
const voice = createVoiceProvider();

// Text-to-speech
const tts = await voice.textToSpeech('Hello, I am your AI assistant.', {
  voice: 'alloy',    // 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  speed: 1.0,        // 0.25 – 4.0
  format: 'mp3',     // 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
});

// tts.audioBuffer — Buffer with audio data
// tts.mimeType    — 'audio/mpeg'
// tts.durationMs  — estimated duration

import { writeFile } from 'node:fs/promises';
await writeFile('response.mp3', tts.audioBuffer);

// Speech-to-text
const stt = await voice.speechToText(audioBuffer, {
  language: 'en',    // ISO-639-1 — improves accuracy
  format: 'mp3',
});

console.log(stt.text);        // transcribed text
console.log(stt.language);    // detected language
console.log(stt.durationMs);  // audio duration
```

---

## OpenAI Voice Provider

```ts
import { OpenAIVoiceProvider } from 'confused-ai/voice';

const voice = new OpenAIVoiceProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  ttsModel: 'tts-1',        // 'tts-1' (fast) | 'tts-1-hd' (quality)
  sttModel: 'whisper-1',
});

const tts = await voice.textToSpeech('How can I help you today?', {
  voice: 'nova',
  format: 'opus',
});
```

### Available voices

| Voice | Character |
|-------|-----------|
| `alloy` | Neutral, versatile |
| `echo` | Male, professional |
| `fable` | British, storytelling |
| `onyx` | Deep, authoritative |
| `nova` | Female, warm |
| `shimmer` | Female, gentle |

---

## ElevenLabs Voice Provider

For premium voices, voice cloning, and multi-language support:

```bash
bun add elevenlabs
```

```ts
import { ElevenLabsVoiceProvider } from 'confused-ai/voice';

const voice = new ElevenLabsVoiceProvider({
  apiKey: process.env.ELEVENLABS_API_KEY!,
  voiceId: 'EXAVITQu4vr4xnSDxMaL',  // Rachel (default)
  model: 'eleven_multilingual_v2',
});

const tts = await voice.textToSpeech('Welcome to our platform.', {
  stability: 0.5,           // 0–1, higher = more stable
  similarityBoost: 0.75,    // 0–1, higher = closer to original voice
});
```

---

## `createVoiceProvider()` factory

Auto-selects the provider from environment variables:

```ts
import { createVoiceProvider } from 'confused-ai/voice';

// Uses OPENAI_API_KEY  → OpenAIVoiceProvider
// Uses ELEVENLABS_API_KEY → ElevenLabsVoiceProvider (if no OpenAI key)
const voice = createVoiceProvider();

// Or explicitly configure:
const voice = createVoiceProvider({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  ttsModel: 'tts-1-hd',
});
```

---

## Wire voice into an agent pipeline

```ts
import { agent } from 'confused-ai';
import { createVoiceProvider } from 'confused-ai/voice';
import { createStorage } from 'confused-ai/storage';

const voice = createVoiceProvider();
const storage = createStorage();

const assistant = agent({
  model: 'gpt-4o',
  instructions: 'You are a helpful voice assistant. Keep responses short and conversational.',
});

async function handleVoiceRequest(audioInput: Buffer) {
  // 1. Transcribe speech to text
  const { text: userText } = await voice.speechToText(audioInput, { language: 'en' });

  // 2. Run agent
  const { text: agentText } = await assistant.run(userText);

  // 3. Convert response to speech
  const { audioBuffer } = await voice.textToSpeech(agentText, { voice: 'nova' });

  return audioBuffer;
}
```

---

## Streaming TTS

For real-time audio output as the agent generates text:

```ts
import { agent } from 'confused-ai';
import { OpenAIVoiceProvider } from 'confused-ai/voice';

const voice = new OpenAIVoiceProvider({ apiKey: process.env.OPENAI_API_KEY! });
const ai = agent({ model: 'gpt-4o', instructions: '...' });

const chunks: string[] = [];

await ai.run('Tell me a short story.', {
  onChunk: (text) => {
    chunks.push(text);
    // Buffer until you have a sentence, then TTS it
    if (text.endsWith('.') || text.endsWith('!') || text.endsWith('?')) {
      voice.textToSpeech(chunks.join('')).then((r) => playAudio(r.audioBuffer));
      chunks.length = 0;
    }
  },
});
```

---

## Implement `VoiceProvider`

Bring any TTS/STT provider:

```ts
import type { VoiceProvider, TTSResult, STTResult, VoiceConfig } from 'confused-ai/voice';

class MyVoiceProvider implements VoiceProvider {
  async textToSpeech(text: string, config?: VoiceConfig): Promise<TTSResult> {
    // call your TTS API
    return { audioBuffer: Buffer.from([]), mimeType: 'audio/mpeg', durationMs: 0 };
  }

  async speechToText(audio: Buffer, config?: VoiceConfig): Promise<STTResult> {
    // call your STT API
    return { text: '', language: 'en', durationMs: 0 };
  }
}
```

---

## Exports

| Export | Description |
|--------|-------------|
| `createVoiceProvider(config?)` | Factory — auto-selects provider from env |
| `OpenAIVoiceProvider` | OpenAI TTS-1 / Whisper |
| `ElevenLabsVoiceProvider` | ElevenLabs premium voices |
| `VoiceProvider` | Interface — implement to bring any provider |
| `VoiceConfig` | Configuration type |
| `TTSResult` | TTS result shape |
| `STTResult` | STT result shape |
| `OpenAIVoice` | Union of OpenAI voice names |
