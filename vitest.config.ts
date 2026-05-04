import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Use Bun for fast TypeScript execution
        environment: 'node',
        // Use the test-specific tsconfig so test files get Node.js types
        typecheck: {
            tsconfig: './tsconfig.test.json',
        },
        
        // Test file patterns
        include: [
            'tests/**/*.test.ts',
            'src/**/*.test.ts',
            'packages/*/tests/**/*.test.ts',
            'packages/*/src/**/*.test.ts',
        ],

        // Benchmark file patterns
        benchmark: {
            include: ['benchmarks/**/*.bench.ts'],
        },
        
        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'json', 'html'],
            // Only measure coverage on the new packages/* code.
            // Legacy src/ is excluded: it ships untouched and has its own
            // integration test coverage via the existing tests/*.test.ts suite.
            // adapter-redis is excluded: tests require a live Redis instance
            // (skipped in CI) — coverage is tracked separately with testcontainers.
            include: [
                'packages/contracts/src/**/*.ts',
                'packages/guard/src/**/*.ts',
                'packages/observe/src/**/*.ts',
                'packages/serve/src/**/*.ts',
            ],
            exclude: [
                'node_modules/**',
                'dist/**',
                'tests/**',
                'benchmarks/**',
                'examples/**',
                'docs/**',
                'packages/**/dist/**',
                'packages/**/tests/**',
                '**/*.d.ts',
                '**/*.test.ts',
                '**/index.ts',
            ],
            // Phase 4 target: 80/75 on packages/* (Phase 3 complete; src/ excluded).
            thresholds: {
                lines: 80,
                functions: 75,
                branches: 75,
                statements: 80,
            },
        },
        
        // Timeout for async operations
        testTimeout: 30000,
        
        // Watch mode ignore patterns
        watchExclude: ['**/node_modules/**', '**/dist/**'],
        
        // Reporter configuration
        reporters: ['verbose'],
        
        // Global setup/teardown
        globalSetup: undefined,
    },
    
    // Resolve aliases matching tsconfig
    resolve: {
        alias: {
            '@': './src',
            '@confused-ai/contracts': new URL('./packages/contracts/src/index.ts', import.meta.url).pathname,
            '@confused-ai/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
            '@confused-ai/graph': new URL('./packages/graph/src/index.ts', import.meta.url).pathname,
            '@confused-ai/observe': new URL('./packages/observe/src/index.ts', import.meta.url).pathname,
            '@confused-ai/session': new URL('./packages/session/src/index.ts', import.meta.url).pathname,
            '@confused-ai/knowledge': new URL('./packages/knowledge/src/index.ts', import.meta.url).pathname,
            '@confused-ai/video': new URL('./packages/video/src/index.ts', import.meta.url).pathname,
            '@confused-ai/guard': new URL('./packages/guard/src/index.ts', import.meta.url).pathname,
            '@confused-ai/serve': new URL('./packages/serve/src/index.ts', import.meta.url).pathname,
            '@confused-ai/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
            '@confused-ai/scheduler': new URL('./packages/scheduler/src/index.ts', import.meta.url).pathname,
            '@confused-ai/compression': new URL('./packages/compression/src/index.ts', import.meta.url).pathname,
            '@confused-ai/context': new URL('./packages/context/src/index.ts', import.meta.url).pathname,
            '@confused-ai/storage': new URL('./packages/storage/src/index.ts', import.meta.url).pathname,
            '@confused-ai/reasoning': new URL('./packages/reasoning/src/index.ts', import.meta.url).pathname,
            '@confused-ai/config': new URL('./packages/config/src/index.ts', import.meta.url).pathname,
            '@confused-ai/memory': new URL('./packages/memory/src/index.ts', import.meta.url).pathname,
            '@confused-ai/planner': new URL('./packages/planner/src/index.ts', import.meta.url).pathname,
            '@confused-ai/artifacts': new URL('./packages/artifacts/src/index.ts', import.meta.url).pathname,
            '@confused-ai/production': new URL('./packages/production/src/index.ts', import.meta.url).pathname,
            '@confused-ai/agentic': new URL('./packages/agentic/src/index.ts', import.meta.url).pathname,
            '@confused-ai/guardrails': new URL('./packages/guardrails/src/index.ts', import.meta.url).pathname,
            '@confused-ai/tools': new URL('./packages/tools/src/index.ts', import.meta.url).pathname,
            '@confused-ai/orchestration': new URL('./packages/orchestration/src/index.ts', import.meta.url).pathname,
            '@confused-ai/execution': new URL('./packages/execution/src/index.ts', import.meta.url).pathname,
            '@confused-ai/background': new URL('./packages/background/src/index.ts', import.meta.url).pathname,
            '@confused-ai/eval': new URL('./packages/eval/src/index.ts', import.meta.url).pathname,
            '@confused-ai/learning': new URL('./packages/learning/src/index.ts', import.meta.url).pathname,
            '@confused-ai/voice': new URL('./packages/voice/src/index.ts', import.meta.url).pathname,
            '@confused-ai/plugins': new URL('./packages/plugins/src/index.ts', import.meta.url).pathname,
            '@confused-ai/sdk': new URL('./packages/sdk/src/index.ts', import.meta.url).pathname,
        },
    },
});
