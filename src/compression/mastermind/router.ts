/**
 * ContentRouter
 * =============
 * Sniffs message content and selects the best compression algorithm.
 * All detection is purely heuristic (no LLM calls) and runs in < 1 ms.
 *
 * Priority order (first match wins):
 *   json → code → xml → csv → log → markdown → text
 */

import type { ContentType, CompressionAlgorithm } from './types.js';
import { countTokens } from '../token-counter.js';

// ── Sniff helpers ─────────────────────────────────────────────────────────────

const JSON_LEADING = /^\s*[{\[]/;
const XML_LEADING  = /^\s*</;
const CSV_HEADER   = /^[^\n]{1,300}\n(?:[^\n,]*,){2,}/;

const CODE_INDENT  = /^( {4}|\t)/m;
const CODE_KEYWORDS =
    /\b(function|const|let|var|class|def |import |from |export |return |async |await |if \(|for \(|while \(|fn |pub |impl |#include|package |namespace )\b/;

const LOG_LINE =
    /^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}|^\[(?:INFO|DEBUG|WARN|ERROR|FATAL|TRACE)\]|(?:INFO|DEBUG|WARN|ERROR|FATAL)\s*[\|:]/m;

const MARKDOWN_HEADING = /^#{1,6} /m;
const MARKDOWN_LIST    = /^[*\-+] |\d+\. /m;

// ── Token estimation (canonical, model-aware) ───────────────────────────────

/**
 * Estimate token count using the framework's shared model-aware counter.
 * Single source of truth — keeps Mastermind budgeting consistent with the
 * rest of the framework (providers/ContextWindowManager).
 */
export function estimateTokens(text: string): number {
    if (!text) return 0;
    return countTokens(text);
}

// ── Code fence safety check ──────────────────────────────────────────────────

function isCodeFence(text: string): boolean {
    const len = text.length;
    if (len < 6) return false;

    // Find first non-whitespace character
    let start = 0;
    while (start < len && text.charCodeAt(start) <= 32) {
        start++;
    }

    // Find last non-whitespace character
    let end = len - 1;
    while (end >= 0 && text.charCodeAt(end) <= 32) {
        end--;
    }

    if (end - start + 1 < 6) return false;

    return text.startsWith('```', start) && text.startsWith('```', end - 2);
}

// ── ContentRouter ─────────────────────────────────────────────────────────────

export interface RoutingDecision {
    contentType: ContentType;
    algorithm: CompressionAlgorithm;
    /** Whether an LLM generate function is actually required */
    requiresLLM: boolean;
}

export function detectContentType(text: string): ContentType {
    if (!text) return 'text';
    const sample = text.slice(0, 2000).trimStart();
    if (!sample) return 'text';

    // Binary check (control chars that are not whitespace)
    let binaryCount = 0;
    const limit = Math.min(sample.length, 200);
    for (let i = 0; i < limit; i++) {
        const code = sample.charCodeAt(i);
        if (code < 32 && code !== 10 && code !== 13 && code !== 9) {
            binaryCount++;
            if (binaryCount > 4) return 'binary';
        }
    }

    if (JSON_LEADING.test(sample)) {
        try { JSON.parse(text); return 'json'; } catch { /* fall through */ }
        // Partial JSON still worth routing to smart-crusher
        const depth = (sample.match(/[{[]/g) || []).length;
        if (depth >= 2) return 'json';
    }

    if (XML_LEADING.test(sample)) return 'xml';

    if (isCodeFence(text) || (CODE_INDENT.test(sample) && CODE_KEYWORDS.test(sample))) {
        return 'code';
    }

    if (CSV_HEADER.test(sample)) return 'csv';

    if (LOG_LINE.test(sample)) return 'log';

    if (MARKDOWN_HEADING.test(sample) || MARKDOWN_LIST.test(sample)) return 'markdown';

    return 'text';
}

export function routeContent(
    text: string,
    hasLLM: boolean,
): RoutingDecision {
    const contentType = detectContentType(text);

    let algorithm: CompressionAlgorithm;
    let requiresLLM = false;

    switch (contentType) {
        case 'json':
            algorithm = 'smart-crusher';
            break;
        case 'code':
            algorithm = 'code-compressor';
            break;
        case 'xml':
            algorithm = 'xml-crusher';
            break;
        case 'csv':
            algorithm = 'csv-crusher';
            break;
        case 'log':
            algorithm = 'log-crusher';
            break;
        case 'markdown':
        case 'text':
            algorithm = hasLLM ? 'summary-llm' : 'sliding-window';
            requiresLLM = hasLLM;
            break;
        default:
            algorithm = 'passthrough';
    }

    return { contentType, algorithm, requiresLLM };
}
