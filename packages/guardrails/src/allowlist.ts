/**
 * Allowlist implementation for guardrails
 */

import { AllowlistConfig, GuardrailRule, GuardrailResult, GuardrailContext } from './types.js';

/**
 * Create an allowlist-based guardrail rule
 */
export function createAllowlistRule(config: AllowlistConfig): GuardrailRule {
    return {
        name: 'allowlist',
        description: 'Enforces allowlist restrictions on tools, hosts, paths, and outputs',
        severity: 'error',
        check(context: GuardrailContext): GuardrailResult {
            // Check tool allowlist
            if (config.allowedTools && context.toolName) {
                if (!config.allowedTools.includes(context.toolName)) {
                    return {
                        passed: false,
                        rule: 'allowlist',
                        message: `Tool '${context.toolName}' is not in the allowed tools list`,
                    };
                }
            }

            // Check host allowlist for HTTP tools — parse the URL and compare
            // hostname directly to prevent bypass via query strings or path segments
            // (e.g. https://evil.com/?r=safe.com would otherwise pass a naive includes() check)
            if (config.allowedHosts && context.toolArgs?.url) {
                const urlStr = String(context.toolArgs.url);
                let hostname: string;
                try {
                    hostname = new URL(urlStr).hostname;
                } catch {
                    return {
                        passed: false,
                        rule: 'allowlist',
                        message: `Invalid URL: '${urlStr}'`,
                    };
                }
                const allowed = config.allowedHosts.some(
                    h => hostname === h || hostname.endsWith(`.${h}`)
                );
                if (!allowed) {
                    return {
                        passed: false,
                        rule: 'allowlist',
                        message: `Host '${hostname}' is not in the allowed hosts list`,
                    };
                }
            }

            // Check blocked patterns
            if (config.blockedPatterns) {
                const raw = context.output;
                const content =
                    typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : JSON.stringify(raw);

                for (const pattern of config.blockedPatterns) {
                    if (pattern.test(content)) {
                        return {
                            passed: false,
                            rule: 'allowlist',
                            message: `Content matches blocked pattern: ${pattern}`,
                        };
                    }
                }
            }

            return { passed: true, rule: 'allowlist' };
        },
    };
}

/**
 * Default sensitive data patterns to block
 */
export const SENSITIVE_DATA_PATTERNS: RegExp[] = [
    // Credit card numbers
    /\b(?:\d[ -]*?){13,16}\b/,
    // Social Security Numbers (SSN)
    /\b\d{3}[ -]?\d{2}[ -]?\d{4}\b/,
    // API keys (common patterns)
    // eslint-disable-next-line no-useless-escape
    /['"\s](?:api[_-]?key|apikey|token|secret)[\s]*[:=][\s]*['"][a-zA-Z0-9_\-]{16,}['"\s]/i,
    // Private keys
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    // Passwords in URLs
    /[?&](?:password|passwd|pwd)=[^&\s]+/i,
];

/**
 * Create a rule to block sensitive data
 */
export function createSensitiveDataRule(): GuardrailRule {
    return {
        name: 'sensitive_data',
        description: 'Blocks common sensitive data patterns like credit cards, SSNs, API keys',
        severity: 'error',
        check(context: GuardrailContext): GuardrailResult {
            const raw = context.output;
            const content =
                typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : JSON.stringify(raw);

            for (const pattern of SENSITIVE_DATA_PATTERNS) {
                if (pattern.test(content)) {
                    return {
                        passed: false,
                        rule: 'sensitive_data',
                        message: `Output may contain sensitive data matching pattern: ${pattern}`,
                    };
                }
            }

            return { passed: true, rule: 'sensitive_data' };
        },
    };
}

/**
 * Create a URL validation rule
 */
export function createUrlValidationRule(
    allowedProtocols: string[] = ['https:'],
    allowedHosts?: string[]
): GuardrailRule {
    return {
        name: 'url_validation',
        description: `Validates URLs use allowed protocols (${allowedProtocols.join(', ')})`,
        severity: 'error',
        check(context: GuardrailContext): GuardrailResult {
            const url = context.toolArgs?.url;
            if (!url || typeof url !== 'string') {
                return { passed: true, rule: 'url_validation' };
            }

            try {
                const parsed = new URL(url);

                // Check protocol
                if (!allowedProtocols.includes(parsed.protocol)) {
                    return {
                        passed: false,
                        rule: 'url_validation',
                        message: `Protocol '${parsed.protocol}' is not allowed. Allowed: ${allowedProtocols.join(', ')}`,
                    };
                }

                // Check host if allowlist provided
                if (allowedHosts && !allowedHosts.includes(parsed.hostname)) {
                    return {
                        passed: false,
                        rule: 'url_validation',
                        message: `Host '${parsed.hostname}' is not in the allowed hosts list`,
                    };
                }

                return { passed: true, rule: 'url_validation' };
            } catch {
                return {
                    passed: false,
                    rule: 'url_validation',
                    message: `Invalid URL: ${url}`,
                };
            }
        },
    };
}
