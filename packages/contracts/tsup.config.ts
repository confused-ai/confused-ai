import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/errors.ts', 'src/result.ts', 'src/adapters.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
