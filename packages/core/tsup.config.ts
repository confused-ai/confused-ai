import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index:  'src/index.ts',
    agent:  'src/agent.ts',
    runner: 'src/runner/index.ts',
    types:  'src/types.ts',
    errors: 'src/errors.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,   // code-split shared internals (runner, errors)
  sourcemap: true,
  clean: true,
  treeshake: true,
});
