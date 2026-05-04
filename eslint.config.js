/**
 * ESLint flat config with `eslint-plugin-boundaries`.
 *
 * Enforces the zero-dependency contract on the core/contracts modules:
 *   src/contracts/  — must not import from providers, plugins, or any external package
 *   src/core/       — must not import from providers, plugins, or adapters
 *
 * Install once:
 *   bun add -D eslint eslint-plugin-boundaries @typescript-eslint/parser
 *
 * Run:
 *   bunx eslint src/contracts src/core --max-warnings 0
 */

import boundaries from 'eslint-plugin-boundaries';
import tsParser from '@typescript-eslint/parser';
import tseslint from 'typescript-eslint';
const packageTypeCheckedConfigs = tseslint.configs.strictTypeChecked.map((cfg) => ({
  ...cfg,
  files: ['packages/**/src/**/*.ts', 'packages/**/tests/**/*.ts'],
  languageOptions: {
    ...(cfg.languageOptions ?? {}),
    parser: tsParser,
    parserOptions: {
      ...(cfg.languageOptions?.parserOptions ?? {}),
      project: './tsconfig.eslint.json',
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

export default [
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    languageOptions: { parser: tsParser },
    settings: {
      'boundaries/elements': [
        // Zero-dependency core modules — these are the inner ring
        { type: 'contracts',    pattern: 'src/contracts/**' },
        { type: 'core',         pattern: 'src/core/**' },
        // Framework modules — may import from core
        { type: 'graph',        pattern: 'src/graph/**' },
        { type: 'execution',    pattern: 'src/execution/**' },
        { type: 'memory',       pattern: 'src/memory/**' },
        { type: 'session',      pattern: 'src/session/**' },
        { type: 'orchestration',pattern: 'src/orchestration/**' },
        { type: 'production',   pattern: 'src/production/**' },
        { type: 'guardrails',   pattern: 'src/guardrails/**' },
        { type: 'agentic',      pattern: 'src/agentic/**' },
        { type: 'tools',        pattern: 'src/tools/**' },
        { type: 'observability',pattern: 'src/observability/**' },
        { type: 'testing',      pattern: 'src/testing/**' },
        // Adapter/provider layer — external deps live here
        { type: 'adapters',     pattern: 'src/adapters/**' },
        { type: 'providers',    pattern: 'src/providers/**' },
        { type: 'plugins',      pattern: 'src/plugins/**' },
      ],
      'boundaries/ignore': [
        // Allow all imports in test files
        '**/*.test.ts',
        '**/tests/**',
        '**/benchmarks/**',
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            // contracts must not import anything from the framework
            {
              from: 'contracts',
              disallow: [
                'core', 'graph', 'execution', 'memory', 'session',
                'orchestration', 'production', 'guardrails', 'agentic',
                'tools', 'observability', 'adapters', 'providers', 'plugins',
              ],
              message: 'src/contracts/ is a zero-dep interface module — no framework imports allowed.',
            },
            // core must not import from adapters / providers / plugins
            {
              from: 'core',
              disallow: ['adapters', 'providers', 'plugins'],
              message: 'src/core/ must remain dependency-free of adapter/provider/plugin layers.',
            },
          ],
        },
      ],
    },
  },
  // Strict rules for new packages/ workspace (Phase 1+ of production-readiness plan).
  {
    files: ['packages/**/src/**/*.ts'],
    languageOptions: { parser: tsParser },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // typescript-eslint strict-type-checked for packages only.
  // Every inherited config is explicitly scoped so typed rules never apply to legacy src/.
  ...packageTypeCheckedConfigs,
  {
    files: ['packages/**/src/**/*.ts', 'packages/**/tests/**/*.ts'],
    rules: {
      // Floating promises must be handled explicitly
      '@typescript-eslint/no-floating-promises': 'error',
      // Non-null assertions: warn (types are well-constrained in packages/)
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // No any — packages/ must be fully typed
      '@typescript-eslint/no-explicit-any': 'error',
      // Unused vars ok if prefixed with _
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/cli/src/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
