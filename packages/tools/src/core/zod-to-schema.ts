/**
 * Zod schema to JSON Schema converter
 * Handles all major Zod types: string, number, boolean, array, object, enum, optional, nullable, union, etc.
 *
 * This is more complete than the hand-rolled version in runner.ts
 */

import type { ZodType } from 'zod';
import type { LLMToolDefinition } from '@confused-ai/core';
import type { Tool, ToolParameters } from './types.js';

type ZodWithJsonSchema = ZodType & {
    toJSONSchema?: () => Record<string, unknown>;
};

/**
 * Convert a Zod schema to JSON Schema
 *
 * Zod 4+ provides `toJSONSchema()` with correct `properties` / `required`; our legacy
 * branch targets Zod 3 (`_def.typeName`). Without this, Zod 4 objects hit the `default`
 * case and OpenAI returns: "object schema missing properties".
 */
export function zodToJsonSchema(zodSchema: ZodType): Record<string, unknown> {
    const maybe = zodSchema as ZodWithJsonSchema;
    if (typeof maybe.toJSONSchema === 'function') {
        const out = { ...maybe.toJSONSchema() };
        delete out['$schema'];
        return out;
    }

    const def = (zodSchema as any)._def;
    if (!def) return { type: 'object', additionalProperties: true };

    const typeName = def.typeName as string;

    switch (typeName) {
        case 'ZodString':
            return {
                type: 'string',
                ...(def.description && { description: def.description }),
                ...(def.checks?.some((c: any) => c.kind === 'min') && {
                    minLength: def.checks.find((c: any) => c.kind === 'min')?.value,
                }),
                ...(def.checks?.some((c: any) => c.kind === 'max') && {
                    maxLength: def.checks.find((c: any) => c.kind === 'max')?.value,
                }),
                ...(def.checks?.some((c: any) => c.kind === 'email') && { format: 'email' }),
                ...(def.checks?.some((c: any) => c.kind === 'url') && { format: 'uri' }),
                ...(def.checks?.some((c: any) => c.kind === 'regex') && {
                    pattern: def.checks.find((c: any) => c.kind === 'regex')?.regex?.source,
                }),
            };

        case 'ZodNumber':
            return {
                type: 'number',
                ...(def.description && { description: def.description }),
                ...(def.checks?.some((c: any) => c.kind === 'min') && {
                    minimum: def.checks.find((c: any) => c.kind === 'min')?.value,
                }),
                ...(def.checks?.some((c: any) => c.kind === 'max') && {
                    maximum: def.checks.find((c: any) => c.kind === 'max')?.value,
                }),
                ...(def.checks?.some((c: any) => c.kind === 'int') && { type: 'integer' }),
            };

        case 'ZodBoolean':
            return { type: 'boolean', ...(def.description && { description: def.description }) };

        case 'ZodBigInt':
            return { type: 'number', ...(def.description && { description: def.description }) };

        case 'ZodDate':
            return { type: 'string', format: 'date-time', ...(def.description && { description: def.description }) };

        case 'ZodArray': {
            const itemSchema = zodToJsonSchema(def.type);
            return {
                type: 'array',
                items: itemSchema,
                ...(def.description && { description: def.description }),
                ...(def.minLength && { minItems: def.minLength.value }),
                ...(def.maxLength && { maxItems: def.maxLength.value }),
            };
        }

        case 'ZodObject': {
            const properties: Record<string, unknown> = {};
            const required: string[] = [];

            for (const [key, shape] of Object.entries(def.shape ?? {})) {
                const schema = shape as ZodType;
                properties[key] = zodToJsonSchema(schema);

                // Check if required
                const shapeDef = (schema as any)._def;
                if (shapeDef.typeName !== 'ZodOptional' && shapeDef.typeName !== 'ZodNullable') {
                    required.push(key);
                }
            }

            return {
                type: 'object',
                properties,
                ...(required.length > 0 && { required }),
                ...(def.description && { description: def.description }),
                additionalProperties: true,
            };
        }

        case 'ZodEnum':
            return {
                type: 'string',
                enum: def.values,
                ...(def.description && { description: def.description }),
            };

        case 'ZodLiteral':
            return {
                const: def.value,
                ...(def.description && { description: def.description }),
            };

        case 'ZodOptional':
        case 'ZodNullable':
            return zodToJsonSchema(def.innerType);

        case 'ZodUnion':
        case 'ZodDiscriminatedUnion': {
            const schemas = (def.options ?? def._innerTypes ?? []).map((s: ZodType) => zodToJsonSchema(s));
            return {
                oneOf: schemas,
                ...(def.description && { description: def.description }),
            };
        }

        case 'ZodRecord':
            return {
                type: 'object',
                additionalProperties: def.valueType ? zodToJsonSchema(def.valueType) : true,
                ...(def.description && { description: def.description }),
            };

        case 'ZodTuple': {
            const schemas = def.items.map((s: ZodType) => zodToJsonSchema(s));
            return {
                type: 'array',
                prefixItems: schemas,
                minItems: schemas.length,
                maxItems: schemas.length,
                ...(def.description && { description: def.description }),
            };
        }

        case 'ZodAny':
        case 'ZodUnknown':
            return { ...(def.description && { description: def.description }) };

        case 'ZodDefault':
            return {
                ...zodToJsonSchema(def.innerType),
                default: def.defaultValue,
            };

        default:
            // Fallback for unknown types
            return { type: 'object', additionalProperties: true };
    }
}

/**
 * Convert a framework Tool to LLM tool definition
 * Uses proper Zod-to-JSON-Schema conversion
 */
export function toolToLLMDef(tool: Tool<ToolParameters, unknown>): LLMToolDefinition {
    const jsonSchema = zodToJsonSchema(tool.parameters as ZodType);

    return {
        name: tool.name,
        description: tool.description,
        parameters: jsonSchema,
    };
}
