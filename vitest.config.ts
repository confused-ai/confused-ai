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
        include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],

        // Benchmark file patterns
        benchmark: {
            include: ['benchmarks/**/*.bench.ts'],
        },
        
        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/**',
                'dist/**',
                'tests/**',
                'benchmarks/**',
                '**/*.d.ts',
            ],
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
        },
    },
});
