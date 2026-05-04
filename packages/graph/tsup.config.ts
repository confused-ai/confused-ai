import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // bullmq and ioredis are optional peer deps — never bundle them
  external: ['bullmq', 'ioredis', 'better-sqlite3'],
});
