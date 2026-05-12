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
            'packages/*/*/tests/**/*.test.ts',
            'packages/*/*/src/**/*.test.ts',
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
                'packages/foundation/contracts/src/**/*.ts',
                'packages/platform/guard/src/**/*.ts',
                'packages/platform/observe/src/**/*.ts',
                'packages/platform/serve/src/**/*.ts',
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
                'src/adapters/**',
                'src/dx/**',
                'src/runtime/**',
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
        
        // Reporter configuration
        reporters: ['verbose'],
        
        // Global setup/teardown
        globalSetup: undefined,
    },
    
    // Resolve aliases matching tsconfig
    resolve: {
        alias: {
            '@': './src',
            // foundation
            '@confused-ai/contracts': new URL('./src/contracts/index.ts', import.meta.url).pathname,
            '@confused-ai/shared': new URL('./src/shared/index.ts', import.meta.url).pathname,
            // runtime
            '@confused-ai/core': new URL('./src/core/index.ts', import.meta.url).pathname,
            '@confused-ai/agentic': new URL('./src/agentic/index.ts', import.meta.url).pathname,
            '@confused-ai/graph': new URL('./src/graph/index.ts', import.meta.url).pathname,
            '@confused-ai/workflow': new URL('./src/workflow/index.ts', import.meta.url).pathname,
            '@confused-ai/orchestration': new URL('./src/orchestration/index.ts', import.meta.url).pathname,
            '@confused-ai/execution': new URL('./src/execution/index.ts', import.meta.url).pathname,
            '@confused-ai/planner': new URL('./src/planner/index.ts', import.meta.url).pathname,
            '@confused-ai/reasoning': new URL('./src/reasoning/index.ts', import.meta.url).pathname,
            '@confused-ai/scheduler': new URL('./src/scheduler/index.ts', import.meta.url).pathname,
            '@confused-ai/background': new URL('./src/background/index.ts', import.meta.url).pathname,
            // providers
            '@confused-ai/models': new URL('./src/models/index.ts', import.meta.url).pathname,
            '@confused-ai/router': new URL('./src/router/index.ts', import.meta.url).pathname,
            // state
            '@confused-ai/db': new URL('./src/db/index.ts', import.meta.url).pathname,
            '@confused-ai/session': new URL('./src/session/index.ts', import.meta.url).pathname,
            '@confused-ai/memory': new URL('./src/memory/index.ts', import.meta.url).pathname,
            '@confused-ai/knowledge': new URL('./src/knowledge/index.ts', import.meta.url).pathname,
            '@confused-ai/learning': new URL('./src/learning/index.ts', import.meta.url).pathname,
            '@confused-ai/storage': new URL('./src/storage/index.ts', import.meta.url).pathname,
            '@confused-ai/artifacts': new URL('./src/artifacts/index.ts', import.meta.url).pathname,
            '@confused-ai/adapter-redis': new URL('./src/adapter-redis/index.ts', import.meta.url).pathname,
            // tools-layer (subpaths must be listed before the barrel)
            '@confused-ai/tools/ai': new URL('./src/tools/ai/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/communication': new URL('./src/tools/communication/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/core': new URL('./src/tools/core/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/crm': new URL('./src/tools/crm/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/data': new URL('./src/tools/data/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/devtools': new URL('./src/tools/devtools/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/finance': new URL('./src/tools/finance/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/mcp': new URL('./src/tools/mcp/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/media': new URL('./src/tools/media/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/memory': new URL('./src/tools/memory/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/productivity': new URL('./src/tools/productivity/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/scraping': new URL('./src/tools/scraping/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/search': new URL('./src/tools/search/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/social': new URL('./src/tools/social/index.ts', import.meta.url).pathname,
            '@confused-ai/tools/utils': new URL('./src/tools/utils/index.ts', import.meta.url).pathname,
            '@confused-ai/tools': new URL('./src/tools/index.ts', import.meta.url).pathname,
            '@confused-ai/plugins': new URL('./src/plugins/index.ts', import.meta.url).pathname,
            // platform
            '@confused-ai/guard': new URL('./src/guard/index.ts', import.meta.url).pathname,
            '@confused-ai/guardrails': new URL('./src/guardrails/index.ts', import.meta.url).pathname,
            '@confused-ai/observe': new URL('./src/observe/index.ts', import.meta.url).pathname,
            '@confused-ai/production': new URL('./src/production/index.ts', import.meta.url).pathname,
            '@confused-ai/serve': new URL('./src/serve/index.ts', import.meta.url).pathname,
            '@confused-ai/config': new URL('./src/config/index.ts', import.meta.url).pathname,
            '@confused-ai/eval': new URL('./src/eval/index.ts', import.meta.url).pathname,
            '@confused-ai/context': new URL('./src/context/index.ts', import.meta.url).pathname,
            '@confused-ai/compression': new URL('./src/compression/index.ts', import.meta.url).pathname,
            // developer
            '@confused-ai/sdk': new URL('./src/sdk/index.ts', import.meta.url).pathname,
            '@confused-ai/cli': new URL('./src/cli/index.ts', import.meta.url).pathname,
            '@confused-ai/playground': new URL('./src/playground/index.ts', import.meta.url).pathname,
            '@confused-ai/test-utils/conformance': new URL('./src/test-utils/conformance.ts', import.meta.url).pathname,
            '@confused-ai/test-utils': new URL('./src/test-utils/index.ts', import.meta.url).pathname,
            '@confused-ai/skills': new URL('./src/skills/index.ts', import.meta.url).pathname,
            // extensions
            '@confused-ai/voice': new URL('./src/voice/index.ts', import.meta.url).pathname,
            '@confused-ai/video': new URL('./src/video/index.ts', import.meta.url).pathname,
        },
    },

    server: {
        watch: {
            ignored: ['**/node_modules/**', '**/dist/**'],
        },
    },
});
