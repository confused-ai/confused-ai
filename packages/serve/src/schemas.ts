/**
 * Common Zod schemas for HTTP endpoints. Importers may compose or extend.
 */
import { z } from 'zod';

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(32_768),
  sessionId: z.string().uuid().optional(),
  stream: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const RunRequestSchema = z.object({
  agent: z.string().min(1),
  input: z.string().min(1),
  sessionId: z.string().uuid().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  guards: z
    .object({
      maxSteps: z.number().int().positive().max(100).optional(),
      timeoutMs: z.number().int().positive().max(600_000).optional(),
      maxTokens: z.number().int().positive().optional(),
    })
    .optional(),
});

export type RunRequest = z.infer<typeof RunRequestSchema>;
