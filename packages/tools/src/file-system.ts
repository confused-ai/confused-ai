/**
 * @confused-ai/tools — file system tool.
 * Uses built-in node:fs/promises — zero external deps.
 */

import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defineTool } from './types.js';

const FsInputSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('read'),   filePath: z.string() }),
  z.object({ operation: z.literal('write'),  filePath: z.string(), content: z.string() }),
  z.object({ operation: z.literal('append'), filePath: z.string(), content: z.string() }),
  z.object({ operation: z.literal('delete'), filePath: z.string() }),
  z.object({ operation: z.literal('list'),   dirPath:  z.string() }),
  z.object({ operation: z.literal('exists'), filePath: z.string() }),
]);

export const fileSystem = defineTool({
  name:        'file_system',
  description: 'Read, write, append, delete files or list directories on the local filesystem.',
  parameters:  FsInputSchema,
  async execute(input) {
    switch (input.operation) {
      case 'read': {
        const content = await fs.readFile(path.resolve(input.filePath), 'utf-8');
        return { content, bytes: Buffer.byteLength(content) };
      }
      case 'write': {
        await fs.mkdir(path.dirname(path.resolve(input.filePath)), { recursive: true });
        await fs.writeFile(path.resolve(input.filePath), input.content, 'utf-8');
        return { written: true, bytes: Buffer.byteLength(input.content) };
      }
      case 'append': {
        await fs.appendFile(path.resolve(input.filePath), input.content, 'utf-8');
        return { appended: true };
      }
      case 'delete': {
        await fs.unlink(path.resolve(input.filePath));
        return { deleted: true };
      }
      case 'list': {
        const entries = await fs.readdir(path.resolve(input.dirPath), { withFileTypes: true });
        // Sort: directories first, then files (both alphabetically) — O(n log n)
        return entries
          .sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
          .map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }));
      }
      case 'exists': {
        const exists = await fs.access(path.resolve(input.filePath)).then(() => true).catch(() => false);
        return { exists };
      }
    }
  },
});
