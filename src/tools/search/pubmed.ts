/**
 * PubMed search tool — search biomedical literature via NCBI E-utilities.
 * No API key required for basic usage (up to 3 requests/sec).
 * API key: https://www.ncbi.nlm.nih.gov/account/
 *
 * Best-default configuration applied:
 *   - Retry with exponential backoff (handles 429 / 5xx from NCBI)
 *   - Rate-limit guard: enforces min inter-request delay
 *   - PubMedGetArticleTool returns parsed JSON, not raw XML
 *   - dateType defaults to 'pdat' (publication date, not entry date)
 *   - Pagination via `offset`
 *   - Article-type filters (clinical trial, review, etc.)
 *   - `includeAbstract` toggle (default true)
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface PubMedToolConfig {
    /** NCBI API key (or NCBI_API_KEY env var) — optional, increases rate limit to 10 req/sec */
    apiKey?: string;
    /** Email for NCBI identification (required by NCBI terms) */
    email?: string;
    /** Tool name for NCBI identification */
    toolName?: string;
    /**
     * Max retries on transient errors (429, 500, 502, 503).
     * Default: 3
     */
    maxRetries?: number;
}

// ── Rate-limit guard ───────────────────────────────────────────────────────
// NCBI allows 3 req/sec without API key, 10 req/sec with one.
// We enforce a conservative inter-request delay to avoid 429s.

let _lastRequestAt = 0;

function getMinDelayMs(hasApiKey: boolean): number {
    return hasApiKey ? 110 : 350; // ~9/sec vs ~2.8/sec — safely under limits
}

async function rateWait(hasApiKey: boolean): Promise<void> {
    const minDelay = getMinDelayMs(hasApiKey);
    const elapsed = Date.now() - _lastRequestAt;
    if (elapsed < minDelay) {
        await new Promise<void>(resolve => setTimeout(resolve, minDelay - elapsed));
    }
    _lastRequestAt = Date.now();
}

// ── Fetch with retry ───────────────────────────────────────────────────────

async function fetchWithRetry(url: string, maxRetries: number, hasApiKey: boolean): Promise<Response> {
    const RETRYABLE = new Set([429, 500, 502, 503, 504]);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await rateWait(hasApiKey);
        try {
            const res = await fetch(url);
            if (res.ok) return res;
            if (!RETRYABLE.has(res.status) || attempt === maxRetries) {
                throw new Error(`PubMed API ${res.status}: ${await res.text()}`);
            }
            // Exponential backoff: 500ms, 1s, 2s
            await new Promise<void>(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        } catch (err) {
            lastErr = err;
            if (attempt === maxRetries) break;
            await new Promise<void>(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error('PubMed fetch failed');
}

function buildParams(config: PubMedToolConfig, extra: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams({
        ...extra,
        retmode: 'json',
        tool: config.toolName ?? process.env['NCBI_TOOL'] ?? 'agent-framework',
        email: config.email ?? process.env['NCBI_EMAIL'] ?? 'agent@example.com',
    });
    const key = config.apiKey ?? process.env['NCBI_API_KEY'];
    if (key) params.set('api_key', key);
    return params;
}

async function fetchJson(url: string, config: PubMedToolConfig): Promise<unknown> {
    const hasApiKey = !!(config.apiKey ?? process.env['NCBI_API_KEY']);
    const res = await fetchWithRetry(url, config.maxRetries ?? 3, hasApiKey);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchSchema = z.object({
    query: z.string().describe('PubMed search query (supports MeSH terms, boolean operators)'),
    maxResults: z.number().int().min(1).max(200).optional().default(10)
        .describe('Maximum number of articles to return (1–200)'),
    offset: z.number().int().min(0).optional().default(0)
        .describe('Pagination offset — number of results to skip'),
    sortBy: z.enum(['relevance', 'pub_date', 'Author', 'JournalName']).optional().default('relevance')
        .describe('Sort order for results'),
    dateType: z.enum(['pdat', 'edat', 'mdat']).optional().default('pdat')
        .describe('Date field to filter on: pdat=publication date, edat=entry date, mdat=modification date'),
    dateRange: z.object({
        from: z.string().optional().describe('Start date (YYYY/MM/DD or YYYY)'),
        to: z.string().optional().describe('End date (YYYY/MM/DD or YYYY)'),
    }).optional().describe('Filter by date range (uses dateType field)'),
    articleTypes: z.array(
        z.enum([
            'Clinical Trial',
            'Meta-Analysis',
            'Randomized Controlled Trial',
            'Review',
            'Systematic Review',
            'Case Reports',
            'Comparative Study',
        ])
    ).optional().describe('Filter to specific article types'),
    includeAbstract: z.boolean().optional().default(true)
        .describe('Whether to fetch and return full abstracts. Set false for title-only searches to reduce payload.'),
});

const GetArticleSchema = z.object({
    pmids: z.array(z.string()).min(1).max(20).describe('List of PubMed IDs to fetch details for'),
    includeAbstract: z.boolean().optional().default(true)
        .describe('Include abstract text in response'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class PubMedSearchTool extends BaseTool<typeof SearchSchema, {
    query: string;
    totalCount: number;
    pmids: string[];
    articles: Array<{
        pmid: string;
        title: string;
        abstract?: string;
        authors: string[];
        journal?: string;
        pubDate?: string;
        doi?: string;
    }>;
}> {
    constructor(private config: PubMedToolConfig = {}) {
        super({
            id: 'pubmed_search',
            name: 'PubMed Search',
            description: 'Search PubMed for biomedical literature. Returns article titles, abstracts, authors, and metadata.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        // Build article-type filter string (PubMed filter syntax)
        const filterTerms = (input.articleTypes ?? [])
            .map(t => `"${t}"[pt]`)
            .join(' OR ');
        const term = filterTerms ? `(${input.query}) AND (${filterTerms})` : input.query;

        // Step 1: ESearch to get PMIDs
        const searchParams = buildParams(this.config, {
            db: 'pubmed',
            term,
            retmax: String(input.maxResults),
            retstart: String(input.offset),
            sort: input.sortBy,
            datetype: input.dateType,
        });
        if (input.dateRange?.from) searchParams.set('mindate', input.dateRange.from);
        if (input.dateRange?.to) searchParams.set('maxdate', input.dateRange.to);

        const searchData = await fetchJson(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams.toString()}`,
            this.config,
        ) as { esearchresult?: { count?: string; idlist?: string[] } };

        const pmids = searchData.esearchresult?.idlist ?? [];
        const totalCount = parseInt(searchData.esearchresult?.count ?? '0', 10);

        if (pmids.length === 0) {
            return { query: input.query, totalCount, pmids: [], articles: [] };
        }

        // Step 2: EFetch to get article details
        const fetchParams = buildParams(this.config, {
            db: 'pubmed',
            id: pmids.join(','),
            rettype: 'abstract',
            retmode: 'json',
        });

        const fetchData = await fetchJson(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${fetchParams.toString()}`,
            this.config,
        ) as {
            PubmedArticleSet?: {
                PubmedArticle?: Array<{
                    MedlineCitation?: {
                        PMID?: { _: string } | string;
                        Article?: {
                            ArticleTitle?: string;
                            Abstract?: { AbstractText?: string | Array<{ _?: string }> };
                            AuthorList?: { Author?: Array<{ LastName?: string; ForeName?: string }> };
                            Journal?: { Title?: string; JournalIssue?: { PubDate?: { Year?: string; Month?: string } } };
                            ELocationID?: Array<{ EIdType?: string; _ ?: string }> | { EIdType?: string; _?: string };
                        };
                    };
                }>;
            };
        };

        const articles = (fetchData.PubmedArticleSet?.PubmedArticle ?? []).map(article => {
            const mc = article.MedlineCitation;
            const art = mc?.Article;
            const pmidVal = mc?.PMID;
            const pmid = typeof pmidVal === 'object' ? (pmidVal)._ : (pmidVal ?? '');

            // Title may be a string or structured object — normalise to string
            const titleRaw = art?.ArticleTitle;
            const title = typeof titleRaw === 'string' ? titleRaw : titleRaw != null ? String(titleRaw) : '';

            // Abstract — only parsed when requested
            let abstract: string | undefined;
            if (input.includeAbstract) {
                const abstractText = art?.Abstract?.AbstractText;
                abstract = Array.isArray(abstractText)
                    ? abstractText.map((t) => (typeof t === 'object' ? t._ ?? '' : t)).join(' ')
                    : typeof abstractText === 'string' ? abstractText : undefined;
            }

            const authors = (art?.AuthorList?.Author ?? [])
                .map(a => [a.ForeName, a.LastName].filter(Boolean).join(' '))
                .filter(Boolean);

            const journal = art?.Journal?.Title;
            const pubDate = art?.Journal?.JournalIssue?.PubDate;
            const pubDateStr = pubDate ? [pubDate.Year, pubDate.Month].filter(Boolean).join('/') : undefined;

            const elocations = Array.isArray(art?.ELocationID) ? art?.ELocationID : art?.ELocationID ? [art.ELocationID] : [];
            const doi = elocations.find(e => e.EIdType === 'doi')?._; 

            return {
                pmid,
                title,
                authors,
                ...(abstract !== undefined && { abstract }),
                ...(journal !== undefined && { journal }),
                ...(pubDateStr !== undefined && { pubDate: pubDateStr }),
                ...(doi !== undefined && { doi }),
            };
        });

        return { query: input.query, totalCount, pmids, articles };
    }
}

export class PubMedGetArticleTool extends BaseTool<typeof GetArticleSchema> {
    constructor(private config: PubMedToolConfig = {}) {
        super({
            id: 'pubmed_get_article',
            name: 'PubMed Get Article',
            description: 'Fetch detailed information for specific PubMed articles by their PMIDs. Returns structured JSON with title, abstract, authors, journal, and DOI.',
            category: ToolCategory.WEB,
            parameters: GetArticleSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetArticleSchema>, _ctx: ToolContext) {
        const params = buildParams(this.config, {
            db: 'pubmed',
            id: input.pmids.join(','),
            rettype: 'abstract',
            retmode: 'json',
        });

        const data = await fetchJson(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${params.toString()}`,
            this.config,
        ) as {
            PubmedArticleSet?: {
                PubmedArticle?: Array<{
                    MedlineCitation?: {
                        PMID?: { _: string } | string;
                        Article?: {
                            ArticleTitle?: string;
                            Abstract?: { AbstractText?: string | Array<{ _?: string }> };
                            AuthorList?: { Author?: Array<{ LastName?: string; ForeName?: string }> };
                            Journal?: { Title?: string; JournalIssue?: { PubDate?: { Year?: string; Month?: string } } };
                            ELocationID?: Array<{ EIdType?: string; _?: string }> | { EIdType?: string; _?: string };
                            PublicationTypeList?: { PublicationType?: Array<{ _?: string }> | { _?: string } };
                        };
                    };
                }>;
            };
        };

        const articles = (data.PubmedArticleSet?.PubmedArticle ?? []).map(article => {
            const mc = article.MedlineCitation;
            const art = mc?.Article;
            const pmidVal = mc?.PMID;
            const pmid = typeof pmidVal === 'object' ? pmidVal._ : (pmidVal ?? '');

            const titleRaw = art?.ArticleTitle;
            const title = typeof titleRaw === 'string' ? titleRaw : titleRaw != null ? String(titleRaw) : '';

            let abstract: string | undefined;
            if (input.includeAbstract) {
                const abstractText = art?.Abstract?.AbstractText;
                abstract = Array.isArray(abstractText)
                    ? abstractText.map(t => (typeof t === 'object' ? t._ ?? '' : t)).join(' ')
                    : typeof abstractText === 'string' ? abstractText : undefined;
            }

            const authors = (art?.AuthorList?.Author ?? [])
                .map(a => [a.ForeName, a.LastName].filter(Boolean).join(' '))
                .filter(Boolean);

            const journal = art?.Journal?.Title;
            const pubDate = art?.Journal?.JournalIssue?.PubDate;
            const pubDateStr = pubDate ? [pubDate.Year, pubDate.Month].filter(Boolean).join('/') : undefined;

            const elocations = Array.isArray(art?.ELocationID)
                ? art.ELocationID
                : art?.ELocationID ? [art.ELocationID] : [];
            const doi = elocations.find(e => e.EIdType === 'doi')?._;

            const pubTypesRaw = art?.PublicationTypeList?.PublicationType;
            const pubTypes = (Array.isArray(pubTypesRaw) ? pubTypesRaw : pubTypesRaw ? [pubTypesRaw] : [])
                .map(p => p._ ?? '')
                .filter(Boolean);

            return {
                pmid,
                title,
                authors,
                ...(abstract !== undefined && { abstract }),
                ...(journal !== undefined && { journal }),
                ...(pubDateStr !== undefined && { pubDate: pubDateStr }),
                ...(doi !== undefined && { doi }),
                ...(pubTypes.length > 0 && { publicationTypes: pubTypes }),
            };
        });

        return { pmids: input.pmids, articles };
    }
}

export class PubMedToolkit {
    readonly search: PubMedSearchTool;
    readonly getArticle: PubMedGetArticleTool;

    constructor(config: PubMedToolConfig = {}) {
        this.search = new PubMedSearchTool(config);
        this.getArticle = new PubMedGetArticleTool(config);
    }

    getTools() {
        return [this.search, this.getArticle];
    }
}
