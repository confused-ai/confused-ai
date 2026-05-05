/**
 * CSV Loader
 * ==========
 * Parses a CSV file and converts each row into a `Document`.
 * Uses Node's built-in stream/readline — no extra deps needed.
 *
 * Usage:
 *   const docs = await loadCsv('./data.csv');
 *   await engine.addDocuments(docs);
 *
 *   // Custom content column + metadata columns
 *   const docs = await loadCsv('./products.csv', {
 *     contentColumn: 'description',
 *     metadataColumns: ['sku', 'category'],
 *   });
 */

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Document } from '../types.js';

export interface CsvLoaderOptions {
    /**
     * Column to use as document content.
     * If omitted, all columns are concatenated as "key: value" pairs.
     */
    contentColumn?: string;
    /** Columns to include in `metadata`. Defaults to all non-content columns. */
    metadataColumns?: string[];
    /** CSV delimiter character. Default: ',' */
    delimiter?: string;
    /** Additional metadata to attach to every generated Document */
    metadata?: Record<string, unknown>;
}

/**
 * Load a CSV from `filePath` and return `Document[]` — one per data row.
 * The first row is treated as the header.
 */
export async function loadCsv(
    filePath: string,
    options: CsvLoaderOptions = {},
): Promise<Document[]> {
    const delimiter = options.delimiter ?? ',';
    const extraMeta = options.metadata ?? {};

    const raw = await readFile(filePath, 'utf-8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    // Parse header
    const headers = parseCsvRow(lines[0]!, delimiter);

    const contentCol = options.contentColumn;
    const metaCols   = options.metadataColumns ?? headers.filter((h) => h !== contentCol);

    const docs: Document[] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvRow(lines[i]!, delimiter);
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]!] = values[j] ?? '';
        }

        const content = contentCol
            ? (row[contentCol] ?? '')
            : headers.map((h) => `${h}: ${row[h] ?? ''}`).join('\n');

        if (!content.trim()) continue;

        const metadata: Record<string, unknown> = {
            source:  filePath,
            rowIndex: i,
            ...extraMeta,
        };
        for (const col of metaCols) {
            if (col !== contentCol) metadata[col] = row[col] ?? '';
        }

        docs.push({ id: randomUUID(), content: content.trim(), metadata });
    }

    return docs;
}

// ── RFC-4180 row parser ───────────────────────────────────────────────────────

function parseCsvRow(line: string, delimiter: string): string[] {
    const fields: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i]!;
        const next = line[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                // Escaped quote
                field += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            fields.push(field);
            field = '';
        } else {
            field += char;
        }
    }
    fields.push(field);
    return fields;
}
