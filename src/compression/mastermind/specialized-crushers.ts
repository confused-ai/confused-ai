/**
 * Specialised crushers for Log, XML, and CSV content
 * ====================================================
 *
 *  LogCrusher  — deduplicates repeated log lines, keeps error/warn lines,
 *                collapses identical consecutive lines to count.
 *  XmlCrusher  — strips XML comments, removes empty elements, truncates
 *                repeated element blocks.
 *  CsvCrusher  — keeps header + first N + last M rows, injects row count.
 */

// ── LogCrusher ────────────────────────────────────────────────────────────────

export interface LogCrusherOptions {
    /** Max lines to keep. Default: 50 */
    maxLines?: number;
    /** Always keep lines matching these patterns (errors, fatals). Default: ERROR|FATAL|WARN */
    alwaysKeep?: RegExp;
    /** Collapse runs of identical lines to first + count. Default: true */
    dedup?: boolean;
}

export function crushLog(text: string, opts: LogCrusherOptions = {}): string {
    const maxLines  = opts.maxLines   ?? 50;
    const alwaysKeep = opts.alwaysKeep ?? /\b(ERROR|FATAL|WARN|Exception|Traceback|panic|critical)\b/i;
    const dedup     = opts.dedup      ?? true;

    const lines = text.split('\n');

    // Dedup consecutive identical lines
    let deduped: string[] = [];
    if (dedup) {
        let prev = '';
        let count = 0;
        for (const line of lines) {
            if (line === prev) {
                count++;
            } else {
                if (count > 1) deduped.push(`  (repeated ${count}×)`);
                deduped.push(line);
                prev = line;
                count = 1;
            }
        }
        if (count > 1) deduped.push(`  (repeated ${count}×)`);
    } else {
        deduped = lines;
    }

    // Separate important vs normal lines
    const important: Array<{ idx: number; line: string }> = [];
    const normal: string[] = [];
    deduped.forEach((line, idx) => {
        if (alwaysKeep.test(line)) important.push({ idx, line });
        else normal.push(line);
    });

    const slotsForNormal = Math.max(0, maxLines - important.length);

    // Keep evenly-spaced sample of normal lines
    let kept: string[] = [];
    if (normal.length <= slotsForNormal) {
        kept = normal;
    } else {
        const step = Math.max(1, Math.floor(normal.length / slotsForNormal));
        kept = normal.filter((_, i) => i % step === 0).slice(0, slotsForNormal);
        kept.unshift(`[${normal.length} lines → sampled ${kept.length}]`);
    }

    // Merge important lines back in approximate position
    const result = [...kept];
    for (const { line } of important) {
        result.push(line);
    }

    return result.join('\n');
}

// ── XmlCrusher ────────────────────────────────────────────────────────────────

export interface XmlCrusherOptions {
    /** Strip XML/HTML comments. Default: true */
    stripComments?: boolean;
    /** Remove empty elements like <foo></foo> or <foo/>. Default: true */
    removeEmpty?: boolean;
    /** Max element repetitions before collapsing. Default: 5 */
    maxRepeat?: number;
    /** Max total chars. Default: 4000 */
    maxChars?: number;
}

export function crushXml(text: string, opts: XmlCrusherOptions = {}): string {
    const stripComments = opts.stripComments ?? true;
    const removeEmpty   = opts.removeEmpty   ?? true;
    const maxRepeat     = opts.maxRepeat     ?? 5;
    const maxChars      = opts.maxChars      ?? 4000;

    let out = text;

    if (stripComments) {
        out = out.replace(/<!--[\s\S]*?-->/g, '');
    }

    if (removeEmpty) {
        // Self-closing with no attributes
        out = out.replace(/<(\w[\w:.-]*)>\s*<\/\1>/g, '');
        // Whitespace-only content
        out = out.replace(/<(\w[\w:.-]*)\s*\/>/g, '');
    }

    // Collapse repeated sibling elements (e.g. <item>…</item> ×100)
    out = out.replace(/(<(\w[\w:.-]*)[\s\S]*?<\/\2>\s*){6,}/g, (match, _, tag) => {
        const tagPat = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'g');
        const instances = match.match(tagPat) ?? [];
        const kept = instances.slice(0, maxRepeat).join('\n');
        return `${kept}\n<!-- … +${instances.length - maxRepeat} more <${tag}> elements -->`;
    });

    // Normalise whitespace
    out = out.replace(/\n{3,}/g, '\n\n').trim();

    if (out.length > maxChars) {
        out = `${out.slice(0, maxChars)}\n<!-- … truncated (+${out.length - maxChars} chars) -->`;
    }

    return out;
}

// ── CsvCrusher ────────────────────────────────────────────────────────────────

export interface CsvCrusherOptions {
    /** Max data rows to keep (head + tail). Default: 20 */
    maxRows?: number;
    /** Max column width before truncation. Default: 80 */
    maxColWidth?: number;
}

export function crushCsv(text: string, opts: CsvCrusherOptions = {}): string {
    const maxRows     = opts.maxRows     ?? 20;
    const maxColWidth = opts.maxColWidth ?? 80;

    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length <= maxRows + 1) {
        // No truncation needed — still truncate wide columns
        return lines
            .map(line =>
                line.split(',').map(col =>
                    col.length > maxColWidth ? `${col.slice(0, maxColWidth)}…` : col
                ).join(',')
            )
            .join('\n');
    }

    const [header, ...data] = lines as [string, ...string[]];
    const half  = Math.floor(maxRows / 2);
    const head  = data.slice(0, half);
    const tail  = data.slice(-half);
    const total = data.length;

    const truncateRow = (row: string) =>
        row.split(',').map(col =>
            col.length > maxColWidth ? `${col.slice(0, maxColWidth)}…` : col
        ).join(',');

    return [
        truncateRow(header!),
        ...head.map(truncateRow),
        `… (${total - maxRows} rows omitted) …`,
        ...tail.map(truncateRow),
    ].join('\n');
}
