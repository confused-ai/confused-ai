/**
 * Twitter/X tools — read and post tweets via X (Twitter) API v2.
 * API docs: https://developer.twitter.com/en/docs/twitter-api
 * Bearer token for read-only, OAuth 1.0a/2.0 for posting.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface TwitterToolConfig {
    /** Bearer token for read access (or X_BEARER_TOKEN env var) */
    bearerToken?: string;
    /** OAuth2 user access token for write access (or X_ACCESS_TOKEN env var) */
    accessToken?: string;
}

function getBearerToken(config: TwitterToolConfig): string {
    const token = config.bearerToken ?? process.env['X_BEARER_TOKEN'];
    if (!token) throw new Error('TwitterTools require X_BEARER_TOKEN');
    return token;
}

function getAccessToken(config: TwitterToolConfig): string {
    const token = config.accessToken ?? process.env['X_ACCESS_TOKEN'];
    if (!token) throw new Error('TwitterTools require X_ACCESS_TOKEN for write operations');
    return token;
}

async function twitterRequest(token: string, method: string, path: string, body?: object, tokenType: 'bearer' | 'oauth' = 'bearer'): Promise<unknown> {
    const res = await fetch(`https://api.twitter.com/2${path}`, {
        method,
        headers: {
            Authorization: tokenType === 'bearer' ? `Bearer ${token}` : `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`Twitter/X API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchTweetsSchema = z.object({
    query: z.string().describe('Twitter search query (supports operators: from:, to:, #hashtag, lang:, etc.)'),
    maxResults: z.number().int().min(10).max(100).optional().default(10).describe('Max results (10-100)'),
    startTime: z.string().optional().describe('Start time (ISO 8601, e.g. 2024-01-01T00:00:00Z)'),
    endTime: z.string().optional().describe('End time (ISO 8601)'),
    tweetFields: z.string().optional().default('created_at,author_id,public_metrics,lang')
        .describe('Comma-separated tweet fields to include'),
});

const GetTweetSchema = z.object({
    tweetId: z.string().describe('Twitter tweet ID'),
    tweetFields: z.string().optional().default('created_at,author_id,public_metrics,lang,text')
        .describe('Comma-separated tweet fields to include'),
});

const PostTweetSchema = z.object({
    text: z.string().min(1).max(280).describe('Tweet text (max 280 characters)'),
    replyToTweetId: z.string().optional().describe('Tweet ID to reply to'),
    quoteTweetId: z.string().optional().describe('Tweet ID to quote'),
    poll: z.object({
        options: z.array(z.string()).min(2).max(4).describe('Poll option labels'),
        durationMinutes: z.number().int().min(5).max(10080).describe('Poll duration in minutes'),
    }).optional().describe('Add a poll to the tweet'),
});

const GetUserSchema = z.object({
    username: z.string().describe('Twitter username (without @)'),
    userFields: z.string().optional().default('created_at,description,public_metrics,verified')
        .describe('Comma-separated user fields'),
});

const GetUserTimelineSchema = z.object({
    userId: z.string().describe('Twitter user ID'),
    maxResults: z.number().int().min(5).max(100).optional().default(10).describe('Max results'),
    tweetFields: z.string().optional().default('created_at,public_metrics').describe('Tweet fields'),
    excludeReplies: z.boolean().optional().default(false).describe('Exclude replies'),
    excludeRetweets: z.boolean().optional().default(false).describe('Exclude retweets'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class TwitterSearchTweetsTool extends BaseTool<typeof SearchTweetsSchema> {
    constructor(private config: TwitterToolConfig = {}) {
        super({
            id: 'twitter_search_tweets',
            name: 'Twitter/X Search Tweets',
            description: 'Search recent tweets using Twitter/X API v2. Supports full query operators.',
            category: ToolCategory.WEB,
            parameters: SearchTweetsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchTweetsSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({
            query: input.query,
            max_results: String(input.maxResults ?? 10),
            'tweet.fields': input.tweetFields ?? 'created_at,author_id,public_metrics,lang',
        });
        if (input.startTime) params.set('start_time', input.startTime);
        if (input.endTime) params.set('end_time', input.endTime);
        return twitterRequest(getBearerToken(this.config), 'GET', `/tweets/search/recent?${params}`);
    }
}

export class TwitterGetTweetTool extends BaseTool<typeof GetTweetSchema> {
    constructor(private config: TwitterToolConfig = {}) {
        super({
            id: 'twitter_get_tweet',
            name: 'Twitter/X Get Tweet',
            description: 'Get a specific tweet by ID.',
            category: ToolCategory.WEB,
            parameters: GetTweetSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetTweetSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ 'tweet.fields': input.tweetFields ?? 'created_at,author_id,public_metrics,lang,text' });
        return twitterRequest(getBearerToken(this.config), 'GET', `/tweets/${input.tweetId}?${params}`);
    }
}

export class TwitterPostTweetTool extends BaseTool<typeof PostTweetSchema> {
    constructor(private config: TwitterToolConfig = {}) {
        super({
            id: 'twitter_post_tweet',
            name: 'Twitter/X Post Tweet',
            description: 'Post a tweet. Requires OAuth2 user access token (X_ACCESS_TOKEN).',
            category: ToolCategory.API,
            parameters: PostTweetSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof PostTweetSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = { text: input.text };
        if (input.replyToTweetId) body['reply'] = { in_reply_to_tweet_id: input.replyToTweetId };
        if (input.quoteTweetId) body['quote_tweet_id'] = input.quoteTweetId;
        if (input.poll) {
            body['poll'] = {
                options: input.poll.options.map(o => ({ label: o })),
                duration_minutes: input.poll.durationMinutes,
            };
        }
        return twitterRequest(getAccessToken(this.config), 'POST', '/tweets', body, 'oauth');
    }
}

export class TwitterGetUserTool extends BaseTool<typeof GetUserSchema> {
    constructor(private config: TwitterToolConfig = {}) {
        super({
            id: 'twitter_get_user',
            name: 'Twitter/X Get User',
            description: 'Get Twitter/X user profile information by username.',
            category: ToolCategory.WEB,
            parameters: GetUserSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetUserSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ 'user.fields': input.userFields ?? 'created_at,description,public_metrics,verified' });
        return twitterRequest(getBearerToken(this.config), 'GET', `/users/by/username/${input.username}?${params}`);
    }
}

export class TwitterGetUserTimelineTool extends BaseTool<typeof GetUserTimelineSchema> {
    constructor(private config: TwitterToolConfig = {}) {
        super({
            id: 'twitter_get_user_timeline',
            name: 'Twitter/X Get User Timeline',
            description: 'Get recent tweets from a specific user\'s timeline.',
            category: ToolCategory.WEB,
            parameters: GetUserTimelineSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetUserTimelineSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({
            max_results: String(input.maxResults ?? 10),
            'tweet.fields': input.tweetFields ?? 'created_at,public_metrics',
        });
        const exclude: string[] = [];
        if (input.excludeReplies) exclude.push('replies');
        if (input.excludeRetweets) exclude.push('retweets');
        if (exclude.length) params.set('exclude', exclude.join(','));
        return twitterRequest(getBearerToken(this.config), 'GET', `/users/${input.userId}/tweets?${params}`);
    }
}

export class TwitterToolkit {
    readonly searchTweets: TwitterSearchTweetsTool;
    readonly getTweet: TwitterGetTweetTool;
    readonly postTweet: TwitterPostTweetTool;
    readonly getUser: TwitterGetUserTool;
    readonly getUserTimeline: TwitterGetUserTimelineTool;

    constructor(config: TwitterToolConfig = {}) {
        this.searchTweets = new TwitterSearchTweetsTool(config);
        this.getTweet = new TwitterGetTweetTool(config);
        this.postTweet = new TwitterPostTweetTool(config);
        this.getUser = new TwitterGetUserTool(config);
        this.getUserTimeline = new TwitterGetUserTimelineTool(config);
    }

    getTools() {
        return [this.searchTweets, this.getTweet, this.postTweet, this.getUser, this.getUserTimeline];
    }
}
