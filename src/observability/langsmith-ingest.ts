/**
 * Minimal LangSmith run ingestion (HTTP). Requires `LANGSMITH_API_KEY` or passed `apiKey`.
 *
 * Endpoint may evolve; verify against https://api.smith.langchain.com docs for your workspace.
 *
 * SECURITY: run inputs/outputs/extra are scrubbed with {@link maskSecrets} before
 * leaving the process — never export raw secrets/keys to third-party SaaS.
 */

import { maskSecrets } from '../observe/logger.js';

export interface LangSmithRunPayload {
    readonly id?: string;
    readonly name: string;
    readonly run_type: string;
    readonly inputs?: Record<string, unknown>;
    readonly outputs?: Record<string, unknown>;
    readonly error?: string;
    readonly start_time?: number;
    readonly end_time?: number;
    readonly extra?: Record<string, unknown>;
}

/**
 * Batch-create runs. Uses `POST /runs/batch` with `{ post: runs[] }` shape (common for LangSmith).
 */
export async function sendLangSmithRunBatch(
    apiKey: string,
    runs: LangSmithRunPayload[],
    options?: { baseUrl?: string; fetchImpl?: typeof fetch }
): Promise<void> {
    const base = (options?.baseUrl ?? 'https://api.smith.langchain.com').replace(/\/$/, '');
    const fetchFn = options?.fetchImpl ?? fetch;
    const res = await fetchFn(`${base}/runs/batch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
        },
        body: maskSecrets(JSON.stringify({ post: runs })),
    });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(`LangSmith batch failed: ${res.status} ${t}`);
    }
}
