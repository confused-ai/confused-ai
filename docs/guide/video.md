# Video Generation

`VideoOrchestrator` generates YouTube Shorts — short-form MP4 videos — from a text topic. It uses OpenAI to script the voiceover, generates text-to-speech audio, fetches relevant background footage from Pexels, and assembles the final video with ffmpeg.

> **Peer dependencies:** `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `pexels`
> ```bash
> bun add fluent-ffmpeg @ffmpeg-installer/ffmpeg pexels
> ```

---

## Required environment variables

```bash
OPENAI_API_KEY=sk-...      # For TTS and script generation
PEXELS_API_KEY=...         # For background footage — https://www.pexels.com/api/
```

---

## Quick start

```ts
import { VideoOrchestrator } from 'confused-ai';

const orchestrator = new VideoOrchestrator();

const result = await orchestrator.generateShort('The history of TypeScript');

if (result.success && result.videoPath) {
  console.log('Video saved to:', result.videoPath);
  // e.g. './temp_videos/typescript-history-abc123.mp4'
} else {
  console.error('Generation failed:', result.error);
}
```

---

## What it does

```
topic
  │
  ├── 1. Script generation (OpenAI GPT-4o)
  │       ↓ short narration script (≤60 seconds)
  ├── 2. Text-to-speech (OpenAI TTS)
  │       ↓ audio.mp3
  ├── 3. Footage search (Pexels)
  │       ↓ background video clips matching the topic
  ├── 4. Video assembly (ffmpeg)
  │       ↓ clips trimmed, concatenated, audio overlaid
  └── 5. Output MP4 saved to ./temp_videos/
```

---

## `VideoGenerationResult`

```ts
interface VideoGenerationResult {
  success:    boolean;
  videoPath?: string;  // absolute path to the generated .mp4
  error?:     string;  // failure reason
}
```

---

## Working directory

The orchestrator creates a `temp_videos/` folder in `process.cwd()` and writes all intermediate files (audio, clips, final video) there. Clean it up after use:

```ts
import { rm } from 'node:fs/promises';

await orchestrator.generateShort('Climate change solutions');
// ... use the video ...
await rm('./temp_videos', { recursive: true, force: true });
```

---

## Use in an agent

Wire `VideoOrchestrator` as a custom tool so the agent can trigger video generation on demand:

```ts
import { agent, defineTool } from 'confused-ai';
import { VideoOrchestrator } from 'confused-ai';
import { z } from 'zod';

const orchestrator = new VideoOrchestrator();

const generateVideoTool = defineTool()
  .name('generateVideo')
  .description('Generate a YouTube Short video on a given topic')
  .parameters(z.object({ topic: z.string().describe('Video topic or title') }))
  .execute(async ({ topic }) => {
    const result = await orchestrator.generateShort(topic);
    if (!result.success) throw new Error(result.error ?? 'Video generation failed');
    return { videoPath: result.videoPath };
  })
  .build();

const videoAgent = agent({
  model: 'gpt-4o',
  instructions: `You are a YouTube Shorts creator. 
When asked to create a video, use the generateVideo tool.
Choose engaging, specific topics for best results.`,
  tools: [generateVideoTool],
});

const r = await videoAgent.run('Create a short video about the invention of the internet.');
console.log(r.text); // "I've created the video and saved it to..."
```

---

## Related

- [Voice](./voice.md) — text-to-speech and speech-to-text
- [Custom Tools](./custom-tools.md) — wrapping `VideoOrchestrator` as a tool
- [Artifacts](./artifacts.md) — storing the generated video path as a versioned artifact
