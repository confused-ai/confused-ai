/**
 * PDF Loader
 * ==========
 * Loads a PDF file and returns its text pages as `Document[]`.
 * Requires the `pdf-parse` peer dependency:
 *   pnpm add pdf-parse
 *   pnpm add -D @types/pdf-parse
 *
 * Usage:
 *   const docs = await loadPdf('./report.pdf');
 *   await engine.addDocuments(docs);
 */

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Document } from '../types.js';

export interface PdfLoaderOptions {
    /** Split into per-page documents (default: true). False = single merged document. */
    perPage?: boolean;
    /** Additional metadata to attach to every generated Document */
    metadata?: Record<string, unknown>;
}

/**
 * Load a PDF from `filePath` and return an array of `Document` objects.
 * Each page becomes a separate document when `perPage` is true (default).
 */
export async function loadPdf(
    filePath: string,
    options: PdfLoaderOptions = {},
): Promise<Document[]> {
    const perPage = options.perPage ?? true;
    const extraMeta = options.metadata ?? {};

    const buffer = await readFile(filePath);

    // Dynamic import — optional peer dependency
    // @ts-ignore — optional peer dependency, may not be installed
    const pdfParse = await import('pdf-parse').catch(() => {
        throw new Error(
            'loadPdf() requires "pdf-parse". Install it with: pnpm add pdf-parse',
        );
    }) as { default: (buf: Buffer, opts?: { max?: number }) => Promise<{ text: string; numpages: number; text_by_page?: string[] }> };

    const parsed = await pdfParse.default(buffer);

    if (!perPage) {
        return [
            {
                id:       randomUUID(),
                content:  parsed.text,
                metadata: { source: filePath, pages: parsed.numpages, ...extraMeta },
            },
        ];
    }

    // If pdf-parse exposes per-page text, use it; otherwise split on form-feeds
    const pages: string[] = parsed.text_by_page?.length
        ? parsed.text_by_page
        : parsed.text.split('\f');

    return pages
        .map((pageText, i): Document => ({
            id:       randomUUID(),
            content:  pageText.trim(),
            metadata: { source: filePath, page: i + 1, totalPages: parsed.numpages, ...extraMeta },
        }))
        .filter((d) => d.content.length > 0);
}
