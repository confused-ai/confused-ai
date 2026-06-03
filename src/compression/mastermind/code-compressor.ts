/**
 * CodeCompressor — AST-aware source code compression
 * ===================================================
 * Deterministic (no LLM). Reduces code blocks by:
 *   1. Stripping comments (line + block)
 *   2. Collapsing long function / class bodies to signature + ellipsis
 *   3. Removing blank lines > 1 consecutive
 *   4. Truncating large import blocks to first N + count
 *   5. Extracting fenced code blocks and compressing each individually
 *
 * Targets the common agent scenario: tool returns 400-line files, agent
 * only needs the structure / API surface.
 */

export interface CodeCompressorOptions {
    /** Max lines to keep inside a function/class body. Default: 20 */
    maxBodyLines?: number;
    /** Max import lines before collapsing. Default: 10 */
    maxImportLines?: number;
    /** Strip all comments. Default: true */
    stripComments?: boolean;
    /** Max total lines before truncation. Default: 150 */
    maxTotalLines?: number;
}

// ── Regex patterns ────────────────────────────────────────────────────────────

const BLOCK_COMMENT  = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT   = /(?<!https?:|ftp:|file:|ws:|wss:)\/\/[^\n]*/gi;
const PY_COMMENT     = /#[^\n]*/g;
const DOCSTRING      = /"""[\s\S]*?"""|'''[\s\S]*?'''/g;

const IMPORT_LINE    = /^(?:import |from |#include |require\(|use )/;
const FUNC_OPEN      = /^(?:(?:export\s+)?(?:async\s+)?(?:function|class|def|fn|pub fn|impl)\s+\w)/;
const BRACE_OPEN     = /\{$/;
const INDENT_OPEN    = /:$/; // Python style

// ── Strip comments ────────────────────────────────────────────────────────────

function stripComments(code: string): string {
    return code
        .replace(DOCSTRING, '""  # compressed')
        .replace(BLOCK_COMMENT, '')
        .replace(LINE_COMMENT, '')
        .replace(PY_COMMENT, '');
}

// ── Collapse import block ─────────────────────────────────────────────────────

function collapseImports(lines: string[], maxImport: number): string[] {
    const out: string[] = [];
    let importBlock: string[] = [];
    let inImportBlock = false;

    for (const line of lines) {
        if (IMPORT_LINE.test(line.trimStart())) {
            inImportBlock = true;
            importBlock.push(line);
        } else {
            if (inImportBlock) {
                if (importBlock.length > maxImport) {
                    out.push(...importBlock.slice(0, maxImport));
                    out.push(`// … +${importBlock.length - maxImport} more imports`);
                } else {
                    out.push(...importBlock);
                }
                importBlock = [];
                inImportBlock = false;
            }
            out.push(line);
        }
    }
    if (importBlock.length) {
        if (importBlock.length > maxImport) {
            out.push(...importBlock.slice(0, maxImport));
            out.push(`// … +${importBlock.length - maxImport} more imports`);
        } else {
            out.push(...importBlock);
        }
    }
    return out;
}

// ── Collapse function/class bodies ────────────────────────────────────────────

function collapseBodies(lines: string[], maxBody: number): string[] {
    const out: string[] = [];
    let bodyDepth = 0;
    let bodyLines = 0;
    let truncating = false;
    let truncatedCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const trimmed = line.trimStart();

        if (bodyDepth === 0) {
            out.push(line);
            if (FUNC_OPEN.test(trimmed) && (BRACE_OPEN.test(line) || INDENT_OPEN.test(line))) {
                bodyDepth = 1;
                bodyLines = 0;
                truncating = false;
                truncatedCount = 0;
            }
        } else {
            // Track brace depth
            const opens  = (line.match(/\{/g) ?? []).length;
            const closes = (line.match(/\}/g) ?? []).length;
            bodyDepth += opens - closes;

            if (!truncating) {
                out.push(line);
                bodyLines++;
                if (bodyLines >= maxBody && bodyDepth > 0) {
                    truncating = true;
                    out.push(`  // … body truncated`);
                }
            } else {
                if (bodyDepth <= 0) {
                    // Closing brace — always emit
                    out.push(line);
                    bodyDepth = 0;
                    truncating = false;
                } else {
                    truncatedCount++;
                }
            }

            if (bodyDepth <= 0) {
                if (truncatedCount > 0) {
                    // Replace placeholder line with accurate count
                    const placeholderIdx = out.lastIndexOf('  // … body truncated');
                    if (placeholderIdx >= 0) {
                        out[placeholderIdx] = `  // … +${truncatedCount} lines truncated`;
                    }
                }
                bodyDepth = 0;
                truncating = false;
                truncatedCount = 0;
            }
        }
    }
    return out;
}

// ── Main compressor ───────────────────────────────────────────────────────────

export function compressCode(
    code: string,
    opts: CodeCompressorOptions = {},
): string {
    const maxBody    = opts.maxBodyLines   ?? 20;
    const maxImport  = opts.maxImportLines ?? 10;
    const doStrip    = opts.stripComments  ?? true;
    const maxTotal   = opts.maxTotalLines  ?? 150;

    let text = code;

    // Strip fenced code block markers for processing
    const fenceMatch = text.match(/^```[\w\s]*\n([\s\S]+)```\s*$/);
    const lang = fenceMatch ? (text.match(/^```([\w]*)/)?.[1] ?? '') : '';
    if (fenceMatch) text = fenceMatch[1]!;

    if (doStrip) text = stripComments(text);

    let lines = text.split('\n');

    // Collapse blank lines
    lines = lines.reduce<string[]>((acc, line) => {
        if (line.trim() === '' && acc[acc.length - 1]?.trim() === '') return acc;
        acc.push(line);
        return acc;
    }, []);

    lines = collapseImports(lines, maxImport);
    lines = collapseBodies(lines, maxBody);

    // Hard truncation
    if (lines.length > maxTotal) {
        const head = lines.slice(0, maxTotal - 1);
        head.push(`// … +${lines.length - maxTotal + 1} lines truncated`);
        lines = head;
    }

    const result = lines.join('\n');
    return fenceMatch ? `\`\`\`${lang}\n${result}\n\`\`\`` : result;
}

/**
 * Extract all fenced code blocks from markdown/mixed text,
 * compress each, and return the modified text.
 */
export function compressCodeBlocks(text: string, opts: CodeCompressorOptions = {}): string {
    return text.replace(/```[\w\s]*\n[\s\S]+?```/g, (block) => {
        const compressed = compressCode(block, opts);
        // Only substitute if we actually saved something meaningful
        if (compressed.length < block.length * 0.85) return compressed;
        return block;
    });
}
