/**
 * VoiceStreamSession
 * ==================
 * Real-time voice streaming: push audio chunks → receive transcription deltas
 * and TTS audio chunks back in an async generator pipeline.
 *
 * Architecture:
 *   STT streaming  — fed via `pushChunk(audioChunk)`, accumulates until silence
 *   Agent call     — transcribed text routed through the user-supplied `run` fn
 *   TTS streaming  — agent response text streamed back as MP3 audio chunks
 *
 * Usage:
 *   const session = new VoiceStreamSession({
 *     stt: openaiProvider,
 *     tts: openaiProvider,
 *     run: async (text) => agent.run({ prompt: text }),
 *     silenceThresholdMs: 800,
 *   });
 *
 *   // Push microphone audio in real time
 *   session.pushChunk(pcmBuffer);
 *
 *   // Consume events
 *   for await (const event of session.events()) {
 *     if (event.type === 'transcript') console.log('User:', event.text);
 *     if (event.type === 'audio')      player.write(event.chunk);
 *     if (event.type === 'text_delta') process.stdout.write(event.delta);
 *   }
 *
 *   await session.end();
 */

import type { VoiceProvider } from './voice-provider.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface VoiceStreamConfig {
    /** Provider used for Speech-to-Text */
    stt: VoiceProvider;
    /** Provider used for Text-to-Speech */
    tts: VoiceProvider;
    /**
     * Agent or LLM callable — receives the transcribed user text,
     * returns the agent's reply.
     */
    run: (text: string) => Promise<string>;
    /** Voice ID for TTS. Default: 'alloy' */
    voiceId?: string;
    /**
     * Milliseconds of silence after which a pushed audio buffer is considered
     * a complete utterance and triggers STT + agent. Default: 800.
     */
    silenceThresholdMs?: number;
    /** Optional user-defined session ID */
    sessionId?: string;
}

export type VoiceStreamEventType =
    | 'transcript'    // STT produced user text
    | 'agent_start'   // agent processing began
    | 'text_delta'    // agent streaming text delta
    | 'audio'         // TTS audio chunk
    | 'agent_end'     // agent processing finished
    | 'error';        // session-level error

export interface VoiceStreamEvent {
    type: VoiceStreamEventType;
    /** For 'transcript' — transcribed user speech */
    text?: string;
    /** For 'text_delta' — one token / phrase from the agent's response */
    delta?: string;
    /** For 'audio' — raw audio bytes (MP3) */
    chunk?: Uint8Array;
    /** For 'error' */
    error?: string;
    /** Wall-clock timestamp (ms since epoch) */
    ts: number;
}

// ── VoiceStreamSession ────────────────────────────────────────────────────────

export class VoiceStreamSession {
    private readonly _config: Required<VoiceStreamConfig>;
    /** Internal audio accumulation buffer */
    private readonly _audioChunks: Uint8Array[] = [];
    /** Event queue pushed by `_processUtterance`, consumed by `events()` */
    private readonly _queue: VoiceStreamEvent[] = [];
    /** Resolve fn for the drain waiter */
    private _drain?: () => void;
    /** Whether the session has been ended */
    private _ended = false;
    /** Silence timer handle */
    private _silenceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(config: VoiceStreamConfig) {
        this._config = {
            stt:                 config.stt,
            tts:                 config.tts,
            run:                 config.run,
            voiceId:             config.voiceId             ?? 'alloy',
            silenceThresholdMs:  config.silenceThresholdMs  ?? 800,
            sessionId:           config.sessionId           ?? `voice-${Date.now()}`,
        };
    }

    /**
     * Push a raw audio chunk (PCM/MP3/WAV bytes) from the microphone.
     * After `silenceThresholdMs` with no new chunk, the accumulated buffer is
     * sent to STT, then the transcript drives the agent, then TTS plays back.
     */
    pushChunk(chunk: ArrayBuffer | Uint8Array): void {
        if (this._ended) return;
        this._audioChunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));

        // Reset the silence timer on every new chunk
        if (this._silenceTimer !== undefined) clearTimeout(this._silenceTimer);
        this._silenceTimer = setTimeout(() => {
            void this._processUtterance();
        }, this._config.silenceThresholdMs);
    }

    /**
     * Async generator that yields `VoiceStreamEvent`s as they arrive.
     * Completes once `end()` is called and the queue is drained.
     */
    async *events(): AsyncGenerator<VoiceStreamEvent, void, unknown> {
        while (true) {
            if (this._queue.length > 0) {
                yield this._queue.shift()!;
            } else if (this._ended) {
                break;
            } else {
                // Wait for the next item to arrive
                await new Promise<void>((resolve) => { this._drain = resolve; });
            }
        }
        // Flush any remaining events enqueued during the final turn
        while (this._queue.length > 0) {
            yield this._queue.shift()!;
        }
    }

    /**
     * Signal end-of-session. Any pending audio is processed before the generator
     * completes.
     */
    async end(): Promise<void> {
        if (this._silenceTimer !== undefined) {
            clearTimeout(this._silenceTimer);
            this._silenceTimer = undefined;
        }
        // Process any remaining buffered audio
        if (this._audioChunks.length > 0) {
            await this._processUtterance();
        }
        this._ended = true;
        this._drain?.();
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /** Merge buffered chunks, call STT, run agent, call TTS, emit events. */
    private async _processUtterance(): Promise<void> {
        if (this._audioChunks.length === 0) return;

        // Drain and merge audio buffer
        const merged = this._mergeChunks();
        this._audioChunks.length = 0;

        // ── STT ───────────────────────────────────────────────────────────────
        let transcript: string;
        try {
            const sttResult = await this._config.stt.speechToText?.(merged.buffer as ArrayBuffer);
            transcript = sttResult?.text?.trim() ?? '';
        } catch (err) {
            this._emit({ type: 'error', error: `STT failed: ${String(err)}`, ts: Date.now() });
            return;
        }

        if (!transcript) return;   // Silence / no speech detected
        this._emit({ type: 'transcript', text: transcript, ts: Date.now() });

        // ── Agent ──────────────────────────────────────────────────────────────
        this._emit({ type: 'agent_start', ts: Date.now() });
        let reply: string;
        try {
            reply = await this._config.run(transcript);
        } catch (err) {
            this._emit({ type: 'error', error: `Agent failed: ${String(err)}`, ts: Date.now() });
            return;
        }

        // Emit reply as text deltas (word-by-word for streaming feel)
        const words = reply.split(' ');
        for (let i = 0; i < words.length; i++) {
            const delta = (i === 0 ? '' : ' ') + (words[i] ?? '');
            this._emit({ type: 'text_delta', delta, ts: Date.now() });
        }
        this._emit({ type: 'agent_end', ts: Date.now() });

        // ── TTS ────────────────────────────────────────────────────────────────
        try {
            const ttsResult = await this._config.tts.textToSpeech(reply, {
                voiceId: this._config.voiceId,
            });
            // Emit audio in 4KB chunks so the caller can stream to the speaker
            const audioBytes = new Uint8Array(ttsResult.audio);
            const CHUNK_SIZE = 4096;
            for (let offset = 0; offset < audioBytes.byteLength; offset += CHUNK_SIZE) {
                this._emit({
                    type:  'audio',
                    chunk: audioBytes.subarray(offset, offset + CHUNK_SIZE),
                    ts:    Date.now(),
                });
            }
        } catch (err) {
            this._emit({ type: 'error', error: `TTS failed: ${String(err)}`, ts: Date.now() });
        }
    }

    /** Merge all buffered `Uint8Array` chunks into one contiguous buffer. */
    private _mergeChunks(): Uint8Array {
        const totalLen = this._audioChunks.reduce((s, c) => s + c.byteLength, 0);
        const out = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of this._audioChunks) {
            out.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return out;
    }

    /** Push an event into the queue and wake the `events()` consumer. */
    private _emit(event: VoiceStreamEvent): void {
        this._queue.push(event);
        const drain = this._drain;
        this._drain = undefined;
        drain?.();
    }
}
