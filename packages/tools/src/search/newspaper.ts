/**
 * Newspaper4k / news article scraping tool — extract clean article content from URLs.
 * Uses a combination of Mercury Parser API or direct fetch + content extraction.
 * Also supports fetching articles by keyword via NewsAPI.
 * NewsAPI key: https://newsapi.org
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface NewspaperToolConfig {
    /** NewsAPI key (or NEWS_API_KEY env var) — for keyword searches */
    newsApiKey?: string;
}

const GetArticleSchema = z.object({
    url: z.string().url().describe('URL of the news article to extract'),
});

const SearchArticlesSchema = z.object({
    query: z.string().describe('Keywords to search for'),
    language: z.string().optional().default('en').describe('Language code (e.g. "en")'),
    sortBy: z.enum(['relevancy', 'popularity', 'publishedAt']).optional().default('publishedAt')
        .describe('Sort order'),
    pageSize: z.number().int().min(1).max(100).optional().default(10)
        .describe('Number of articles to return'),
    from: z.string().optional().describe('From date (ISO 8601, e.g. 2024-01-01)'),
    to: z.string().optional().describe('To date (ISO 8601)'),
    domains: z.string().optional().describe('Comma-separated list of domains to restrict to'),
    sources: z.string().optional().describe('Comma-separated list of news sources'),
});

const GetTopHeadlinesSchema = z.object({
    category: z.enum(['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology'])
        .optional().default('general').describe('News category'),
    country: z.string().optional().default('us').describe('Country code (e.g. "us")'),
    query: z.string().optional().describe('Optional keyword filter'),
    pageSize: z.number().int().min(1).max(100).optional().default(10).describe('Number of results'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class GetNewsArticleTool extends BaseTool<typeof GetArticleSchema, {
    url: string;
    title?: string;
    description?: string;
    content?: string;
    publishedAt?: string;
    source?: string;
}> {
    constructor() {
        super({
            id: 'get_news_article',
            name: 'Get News Article',
            description: 'Fetch and extract the main text content from a news article URL.',
            category: ToolCategory.WEB,
            parameters: GetArticleSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 20000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetArticleSchema>, _ctx: ToolContext) {
        const res = await fetch(input.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AgentFramework/1.0; +https://github.com/agent-framework)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
        });
        if (!res.ok) throw new Error(`Failed to fetch article ${res.status}`);
        const html = await res.text();

        // Extract basic metadata from meta tags
        const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
            ?? html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)
            ?? html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
        const publishedMatch = html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i)
            ?? html.match(/<time[^>]+datetime="([^"]+)"/i);
        const sourceMatch = html.match(/<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/i);

        // Extract article body text (strip HTML tags, get meaningful text)
        const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        const rawBody = articleMatch?.[1] ?? mainMatch?.[1] ?? html;
        const content = rawBody
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim()
            .slice(0, 5000);

        return {
            url: input.url,
            content,
            ...(titleMatch?.[1] !== undefined && { title: titleMatch[1] }),
            ...(descMatch?.[1] !== undefined && { description: descMatch[1] }),
            ...(publishedMatch?.[1] !== undefined && { publishedAt: publishedMatch[1] }),
            ...(sourceMatch?.[1] !== undefined && { source: sourceMatch[1] }),
        };
    }
}

export class SearchNewsTool extends BaseTool<typeof SearchArticlesSchema, {
    totalResults: number;
    articles: Array<{
        title: string;
        url: string;
        description?: string;
        publishedAt: string;
        source: string;
        author?: string;
    }>;
}> {
    constructor(private config: NewspaperToolConfig = {}) {
        super({
            id: 'search_news',
            name: 'Search News',
            description: 'Search news articles by keywords via NewsAPI. Returns titles, URLs, descriptions, and metadata.',
            category: ToolCategory.WEB,
            parameters: SearchArticlesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchArticlesSchema>, _ctx: ToolContext) {
        const key = this.config.newsApiKey ?? process.env['NEWS_API_KEY'];
        if (!key) throw new Error('SearchNewsTool requires NEWS_API_KEY');

        const params = new URLSearchParams({
            q: input.query,
            language: input.language ?? 'en',
            sortBy: input.sortBy ?? 'publishedAt',
            pageSize: String(input.pageSize ?? 10),
            apiKey: key,
        });
        if (input.from) params.set('from', input.from);
        if (input.to) params.set('to', input.to);
        if (input.domains) params.set('domains', input.domains);
        if (input.sources) params.set('sources', input.sources);

        const res = await fetch(`https://newsapi.org/v2/everything?${params}`);
        if (!res.ok) throw new Error(`NewsAPI ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            totalResults?: number;
            articles?: Array<{
                title: string;
                url: string;
                description?: string;
                publishedAt: string;
                source?: { name?: string };
                author?: string;
            }>;
        };

        return {
            totalResults: data.totalResults ?? 0,
            articles: (data.articles ?? []).map(a => ({
                title: a.title,
                url: a.url,
                publishedAt: a.publishedAt,
                source: a.source?.name ?? 'Unknown',
                ...(a.description !== undefined && { description: a.description }),
                ...(a.author !== undefined && { author: a.author }),
            })),
        };
    }
}

export class GetTopHeadlinesTool extends BaseTool<typeof GetTopHeadlinesSchema, {
    totalResults: number;
    articles: Array<{ title: string; url: string; description?: string; publishedAt: string; source: string }>;
}> {
    constructor(private config: NewspaperToolConfig = {}) {
        super({
            id: 'get_top_headlines',
            name: 'Get Top Headlines',
            description: 'Get top news headlines by category and country via NewsAPI.',
            category: ToolCategory.WEB,
            parameters: GetTopHeadlinesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetTopHeadlinesSchema>, _ctx: ToolContext) {
        const key = this.config.newsApiKey ?? process.env['NEWS_API_KEY'];
        if (!key) throw new Error('GetTopHeadlinesTool requires NEWS_API_KEY');

        const params = new URLSearchParams({
            category: input.category ?? 'general',
            country: input.country ?? 'us',
            pageSize: String(input.pageSize ?? 10),
            apiKey: key,
        });
        if (input.query) params.set('q', input.query);

        const res = await fetch(`https://newsapi.org/v2/top-headlines?${params}`);
        if (!res.ok) throw new Error(`NewsAPI ${res.status}: ${await res.text()}`);
        const data = await res.json() as {
            totalResults?: number;
            articles?: Array<{ title: string; url: string; description?: string; publishedAt: string; source?: { name?: string } }>;
        };

        return {
            totalResults: data.totalResults ?? 0,
            articles: (data.articles ?? []).map(a => ({
                title: a.title,
                url: a.url,
                publishedAt: a.publishedAt,
                source: a.source?.name ?? 'Unknown',
                ...(a.description !== undefined && { description: a.description }),
            })),
        };
    }
}

export class NewspaperToolkit {
    readonly getArticle: GetNewsArticleTool;
    readonly searchNews: SearchNewsTool;
    readonly getTopHeadlines: GetTopHeadlinesTool;

    constructor(config: NewspaperToolConfig = {}) {
        this.getArticle = new GetNewsArticleTool();
        this.searchNews = new SearchNewsTool(config);
        this.getTopHeadlines = new GetTopHeadlinesTool(config);
    }

    getTools() {
        return [this.getArticle, this.searchNews, this.getTopHeadlines];
    }
}
