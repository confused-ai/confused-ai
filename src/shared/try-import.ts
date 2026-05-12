/**
 * Dynamically import an optional peer dependency.
 * Returns null (never throws) when the specifier is not installed.
 */
export async function tryImport<T>(specifier: string): Promise<T | null> {
  try {
    const mod = await import(specifier) as { default?: T } & Record<string, unknown>;
    // Handle both ESM default exports and CommonJS module.exports
    return ((mod.default ?? mod) as T);
  } catch {
    return null;
  }
}
