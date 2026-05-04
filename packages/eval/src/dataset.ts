/**
 * Dataset loader for eval pipelines.
 * Supports JSON lines, JSON arrays, CSV (header row), and HuggingFace-style records.
 */

export interface EvalSample {
    id?: string;
    input: string;
    expected?: string;
    metadata?: Record<string, unknown>;
}

export interface DatasetLoadOptions {
    /** Path to file (Node/Bun FS) or raw text string */
    source: string;
    /** Whether source is raw text (not a file path) */
    raw?: boolean;
    /** Column name for the input field (CSV) */
    inputColumn?: string;
    /** Column name for the expected field (CSV) */
    expectedColumn?: string;
}

function parseCsv(text: string, inputCol: string, expectedCol: string): EvalSample[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0]!.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const inputIdx = headers.indexOf(inputCol);
    const expectedIdx = headers.indexOf(expectedCol);
    if (inputIdx === -1) throw new Error(`CSV: column "${inputCol}" not found. Headers: ${headers.join(', ')}`);
    return lines.slice(1).map((line, i) => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        return {
            id: String(i),
            input: cols[inputIdx] ?? '',
            expected: expectedIdx !== -1 ? (cols[expectedIdx] ?? undefined) : undefined,
        };
    });
}

/**
 * Load an eval dataset from a JSON array, JSON lines, or CSV file/string.
 */
export async function loadDataset(opts: DatasetLoadOptions): Promise<EvalSample[]> {
    let text: string;
    if (opts.raw) {
        text = opts.source;
    } else {
        const { readFile } = await import('node:fs/promises');
        text = await readFile(opts.source, 'utf-8');
    }
    text = text.trim();

    // CSV detection
    if (text.startsWith(opts.inputColumn ?? 'input') || text.split('\n')[0]?.includes(',')) {
        const isCsv = !text.startsWith('[') && !text.startsWith('{');
        if (isCsv) {
            return parseCsv(text, opts.inputColumn ?? 'input', opts.expectedColumn ?? 'expected');
        }
    }

    // JSON array
    if (text.startsWith('[')) {
        const rows = JSON.parse(text) as Record<string, unknown>[];
        return rows.map((r, i) => ({
            id: String(r['id'] ?? i),
            input: String(r[opts.inputColumn ?? 'input'] ?? r['question'] ?? r['prompt'] ?? ''),
            expected: r[opts.expectedColumn ?? 'expected'] != null
                ? String(r[opts.expectedColumn ?? 'expected'])
                : r['answer'] != null ? String(r['answer']) : undefined,
            metadata: r,
        }));
    }

    // JSON lines
    const lines = text.split('\n').filter(l => l.trim());
    return lines.map((line, i) => {
        const r = JSON.parse(line) as Record<string, unknown>;
        return {
            id: String(r['id'] ?? i),
            input: String(r[opts.inputColumn ?? 'input'] ?? r['question'] ?? r['prompt'] ?? ''),
            expected: r[opts.expectedColumn ?? 'expected'] != null
                ? String(r[opts.expectedColumn ?? 'expected'])
                : r['answer'] != null ? String(r['answer']) : undefined,
            metadata: r,
        };
    });
}
