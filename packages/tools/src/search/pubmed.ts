/**
 * PubMed search tool — search biomedical literature via NCBI E-utilities.
 * No API key required for basic usage (up to 3 requests/sec).
 * API key: https://www.ncbi.nlm.nih.gov/account/
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

async function fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PubMed API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchSchema = z.object({
    query: z.string().describe('PubMed search query (supports MeSH terms, boolean operators)'),
    maxResults: z.number().int().min(1).max(100).optional().default(10)
        .describe('Maximum number of articles to return'),
    sortBy: z.enum(['relevance', 'pub_date', 'Author', 'JournalName']).optional().default('relevance')
        .describe('Sort order for results'),
    dateRange: z.object({
        from: z.string().optional().describe('Start date (YYYY/MM/DD or YYYY)'),
        to: z.string().optional().describe('End date (YYYY/MM/DD or YYYY)'),
    }).optional().describe('Filter by publication date range'),
});

const GetArticleSchema = z.object({
    pmids: z.array(z.string()).min(1).max(20).describe('List of PubMed IDs to fetch details for'),
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
        // Step 1: ESearch to get PMIDs
        const searchParams = buildParams(this.config, {
            db: 'pubmed',
            term: input.query,
            retmax: String(input.maxResults ?? 10),
            sort: input.sortBy ?? 'relevance',
            usehistory: 'y',
        });
        if (input.dateRange?.from) searchParams.set('mindate', input.dateRange.from);
        if (input.dateRange?.to) searchParams.set('maxdate', input.dateRange.to);

        const searchData = await fetchJson(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams}`
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
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${fetchParams}`
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
            const pmid = typeof pmidVal === 'object' ? (pmidVal as { _: string })._ : (pmidVal ?? '');

            const abstractText = art?.Abstract?.AbstractText;
            const abstract = Array.isArray(abstractText)
                ? abstractText.map((t) => (typeof t === 'object' ? t._ ?? '' : t)).join(' ')
                : typeof abstractText === 'string' ? abstractText : undefined;

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
                title: typeof art?.ArticleTitle === 'string' ? art.ArticleTitle : String(art?.ArticleTitle ?? ''),
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
            description: 'Fetch detailed information for specific PubMed articles by their PMIDs.',
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
            retmode: 'xml',
        });

        const res = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${params}`);
        if (!res.ok) throw new Error(`PubMed API ${res.status}: ${await res.text()}`);
        const text = await res.text();
        return { pmids: input.pmids, rawXml: text };
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
