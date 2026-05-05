/**
 * YouTube tools — search videos and get video details via YouTube Data API v3.
 * API key: https://console.cloud.google.com (enable YouTube Data API v3)
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface YouTubeToolConfig {
    /** YouTube Data API v3 key (or YOUTUBE_API_KEY env var) */
    apiKey?: string;
}

function getKey(config: YouTubeToolConfig): string {
    const key = config.apiKey ?? process.env['YOUTUBE_API_KEY'];
    if (!key) throw new Error('YouTubeTools require YOUTUBE_API_KEY');
    return key;
}

async function ytFetch(apiKey: string, path: string, params: Record<string, string>): Promise<unknown> {
    const p = new URLSearchParams({ ...params, key: apiKey });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${p}`);
    if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchSchema = z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().int().min(1).max(50).optional().default(10).describe('Number of results (max 50)'),
    order: z.enum(['relevance', 'date', 'rating', 'viewCount', 'title']).optional().default('relevance'),
    videoDuration: z.enum(['any', 'short', 'medium', 'long']).optional().default('any')
        .describe('short=<4min, medium=4-20min, long=>20min'),
    channelId: z.string().optional().describe('Filter by channel ID'),
});

const GetVideoSchema = z.object({
    videoId: z.string().describe('YouTube video ID or full URL'),
});

interface VideoItem {
    id: string;
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    url: string;
    thumbnailUrl?: string;
    duration?: string;
    viewCount?: string;
    likeCount?: string;
}

// ── Tools ──────────────────────────────────────────────────────────────────

export class YouTubeSearchTool extends BaseTool<typeof SearchSchema, { videos: VideoItem[]; totalResults: number }> {
    constructor(private config: YouTubeToolConfig = {}) {
        super({
            id: 'youtube_search',
            name: 'YouTube Search',
            description: 'Search YouTube videos. Returns titles, descriptions, channel info, and video URLs.',
            category: ToolCategory.API,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const params: Record<string, string> = {
            part: 'snippet',
            q: input.query,
            type: 'video',
            maxResults: String(input.maxResults ?? 10),
            order: input.order ?? 'relevance',
            videoDuration: input.videoDuration ?? 'any',
        };
        if (input.channelId) params['channelId'] = input.channelId;

        const data = await ytFetch(getKey(this.config), 'search', params) as {
            pageInfo: { totalResults: number };
            items: Array<{
                id: { videoId: string };
                snippet: { title: string; description: string; channelTitle: string; publishedAt: string; thumbnails?: { medium?: { url: string } } };
            }>;
        };

        const videos: VideoItem[] = (data.items ?? []).map((item) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            channelTitle: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            ...(item.snippet.thumbnails?.medium?.url !== undefined && { thumbnailUrl: item.snippet.thumbnails.medium.url }),
        }));

        return { videos, totalResults: data.pageInfo?.totalResults ?? videos.length };
    }
}

export class YouTubeGetVideoTool extends BaseTool<typeof GetVideoSchema, VideoItem | null> {
    constructor(private config: YouTubeToolConfig = {}) {
        super({
            id: 'youtube_get_video',
            name: 'YouTube Get Video',
            description: 'Get detailed information about a specific YouTube video including view count and duration.',
            category: ToolCategory.API,
            parameters: GetVideoSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetVideoSchema>, _ctx: ToolContext) {
        const idMatch = input.videoId.match(/(?:v=|youtu\.be\/)([^&\s]+)/);
        const videoId = idMatch?.[1] ?? input.videoId;

        const data = await ytFetch(getKey(this.config), 'videos', {
            part: 'snippet,contentDetails,statistics',
            id: videoId,
        }) as {
            items: Array<{
                id: string;
                snippet: { title: string; description: string; channelTitle: string; publishedAt: string; thumbnails?: { medium?: { url: string } } };
                contentDetails: { duration: string };
                statistics: { viewCount?: string; likeCount?: string };
            }>;
        };

        const item = data.items?.[0];
        if (!item) return null;

        return {
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description,
            channelTitle: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
            url: `https://www.youtube.com/watch?v=${item.id}`,
            ...(item.snippet.thumbnails?.medium?.url !== undefined && { thumbnailUrl: item.snippet.thumbnails.medium.url }),
            ...(item.contentDetails?.duration !== undefined && { duration: item.contentDetails.duration }),
            ...(item.statistics?.viewCount !== undefined && { viewCount: item.statistics.viewCount }),
            ...(item.statistics?.likeCount !== undefined && { likeCount: item.statistics.likeCount }),
        };
    }
}

export class YouTubeToolkit {
    readonly tools: BaseTool[];
    constructor(config: YouTubeToolConfig = {}) {
        this.tools = [new YouTubeSearchTool(config), new YouTubeGetVideoTool(config)];
    }
}
