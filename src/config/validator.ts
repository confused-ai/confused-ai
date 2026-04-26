/**
 * Configuration validation with helpful error messages
 */

import type { AppConfig, ConfigValidationError } from './types.js';
import { AgentError, ErrorCode } from '../shared/errors.js';

/**
 * Validate application configuration
 * Throws detailed errors with suggestions for missing/invalid values
 */
export function validateConfig(config: Partial<AppConfig>): AppConfig & { errors: ConfigValidationError[] } {
    const errors: ConfigValidationError[] = [];

    // LLM validation
    if (!config.llm) {
        errors.push({
            field: 'llm',
            message: 'LLM configuration is required',
            suggestion: 'Set OPENAI_API_KEY and OPENAI_MODEL environment variables',
        });
    } else {
        if (!config.llm.apiKey) {
            errors.push({
                field: 'llm.apiKey',
                message: 'LLM API key is required',
                suggestion: `Set ${config.llm.provider?.toUpperCase()}_API_KEY environment variable`,
            });
        }
        if (!config.llm.model) {
            errors.push({
                field: 'llm.model',
                message: 'LLM model ID is required',
                suggestion: `Set ${config.llm.provider?.toUpperCase()}_MODEL environment variable (e.g., gpt-4o)`,
            });
        }
    }

    // Database validation
    if (!config.database) {
        errors.push({
            field: 'database',
            message: 'Database configuration is required',
            suggestion: 'Set DB_TYPE environment variable (sqlite, postgres, or memory)',
        });
    } else {
        if (config.database.type === 'postgres') {
            if (!config.database.host) {
                errors.push({
                    field: 'database.host',
                    message: 'PostgreSQL host is required',
                    suggestion: 'Set DB_HOST environment variable',
                });
            }
            if (!config.database.database) {
                errors.push({
                    field: 'database.database',
                    message: 'Database name is required',
                    suggestion: 'Set DB_NAME environment variable',
                });
            }
        }
    }

    // Server validation
    if (!config.server) {
        errors.push({
            field: 'server',
            message: 'Server configuration is required',
            suggestion: 'Set PORT environment variable',
        });
    } else if (!config.server.port || config.server.port < 1 || config.server.port > 65535) {
        errors.push({
            field: 'server.port',
            message: 'Server port must be between 1 and 65535',
            value: config.server.port?.toString(),
            suggestion: 'Set PORT to a valid port number (default: 3001)',
        });
    }

    if (errors.length > 0) {
        const errorDetails = errors
            .map(
                (e) =>
                    `  ❌ ${e.field}: ${e.message}${e.value ? ` (got: "${e.value}")` : ''}${e.suggestion ? `\n     💡 ${e.suggestion}` : ''}`
            )
            .join('\n');

        throw new AgentError(
            `Configuration validation failed:\n${errorDetails}`,
            {
                code: ErrorCode.CONFIG_ERROR,
                context: { errors },
            }
        );
    }

    return config as AppConfig & { errors: ConfigValidationError[] };
}

/**
 * Get helpful error message for misconfiguration
 */
export function getConfigErrorHelp(error: Error): string {
    if (error.message.includes('OPENAI_API_KEY')) {
        return `
🔑 Missing OpenAI Configuration

Set your OpenAI API key:
  export OPENAI_API_KEY=sk-your-key-here
  
Get your key from: https://platform.openai.com/api-keys

See docs/guide/installation.md for detailed setup instructions.
`;
    }

    if (error.message.includes('Database')) {
        return `
🗃️  Database Configuration Error

For development (SQLite, no setup required):
  Set DB_TYPE=sqlite (or omit for default)

For production (PostgreSQL):
  Set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD

See docs/guide/deployment.md for database setup guide.
`;
    }

    return `
⚙️  Configuration Error

Check your environment variables in .env.local
See docs/guide/installation.md for setup instructions.
`;
}
