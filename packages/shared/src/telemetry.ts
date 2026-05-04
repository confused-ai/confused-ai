/**
 * Optional usage metrics (opt-in). Disabled by default for privacy and production control.
 * Set `CONFUSED_AI_TELEMETRY=1` to enable a single startup payload (no PII, no prompt content).
 */

const ENABLED =
    typeof process !== 'undefined' && process.env?.['CONFUSED_AI_TELEMETRY'] === '1';

let sent = false;

/**
 * Fires once per process if telemetry is enabled and fetch is available.
 */
export function recordFrameworkStartup(meta: { version: string; runtime: string }): void {
    if (!ENABLED || sent) return;
    sent = true;
    if (typeof fetch !== 'function') return;
    // Default: no network destination — hook can be set later
    const endpoint = process.env?.['CONFUSED_AI_TELEMETRY_URL'];
    if (!endpoint) return;
    void fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'framework_start', ...meta, at: new Date().toISOString() }),
    }).catch(() => {
        // ignore
    });
}

export function isTelemetryEnabled(): boolean {
    return ENABLED;
}
