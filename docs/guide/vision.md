# Vision & Multimodal

Confused-AI agents can process images, audio, and files alongside text. Pass a `multiModal` option to `agent.run()` (or `createAgent.run()`) and the framework converts your inputs into the correct provider-specific content parts before the LLM call.

Supported input types: URL strings, local file paths (Node.js), raw `ArrayBuffer` / `Uint8Array`, and pre-built `ContentPart` arrays.

---

## Quick start — image URL

```ts
import { agent, imageUrl } from 'confused-ai';

const ai = agent({ model: 'gpt-4o', instructions: 'You are an image analyst.' });

const result = await ai.run('What is in this image?', {
  multiModal: {
    text:   'What is in this image?',
    images: [imageUrl('https://upload.wikimedia.org/wikipedia/en/a/a9/Example.jpg')],
  },
});

console.log(result.text);
```

---

## Image sources

### URL

```ts
import { imageUrl } from 'confused-ai';

// Simple URL
const img = imageUrl('https://example.com/photo.png');

// With detail control — 'auto' (default), 'low' (cheaper), 'high' (better quality)
const detailed = imageUrl('https://example.com/chart.png', 'high');
```

### Local file (Node.js)

```ts
import { imageFile } from 'confused-ai';

// Auto-detects MIME type from extension
const img = imageFile('./screenshots/dashboard.png');

// Override MIME type
const img2 = imageFile('./export.bin', 'image/png');
```

### Raw buffer

```ts
import { imageBuffer } from 'confused-ai';

const bytes = await fs.readFile('./photo.jpg');
const img = imageBuffer(bytes, 'image/jpeg');

// Or from a fetch response:
const resp = await fetch('https://example.com/img.webp');
const buf  = await resp.arrayBuffer();
const img2 = imageBuffer(buf, 'image/webp');
```

---

## Multiple images in one message

```ts
const result = await ai.run('Compare these two charts and identify the trend.', {
  multiModal: {
    text: 'Compare these two charts and identify the trend.',
    images: [
      imageUrl('https://cdn.example.com/chart-q1.png', 'high'),
      imageUrl('https://cdn.example.com/chart-q2.png', 'high'),
    ],
  },
});
```

---

## Audio input

Pass audio files for speech-to-text or audio-aware models (e.g., GPT-4o Audio):

```ts
import { audioFile, audioBuffer } from 'confused-ai';

const result = await ai.run('Transcribe this recording.', {
  multiModal: {
    text:  'Transcribe this recording.',
    audio: [audioFile('./meeting.mp3')],
  },
});
```

---

## `MultiModalInput` shape

```ts
interface MultiModalInput {
  text?:   string;                // text part of the message
  images?: ImageSource[];         // ImageUrl | ImageFile | ImageBuffer
  audio?:  AudioSource[];         // AudioFile | AudioBuffer
  files?:  FileSource[];          // generic file attachments
}
```

The `AgentRunOptions.multiModal` field accepts this shape. The framework calls `multiModalToMessage()` internally to convert it into a provider-specific message before the LLM call.

---

## Choosing the right model

Not all models support vision. Use the LLM router to automatically select a vision-capable model when multimodal input is detected:

```ts
import { agent, createSmartRouter } from 'confused-ai';
import { OpenAIProvider, AnthropicProvider } from 'confused-ai';

const router = createSmartRouter([
  { provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }),
    model: 'gpt-4o',
    capabilities: ['vision', 'coding', 'multimodal'],
    costTier: 'medium', speedTier: 'medium' },
  { provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
    model: 'claude-opus-4-5',
    capabilities: ['vision', 'reasoning'],
    costTier: 'frontier', speedTier: 'slow' },
]);

const ai = agent({ llmProvider: router, instructions: 'You are a visual analyst.' });
```

For the task type `'multimodal'`, the router scores vision-capable models higher.

---

## Utility functions reference

| Function | Import | Description |
|----------|--------|-------------|
| `imageUrl(url, detail?)` | `confused-ai` | Create an `ImageUrl` source |
| `imageFile(path, mimeType?)` | `confused-ai` | Create an `ImageFile` source (Node.js) |
| `imageBuffer(data, mimeType, detail?)` | `confused-ai` | Create an `ImageBuffer` source |
| `audioFile(path, mimeType?)` | `confused-ai` | Create an `AudioSource` from a file |
| `audioBuffer(data, mimeType)` | `confused-ai` | Create an `AudioSource` from a buffer |
| `multiModalToMessage(input)` | `confused-ai` | Convert `MultiModalInput` to a `Message` |
| `isMultiModalInput(value)` | `confused-ai` | Type guard — checks if a value is `MultiModalInput` |

---

## `ImageSource` types

```ts
interface ImageUrl {
  type:    'url';
  url:     string;
  detail?: 'auto' | 'low' | 'high';
}

interface ImageFile {
  type:      'file';
  path:      string;
  mimeType?: string;
  detail?:   'auto' | 'low' | 'high';
}

interface ImageBuffer {
  type:     'buffer';
  data:     ArrayBuffer | Uint8Array;
  mimeType: string;
  detail?:  'auto' | 'low' | 'high';
}
```

---

## Supported MIME types

Auto-detected from file extension:

| Category | Extensions |
|----------|-----------|
| Images | jpg/jpeg, png, gif, webp, bmp, svg, tiff/tif, heic/heif |
| Audio | mp3, wav, ogg, m4a, flac, webm |
| Video | mp4, webm, mov, avi, mkv |

Unknown extensions fall back to `application/octet-stream`.

---

## Related

- [LLM Router](./llm-router.md) — automatically route to vision-capable models
- [Tools](./tools.md) — built-in browser and HTTP tools for fetching images
- [Voice](./voice.md) — text-to-speech and speech-to-text
