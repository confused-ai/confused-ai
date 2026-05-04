/**
 * @confused-ai/tools — shell execution tool.
 *
 * SRP  — this file owns only the shell tool.
 * DIP  — uses defineTool abstraction; no class inheritance.
 *
 * ⚠  Security: NOT re-exported from the package barrel by default.
 *    Import explicitly: import { shell } from '@confused-ai/tools/shell'
 *    Callers should apply a command allow-list guardrail.
 *
 * Uses node:child_process.execFile — no shell expansion (no injection risk).
 * child_process is a Node built-in — zero external dependencies.
 */

import { z }          from 'zod';
import { execFile }   from 'node:child_process';
import { promisify }  from 'node:util';
import { defineTool } from './types.js';

const execFileAsync = promisify(execFile);

const ShellInputSchema = z.object({
  /** Command binary — e.g. "git", "npm". Never shell-expanded. */
  command: z.string().min(1),
  /** Positional args — passed directly to execFile (no shell injection risk). */
  args:    z.array(z.string()).default([]),
  /** Working directory. Defaults to process.cwd(). */
  cwd:     z.string().optional(),
  /** Timeout in ms. Default 30 000. Max 300 000 (5 min). */
  timeout: z.number().int().positive().max(300_000).default(30_000),
});

export const shell = defineTool({
  name:        'shell',
  description: 'Execute a shell command with arguments. Returns stdout and stderr. No shell expansion — args are passed directly to execFile.',
  parameters:  ShellInputSchema,

  async execute({ command, args, cwd, timeout }) {
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd:       cwd ?? process.cwd(),
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10 MB output cap
      });
      return {
        success:  true,
        stdout:   stdout.trim(),
        stderr:   stderr.trim(),
        exitCode: 0,
      };
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message: string };
      return {
        success:  false,
        stdout:   e.stdout?.trim() ?? '',
        stderr:   e.stderr?.trim() ?? e.message,
        exitCode: e.code ?? 1,
      };
    }
  },
});
