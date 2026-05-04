/**
 * @confused-ai/tools — built-in HTTP client tool.
 *
 * SRP  — this file owns only the HTTP tool.
 * DIP  — returns the Tool interface; no class inheritance.
 * DS   — uses built-in fetch (zero deps). URL validation is O(1).
 */

import { z } from 'zod';
import { defineTool } from './types.js';

const HttpInputSchema = z.object({
  url:     z.string().url(),
  method:  z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body:    z.string().optional(),
  /** Timeout in ms. Default 30 000. */
  timeout: z.number().int().positive().max(120_000).optional(),
});

export const httpClient = defineTool({
  name:        'http_request',
  description: 'Make an HTTP request to any URL. Returns the response body as text.',
  parameters:  HttpInputSchema,
  async execute({ url, method, headers, body, timeout = 30_000 }) {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, timeout);

    try {
      const requestInit: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        signal:  controller.signal,
        ...(method !== 'GET' && method !== 'HEAD' && body !== undefined && { body }),
      };

      const response = await fetch(url, requestInit);

      const text = await response.text();
      return {
        status:  response.status,
        ok:      response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        body:    text,
      };
    } finally {
      clearTimeout(timer);
    }
  },
});
