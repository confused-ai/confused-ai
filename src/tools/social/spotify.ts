/**
 * Spotify tools — search tracks, get playlists, control playback, manage library.
 * Requires OAuth2 access token with appropriate Spotify scopes.
 * Scopes needed: user-read-playback-state, user-modify-playback-state, user-library-read,
 *                playlist-read-private, playlist-modify-public, playlist-modify-private
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface SpotifyToolConfig {
    /** OAuth2 access token (or SPOTIFY_ACCESS_TOKEN env var) */
    accessToken?: string;
}

function getToken(config: SpotifyToolConfig): string {
    const token = config.accessToken ?? process.env.SPOTIFY_ACCESS_TOKEN;
    if (!token) throw new Error('SpotifyTools require SPOTIFY_ACCESS_TOKEN');
    return token;
}

async function spotifyFetch(token: string, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`Spotify API ${res.status}: ${await res.text()}`);
    return res.json();
}

interface SpotifyTrack {
    id: string;
    name: string;
    artists: string[];
    album: string;
    durationMs: number;
    uri: string;
    previewUrl?: string;
    explicit: boolean;
    popularity?: number;
}

function mapTrack(t: Record<string, unknown>): SpotifyTrack {
    const artists = (t.artists as Array<{ name: string }> ?? []).map((a) => a.name);
    const album = t.album as Record<string, unknown> | undefined;
    return {
        id: t.id as string,
        name: t.name as string,
        artists,
        album: album?.name as string ?? '',
        durationMs: t.duration_ms as number,
        uri: t.uri as string,
        previewUrl: t.preview_url as string | undefined,
        explicit: t.explicit as boolean,
        popularity: t.popularity as number | undefined,
    };
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchSchema = z.object({
    query: z.string().describe('Search query'),
    type: z.array(z.enum(['track', 'artist', 'album', 'playlist', 'show', 'episode'])).optional().default(['track']),
    limit: z.number().int().min(1).max(50).optional().default(10),
    market: z.string().optional().describe('ISO 3166-1 alpha-2 country code (e.g. "US")'),
});

const GetTrackSchema = z.object({
    trackId: z.string().describe('Spotify track ID'),
});

const GetPlaylistSchema = z.object({
    playlistId: z.string().describe('Spotify playlist ID'),
    limit: z.number().int().min(1).max(100).optional().default(20).describe('Max tracks to return'),
});

const GetCurrentPlaybackSchema = z.object({});

const PlaySchema = z.object({
    uris: z.array(z.string()).optional().describe('List of Spotify URIs to play (e.g. spotify:track:xxx)'),
    contextUri: z.string().optional().describe('Spotify URI of an album, artist, or playlist to play'),
    deviceId: z.string().optional().describe('Spotify device ID to control'),
    positionMs: z.number().int().optional().describe('Seek to this position in ms'),
});

const PauseSchema = z.object({
    deviceId: z.string().optional(),
});

const SkipSchema = z.object({
    direction: z.enum(['next', 'previous']).describe('Skip to next or previous track'),
    deviceId: z.string().optional(),
});

const GetUserPlaylistsSchema = z.object({
    limit: z.number().int().min(1).max(50).optional().default(20),
});

const AddToQueueSchema = z.object({
    uri: z.string().describe('Spotify URI of the track to add to queue'),
    deviceId: z.string().optional(),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class SpotifySearchTool extends BaseTool<typeof SearchSchema, { tracks?: SpotifyTrack[]; totalTracks?: number }> {
    constructor(private config: SpotifyToolConfig = {}) {
        super({
            id: 'spotify_search',
            name: 'Spotify Search',
            description: 'Search Spotify for tracks, artists, albums, or playlists.',
            category: ToolCategory.API,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({
            q: input.query,
            type: (input.type ?? ['track']).join(','),
            limit: String(input.limit ?? 10),
        });
        if (input.market) params.set('market', input.market);
        const data = await spotifyFetch(getToken(this.config), 'GET', `/search?${params}`) as {
            tracks?: { items: Array<Record<string, unknown>>; total: number };
        };
        return {
            tracks: data.tracks?.items.map(mapTrack),
            totalTracks: data.tracks?.total,
        };
    }
}

export class SpotifyGetTrackTool extends BaseTool<typeof GetTrackSchema, SpotifyTrack> {
    constructor(private config: SpotifyToolConfig = {}) {
        super({
            id: 'spotify_get_track',
            name: 'Spotify Get Track',
            description: 'Get detailed information about a specific Spotify track.',
            category: ToolCategory.API,
            parameters: GetTrackSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetTrackSchema>, _ctx: ToolContext) {
        const track = await spotifyFetch(getToken(this.config), 'GET', `/tracks/${input.trackId}`) as Record<string, unknown>;
        return mapTrack(track);
    }
}

export class SpotifyGetPlaylistTool extends BaseTool<typeof GetPlaylistSchema, {
    id: string; name: string; description?: string; tracks: SpotifyTrack[]; totalTracks: number; owner: string;
}> {
    constructor(private config: SpotifyToolConfig = {}) {
        super({
            id: 'spotify_get_playlist',
            name: 'Spotify Get Playlist',
            description: 'Retrieve a Spotify playlist and its tracks.',
            category: ToolCategory.API,
            parameters: GetPlaylistSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetPlaylistSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
        const data = await spotifyFetch(getToken(this.config), 'GET', `/playlists/${input.playlistId}?${params}`) as {
            id: string;
            name: string;
            description?: string;
            owner: { display_name: string };
            tracks: { items: Array<{ track: Record<string, unknown> }>; total: number };
        };
        return {
            id: data.id,
            name: data.name,
            description: data.description,
            owner: data.owner?.display_name,
            tracks: (data.tracks?.items ?? []).filter((i) => i.track).map((i) => mapTrack(i.track)),
            totalTracks: data.tracks?.total,
        };
    }
}

export class SpotifyGetCurrentPlaybackTool extends BaseTool<typeof GetCurrentPlaybackSchema, {
    isPlaying: boolean; track?: SpotifyTrack; deviceName?: string; progressMs?: number; shuffleState?: boolean;
} | null> {
    constructor(private config: SpotifyToolConfig = {}) {
        super({
            id: 'spotify_get_current_playback',
            name: 'Spotify Get Current Playback',
            description: 'Get the currently playing track and playback state.',
            category: ToolCategory.API,
            parameters: GetCurrentPlaybackSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(_input: z.infer<typeof GetCurrentPlaybackSchema>, _ctx: ToolContext) {
        const data = await spotifyFetch(getToken(this.config), 'GET', '/me/player') as Record<string, unknown> | null;
        if (!data) return null;
        const item = data.item as Record<string, unknown> | undefined;
        const device = data.device as Record<string, unknown> | undefined;
        return {
            isPlaying: data.is_playing as boolean,
            track: item ? mapTrack(item) : undefined,
            deviceName: device?.name as string | undefined,
            progressMs: data.progress_ms as number | undefined,
            shuffleState: data.shuffle_state as boolean | undefined,
        };
    }
}

export class SpotifyPlayTool extends BaseTool<typeof PlaySchema, { success: boolean }> {
    constructor(private config: SpotifyToolConfig = {}) {
        super({
            id: 'spotify_play',
            name: 'Spotify Play',
            description: 'Start or resume Spotify playback, optionally with specific tracks, album, or playlist.',
            category: ToolCategory.API,
            parameters: PlaySchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof PlaySchema>, _ctx: ToolContext) {
        const path = input.deviceId ? `/me/player/play?device_id=${input.deviceId}` : '/me/player/play';
        const body: Record<string, unknown> = {};
        if (input.uris?.length) body.uris = input.uris;
        if (input.contextUri) body.context_uri = input.contextUri;
        if (input.positionMs !== undefined) body.position_ms = input.positionMs;
        await spotifyFetch(getToken(this.config), 'PUT', path, body);
        return { success: true };
    }
}

export class SpotifyPauseTool extends BaseTool<typeof PauseSchema, { success: boolean }> {
    constructor(private config: SpotifyToolConfig = {}) {
        super({
            id: 'spotify_pause',
            name: 'Spotify Pause',
            description: 'Pause Spotify playback.',
            category: ToolCategory.API,
            parameters: PauseSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof PauseSchema>, _ctx: ToolContext) {
        const path = input.deviceId ? `/me/player/pause?device_id=${input.deviceId}` : '/me/player/pause';
        await spotifyFetch(getToken(this.config), 'PUT', path);
        return { success: true };
    }
}

export class SpotifySkipTool extends BaseTool<typeof SkipSchema, { success: boolean }> {
    constructor(private config: SpotifyToolConfig = {}) {
        super({
            id: 'spotify_skip',
            name: 'Spotify Skip',
            description: 'Skip to the next or previous track in Spotify.',
            category: ToolCategory.API,
            parameters: SkipSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SkipSchema>, _ctx: ToolContext) {
        const method = 'POST';
        const path = input.direction === 'next' ? '/me/player/next' : '/me/player/previous';
        const query = input.deviceId ? `?device_id=${input.deviceId}` : '';
        await spotifyFetch(getToken(this.config), method, `${path}${query}`);
        return { success: true };
    }
}

export class SpotifyGetUserPlaylistsTool extends BaseTool<typeof GetUserPlaylistsSchema, {
    playlists: Array<{ id: string; name: string; trackCount: number; owner: string; public?: boolean }>;
}> {
    constructor(private config: SpotifyToolConfig = {}) {
        super({
            id: 'spotify_get_user_playlists',
            name: 'Spotify Get User Playlists',
            description: 'Get the current user\'s Spotify playlists.',
            category: ToolCategory.API,
            parameters: GetUserPlaylistsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetUserPlaylistsSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
        const data = await spotifyFetch(getToken(this.config), 'GET', `/me/playlists?${params}`) as {
            items: Array<{
                id: string; name: string;
                tracks: { total: number };
                owner: { display_name: string };
                public?: boolean;
            }>;
        };
        return {
            playlists: (data.items ?? []).map((p) => ({
                id: p.id,
                name: p.name,
                trackCount: p.tracks?.total,
                owner: p.owner?.display_name,
                public: p.public,
            })),
        };
    }
}

export class SpotifyAddToQueueTool extends BaseTool<typeof AddToQueueSchema, { success: boolean }> {
    constructor(private config: SpotifyToolConfig = {}) {
        super({
            id: 'spotify_add_to_queue',
            name: 'Spotify Add To Queue',
            description: 'Add a track to the Spotify playback queue.',
            category: ToolCategory.API,
            parameters: AddToQueueSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof AddToQueueSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ uri: input.uri });
        if (input.deviceId) params.set('device_id', input.deviceId);
        await spotifyFetch(getToken(this.config), 'POST', `/me/player/queue?${params}`);
        return { success: true };
    }
}

export class SpotifyToolkit {
    readonly tools: BaseTool[];
    constructor(config: SpotifyToolConfig = {}) {
        this.tools = [
            new SpotifySearchTool(config),
            new SpotifyGetTrackTool(config),
            new SpotifyGetPlaylistTool(config),
            new SpotifyGetCurrentPlaybackTool(config),
            new SpotifyPlayTool(config),
            new SpotifyPauseTool(config),
            new SpotifySkipTool(config),
            new SpotifyGetUserPlaylistsTool(config),
            new SpotifyAddToQueueTool(config),
        ];
    }
}
