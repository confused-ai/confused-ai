/**
 * Arxiv tools — search and retrieve academic papers from arxiv.org.
 * No API key required.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

interface ArxivEntry {
    id: string;
    title: string;
    summary: string;
    authors: string[];
    published: string;
    updated: string;
    pdfUrl: string;
    categories: string[];
}

function parseXml(xml: string): ArxivEntry[] {
    const entries: ArxivEntry[] = [];
    const entryMatches = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];

    for (const entry of entryMatches) {
        const get = (tag: string) =>
            entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`))?.[1]?.trim() ?? '';

        const id = get('id').split('/').pop() ?? '';
        const title = get('title').replace(/\s+/g, ' ');
        const summary = get('summary').replace(/\s+/g, ' ');

        const authors: string[] = [];
        const authorMatches = entry.match(/<author>([\s\S]*?)<\/author>/g) ?? [];
        for (const a of authorMatches) {
            const name = a.match(/<name>(.*?)<\/name>/)?.[1]?.trim();
            if (name) authors.push(name);
        }

        const linkMatch = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/);
        const pdfUrl = linkMatch?.[1] ?? `https://arxiv.org/pdf/${id}`;

        const cats: string[] = [];
        const catMatches = entry.match(/<category[^>]*term="([^"]+)"/g) ?? [];
        for (const c of catMatches) {
            const term = c.match(/term="([^"]+)"/)?.[1];
            if (term) cats.push(term);
        }

        entries.push({
            id,
            title,
            summary,
            authors,
            published: get('published'),
            updated: get('updated'),
            pdfUrl,
            categories: cats,
        });
    }

    return entries;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchSchema = z.object({
    query: z.string().describe('Search query (supports arxiv operators: ti:, au:, abs:, cat:)'),
    maxResults: z.number().int().min(1).max(50).optional().default(10).describe('Max results'),
    sortBy: z.enum(['relevance', 'lastUpdatedDate', 'submittedDate']).optional().default('relevance'),
    category: z.string().optional().describe('Arxiv category filter (e.g. cs.AI, math.ST, quant-ph)'),
});

const GetPaperSchema = z.object({
    paperId: z.string().describe('Arxiv paper ID (e.g. "2301.07041" or full URL)'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ArxivSearchTool extends BaseTool<typeof SearchSchema, { papers: ArxivEntry[]; total: number }> {
    constructor() {
        super({
            id: 'arxiv_search',
            name: 'Arxiv Search',
            description: 'Search academic papers on arxiv.org. Returns titles, abstracts, authors, and PDF links.',
            category: ToolCategory.WEB,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const q = input.category ? `${input.query} AND cat:${input.category}` : input.query;
        const params = new URLSearchParams({
            search_query: `all:${q}`,
            start: '0',
            max_results: String(input.maxResults ?? 10),
            sortBy: input.sortBy ?? 'relevance',
            sortOrder: 'descending',
        });
        const res = await fetch(`https://export.arxiv.org/api/query?${params}`);
        if (!res.ok) throw new Error(`Arxiv API error ${res.status}`);
        const xml = await res.text();
        const papers = parseXml(xml);
        return { papers, total: papers.length };
    }
}

export class ArxivGetPaperTool extends BaseTool<typeof GetPaperSchema, ArxivEntry | null> {
    constructor() {
        super({
            id: 'arxiv_get_paper',
            name: 'Arxiv Get Paper',
            description: 'Retrieve full metadata for a specific arxiv paper by ID.',
            category: ToolCategory.WEB,
            parameters: GetPaperSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetPaperSchema>, _ctx: ToolContext) {
        const id = input.paperId.replace(/^.*arxiv\.org\/(abs|pdf)\//, '').replace(/v\d+$/, '').replace(/\.pdf$/, '');
        const params = new URLSearchParams({ id_list: id });
        const res = await fetch(`https://export.arxiv.org/api/query?${params}`);
        if (!res.ok) throw new Error(`Arxiv API error ${res.status}`);
        const xml = await res.text();
        const papers = parseXml(xml);
        return papers[0] ?? null;
    }
}

export class ArxivToolkit {
    readonly tools: BaseTool[];
    constructor() {
        this.tools = [new ArxivSearchTool(), new ArxivGetPaperTool()];
    }
}
