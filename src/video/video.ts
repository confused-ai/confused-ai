import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

type OpenAiClient = {
  chat: {
    completions: {
      create(input: unknown): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
  audio: {
    speech: {
      create(input: unknown): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
    };
  };
};

type PexelsVideo = {
  video_files: Array<{ quality?: string; link: string }>;
};

type PexelsHandle = {
  videos: {
    search(options: { query: string; per_page: number; orientation: 'portrait' }): Promise<{ videos?: PexelsVideo[] }>;
  };
};

type FfmpegCommand = {
  input(inputPath: string): FfmpegCommand;
  inputOptions(options: string[]): FfmpegCommand;
  outputOptions(options: string[]): FfmpegCommand;
  save(outputPath: string): FfmpegCommand;
  on(event: 'end', callback: () => void): FfmpegCommand;
  on(event: 'error', callback: (err: Error) => void): FfmpegCommand;
};

type FfmpegFactory = (() => FfmpegCommand) & {
  setFfmpegPath?: (ffmpegPath: string) => void;
};

let openaiClient: OpenAiClient | null = null;
let pexelsClient: PexelsHandle | null = null;
let ffmpegFactory: FfmpegFactory | null = null;

async function getOpenai(): Promise<OpenAiClient> {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error(
                'Video features need OPENAI_API_KEY. Set it in the environment before using VideoOrchestrator.',
            );
        }
        const mod = await import('openai').catch(() => {
          throw new Error('Video features need optional peer dependency "openai". Install it before using VideoOrchestrator.');
        });
        openaiClient = new mod.default({ apiKey }) as OpenAiClient;
    }
    return openaiClient;
}

/** Get your Pexels API Key at https://www.pexels.com/api/ */
async function getPexels(): Promise<PexelsHandle> {
    if (!pexelsClient) {
        const key = process.env.PEXELS_API_KEY;
        if (!key) {
            throw new Error(
                'Video features need PEXELS_API_KEY. Set it in the environment before fetching background footage.',
            );
        }
        const mod = await import('pexels').catch(() => {
          throw new Error('Video features need optional peer dependency "pexels". Install it before fetching background footage.');
        });
        pexelsClient = mod.createClient(key) as PexelsHandle;
    }
    return pexelsClient;
}

async function getFfmpeg(): Promise<FfmpegFactory> {
  if (ffmpegFactory) return ffmpegFactory;

  // @ts-ignore -- fluent-ffmpeg is an optional peer dependency (no bundled types)
  const mod = await import('fluent-ffmpeg').catch(() => {
    throw new Error('Video features need optional peer dependency "fluent-ffmpeg". Install it before rendering video.');
  });
  ffmpegFactory = mod.default as unknown as FfmpegFactory;

  const installer = await import('@ffmpeg-installer/ffmpeg').catch(() => null);
  const installerPath = installer?.default?.path ?? installer?.path;
  if (installerPath) ffmpegFactory.setFfmpegPath?.(installerPath);

  return ffmpegFactory;
}

interface VideoGenerationResult {
  success: boolean;
  videoPath?: string;
  error?: string;
}

export class VideoOrchestrator {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp_videos');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Main function to generate a complete YouTube Short.
   * @param topic The topic or theme of the video.
   * @returns Final MP4 path
   */
  public async generateShort(topic: string): Promise<VideoGenerationResult> {
    const jobId = crypto.randomUUID();
    const workDir = path.join(this.tempDir, jobId);
    fs.mkdirSync(workDir, { recursive: true });

    try {
      console.log(`[Job ${jobId}] Starting generation for block: ${topic}`);

      // 1. Generate Script
      console.log(`[Job ${jobId}] Generating script...`);
      const script = await this.generateScript(topic);

      // 2. Generate Voiceover TTS
      console.log(`[Job ${jobId}] Generating Voiceover...`);
      const audioPath = path.join(workDir, 'voiceover.mp3');
      await this.generateVoiceover(script, audioPath);

      // 3. Fetch Background Video
      console.log(`[Job ${jobId}] Fetching background footage...`);
      const videoClips = await this.fetchBackgroundVideos(topic, 1);
      if (!videoClips || videoClips.length === 0) {
        throw new Error('Could not find any background videos for the topic.');
      }
      const downloadedVideoPath = path.join(workDir, 'background.mp4');
      await this.downloadFile(videoClips[0], downloadedVideoPath);

      // 4. Stitch everything together
      console.log(`[Job ${jobId}] Stitching video...`);
      const finalOutputPath = path.join(this.tempDir, `final_${jobId}.mp4`);
      await this.stitchVideo(downloadedVideoPath, audioPath, finalOutputPath);

      console.log(`[Job ${jobId}] Finished! File located at: ${finalOutputPath}`);

      // Cleanup
      fs.rmSync(workDir, { recursive: true, force: true });

      return {
        success: true,
        videoPath: finalOutputPath,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Job ${jobId}] Failed to generate video:`, message);
      return {
        success: false,
        error: message,
      };
    }
  }

  private async generateScript(topic: string): Promise<string> {
    const openai = await getOpenai();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert YouTube Shorts scriptwriter. Write a 30-45 second engaging, fast-paced script about the user\'s topic. Return ONLY the spoken text, no stage directions, no intro/outro labels. Make it catchy.',
        },
        {
          role: 'user',
          content: `Write a short script about: ${topic}`,
        },
      ],
    });
    return response.choices[0].message.content || 'Content generation failed.';
  }

  private async generateVoiceover(text: string, outputPath: string): Promise<void> {
    const openai = await getOpenai();
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(outputPath, buffer);
  }

  private async fetchBackgroundVideos(query: string, count: number): Promise<string[]> {
    // We search for orientation=portrait to match youtube shorts standard
    const pexels = await getPexels();
    const response = await pexels.videos.search({ query, per_page: count, orientation: 'portrait' });
    
    if (response.videos) {
      return response.videos.map(v => {
        // Find the best SD/HD vertical quality
        const videoFile = v.video_files.find(vf => vf.quality === 'hd') || v.video_files[0];
        return videoFile.link;
      });
    }
    return [];
  }

  private async downloadFile(url: string, outputPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file from ${url}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(outputPath, buffer);
  }

  private async stitchVideo(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
    const ffmpeg = await getFfmpeg();
    return new Promise((resolve, reject) => {
      // Basic FFmpeg command to loop the background video to the length of the audio track
      ffmpeg()
        .input(videoPath)
        .inputOptions(['-stream_loop -1']) // Loop the background video infinitely
        .input(audioPath)
        .outputOptions([
          '-c:v copy', // Copy video codec (faster, though re-encoding might be needed for some filters)
          '-c:a aac', // Convert audio to AAC
          '-map 0:v:0', // Take video stream from first input
          '-map 1:a:0', // Take audio stream from second input
          '-shortest', // Stop encoding when the shortest stream (the audio) ends
        ])
        .save(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)));
    });
  }
}
