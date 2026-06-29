/**
 * Path-sandboxing helpers for filesystem tools.
 *
 * Prevents directory traversal (sibling-dir escape, absolute-path escape, `../`)
 * and symlink escapes. Use {@link resolveWithin} before any fs access in a tool.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';

function escapes(base: string, candidate: string): boolean {
  const rel = path.relative(base, candidate);
  return rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel);
}

/**
 * Resolve `target` strictly inside `baseDir`. Throws if the resolved path —
 * or its realpath (symlink target) — falls outside the root.
 */
export async function resolveWithin(baseDir: string, target: string): Promise<string> {
  // realpath the base too: the root itself may be a symlink.
  const base = await fs.realpath(path.resolve(baseDir)).catch(() => path.resolve(baseDir));
  const resolved = path.resolve(base, target);

  if (escapes(base, resolved)) {
    throw new Error(`Access denied: "${target}" is outside the sandbox root`);
  }

  // Symlink-escape guard: realpath the target, or (if it doesn't exist yet,
  // e.g. a file about to be written) the realpath of its nearest existing parent.
  let real: string;
  try {
    real = await fs.realpath(resolved);
  } catch {
    try {
      real = path.join(await fs.realpath(path.dirname(resolved)), path.basename(resolved));
    } catch {
      real = resolved;
    }
  }

  if (escapes(base, real)) {
    throw new Error(`Access denied: "${target}" resolves outside the sandbox root via symlink`);
  }
  return resolved;
}

/**
 * The default filesystem sandbox root. Honors `CONFUSED_AI_FS_ROOT`, else cwd.
 */
export function sandboxRoot(explicit?: string): string {
  return path.resolve(explicit ?? process.env.CONFUSED_AI_FS_ROOT ?? process.cwd());
}
