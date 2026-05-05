/**
 * Reddit tools — search posts and get subreddit feeds.
 * Uses Reddit's public JSON API (no OAuth required for read-only).
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface RedditToolConfig {
    /** Optional Reddit app client ID for higher rate limits */
    clientId?: string;
    clientSecret?: string;
}

async function redditFetch(path: string, config: RedditToolConfig): Promise<unknown> {
    const headers: Record<string, string> = {
        'User-Agent': 'AgentFramework/1.0',
        Accept: 'application/json',
    };

    const clientId = config.clientId ?? process.env['REDDIT_CLIENT_ID'];
    const clientSecret = config.clientSecret ?? process.env['REDDIT_CLIENT_SECRET'];
    if (clientId && clientSecret) {
        const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
    }

    const baseUrl = clientId ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
    const res = await fetch(`${baseUrl}${path}.json`, { headers });
    if (!res.ok) throw new Error(`Reddit API ${res.status}: ${await res.text()}`);
    return res.json();
}

interface RedditPost {
    id: string;
    title: string;
    author: string;
    subreddit: string;
    score: number;
    numComments: number;
    url: string;
    selfText?: string;
    createdUtc: number;
    isVideo: boolean;
    flair?: string;
}

function mapPost(data: Record<string, unknown>): RedditPost {
    return {
        id: data['id'] as string,
        title: data['title'] as string,
        author: data['author'] as string,
        subreddit: data['subreddit'] as string,
        score: data['score'] as number,
        numComments: data['num_comments'] as number,
        url: data['url'] as string,
        createdUtc: data['created_utc'] as number,
        isVideo: data['is_video'] as boolean,
        ...(data['selftext'] !== undefined && data['selftext'] !== '' && { selfText: data['selftext'] as string }),
        ...(data['link_flair_text'] !== undefined && { flair: data['link_flair_text'] as string }),
    };
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchSchema = z.object({
    query: z.string().describe('Search query'),
    subreddit: z.string().optional().describe('Restrict search to this subreddit (without r/)'),
    sort: z.enum(['relevance', 'new', 'hot', 'top', 'comments']).optional().default('relevance'),
    timeFilter: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().default('all'),
    limit: z.number().int().min(1).max(100).optional().default(10),
});

const GetPostsSchema = z.object({
    subreddit: z.string().describe('Subreddit name (without r/)'),
    sort: z.enum(['hot', 'new', 'top', 'rising']).optional().default('hot'),
    limit: z.number().int().min(1).max(100).optional().default(10),
    timeFilter: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().default('day'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class RedditSearchTool extends BaseTool<typeof SearchSchema, { posts: RedditPost[]; count: number }> {
    constructor(private config: RedditToolConfig = {}) {
        super({
            id: 'reddit_search',
            name: 'Reddit Search',
            description: 'Search Reddit posts across all subreddits or within a specific subreddit.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const base = input.subreddit ? `/r/${input.subreddit}/search` : '/search';
        const params = new URLSearchParams({
            q: input.query,
            sort: input.sort ?? 'relevance',
            t: input.timeFilter ?? 'all',
            limit: String(input.limit ?? 10),
            restrict_sr: input.subreddit ? 'true' : 'false',
        });
        const data = await redditFetch(`${base}?${params}`, this.config) as {
            data: { children: Array<{ data: Record<string, unknown> }> };
        };
        const posts = data.data.children.map((c) => mapPost(c.data));
        return { posts, count: posts.length };
    }
}

export class RedditGetPostsTool extends BaseTool<typeof GetPostsSchema, { posts: RedditPost[]; subreddit: string }> {
    constructor(private config: RedditToolConfig = {}) {
        super({
            id: 'reddit_get_posts',
            name: 'Reddit Get Posts',
            description: 'Get posts from a subreddit feed (hot, new, top, rising).',
            category: ToolCategory.WEB,
            parameters: GetPostsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetPostsSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({
            limit: String(input.limit ?? 10),
            t: input.timeFilter ?? 'day',
        });
        const data = await redditFetch(`/r/${input.subreddit}/${input.sort ?? 'hot'}?${params}`, this.config) as {
            data: { children: Array<{ data: Record<string, unknown> }> };
        };
        const posts = data.data.children.map((c) => mapPost(c.data));
        return { posts, subreddit: input.subreddit };
    }
}

export class RedditToolkit {
    readonly tools: BaseTool[];
    constructor(config: RedditToolConfig = {}) {
        this.tools = [new RedditSearchTool(config), new RedditGetPostsTool(config)];
    }
}
