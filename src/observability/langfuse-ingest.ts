/**
 * Minimal Langfuse **public ingestion** client (HTTP, no SDK).
 *
 * Auth: Basic base64(`publicKey:secretKey`). Batch shape follows Langfuse `/api/public/ingestion`.
 *
 * SECURITY: prompts/completions/attributes are scrubbed with {@link maskSecrets}
 * before leaving the process — never export raw secrets/keys to third-party SaaS.
 */

import { maskSecrets } from '../observe/logger.js';

export interface LangfuseIngestClientConfig {
    readonly publicKey: string;
    readonly secretKey: string;
    /** Default: https://cloud.langfuse.com */
    readonly baseUrl?: string;
    readonly fetchImpl?: typeof fetch;
}

function basicAuth(pk: string, sk: string): string {
    const token = Buffer.from(`${pk}:${sk}`, 'utf8').toString('base64');
    return `Basic ${token}`;
}

/**
 * POST a batch to Langfuse ingestion. Each item should match Langfuse event types (trace, span, etc.).
 */
export async function sendLangfuseBatch(
    config: LangfuseIngestClientConfig,
    batch: unknown[]
): Promise<void> {
    const base = (config.baseUrl ?? 'https://cloud.langfuse.com').replace(/\/$/, '');
    const fetchFn = config.fetchImpl ?? fetch;
    const res = await fetchFn(`${base}/api/public/ingestion`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: basicAuth(config.publicKey, config.secretKey),
        },
        body: maskSecrets(JSON.stringify({ batch })),
    });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(`Langfuse ingestion failed: ${res.status} ${t}`);
    }
}
