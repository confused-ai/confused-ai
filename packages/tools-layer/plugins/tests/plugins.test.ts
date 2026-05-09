/**
 * @confused-ai/plugins — conformance tests.
 *
 * Covers: createPluginRegistry, createLoggingPlugin, createRateLimitPlugin.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    createPluginRegistry,
    createLoggingPlugin,
    createRateLimitPlugin,
} from '@confused-ai/plugins';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInput(prompt = 'hello') {
    return { prompt } as Parameters<ReturnType<typeof createPluginRegistry>['runBeforeHooks']>[0];
}

function makeOutput(state = 'done') {
    return {
        state,
        content: '',
        metadata: { durationMs: 50, tokensUsed: 10 },
    } as Parameters<ReturnType<typeof createPluginRegistry>['runAfterHooks']>[0];
}

function makeContext(agentId = 'agent-1') {
    return { agentId } as Parameters<ReturnType<typeof createPluginRegistry>['runBeforeHooks']>[1];
}

// ── createPluginRegistry ──────────────────────────────────────────────────────

describe('createPluginRegistry', () => {
    it('creates an empty registry', () => {
        const registry = createPluginRegistry();
        expect(registry.list()).toHaveLength(0);
    });

    it('register() adds a plugin', () => {
        const registry = createPluginRegistry();
        const plugin = createLoggingPlugin();
        registry.register(plugin);
        expect(registry.list()).toHaveLength(1);
    });

    it('get() retrieves plugin by id', () => {
        const registry = createPluginRegistry();
        const plugin = createLoggingPlugin();
        registry.register(plugin);
        expect(registry.get('builtin:logging')).toBe(plugin);
    });

    it('get() returns undefined for unknown id', () => {
        const registry = createPluginRegistry();
        expect(registry.get('unknown')).toBeUndefined();
    });

    it('register() throws on duplicate plugin id', () => {
        const registry = createPluginRegistry();
        registry.register(createLoggingPlugin());
        expect(() => registry.register(createLoggingPlugin())).toThrow(/already registered/);
    });

    it('unregister() removes plugin and returns true', () => {
        const registry = createPluginRegistry();
        registry.register(createLoggingPlugin());
        expect(registry.unregister('builtin:logging')).toBe(true);
        expect(registry.list()).toHaveLength(0);
    });

    it('unregister() returns false for unknown id', () => {
        const registry = createPluginRegistry();
        expect(registry.unregister('nope')).toBe(false);
    });

    it('list() returns all registered plugins', () => {
        const registry = createPluginRegistry();
        registry.register(createLoggingPlugin());
        registry.register(createRateLimitPlugin({ maxRpm: 100 }));
        expect(registry.list()).toHaveLength(2);
    });
});

// ── runBeforeHooks / runAfterHooks ────────────────────────────────────────────

describe('PluginRegistry hooks', () => {
    it('runBeforeHooks returns input when no hooks registered', async () => {
        const registry = createPluginRegistry();
        const input = makeInput();
        const result = await registry.runBeforeHooks(input, makeContext());
        expect(result).toEqual(input);
    });

    it('runAfterHooks returns output when no hooks registered', async () => {
        const registry = createPluginRegistry();
        const output = makeOutput();
        const result = await registry.runAfterHooks(output, makeContext());
        expect(result).toEqual(output);
    });

    it('runBeforeHooks calls plugin.beforeRun', async () => {
        const registry = createPluginRegistry();
        const beforeRun = vi.fn((input: ReturnType<typeof makeInput>) => input);
        registry.register({ id: 'test', name: 'Test', version: '1', beforeRun });
        await registry.runBeforeHooks(makeInput(), makeContext());
        expect(beforeRun).toHaveBeenCalledOnce();
    });

    it('runAfterHooks calls plugin.afterRun', async () => {
        const registry = createPluginRegistry();
        const afterRun = vi.fn((out: ReturnType<typeof makeOutput>) => out);
        registry.register({ id: 'test', name: 'Test', version: '1', afterRun });
        await registry.runAfterHooks(makeOutput(), makeContext());
        expect(afterRun).toHaveBeenCalledOnce();
    });

    it('runErrorHooks calls plugin.onError', async () => {
        const registry = createPluginRegistry();
        const onError = vi.fn();
        registry.register({ id: 'test', name: 'Test', version: '1', onError });
        const err = new Error('boom');
        await registry.runErrorHooks(err, makeContext());
        expect(onError).toHaveBeenCalledWith(err, expect.any(Object));
    });

    it('runErrorHooks does not throw when plugin.onError throws', async () => {
        const registry = createPluginRegistry();
        registry.register({
            id: 'bad',
            name: 'Bad',
            version: '1',
            onError: () => { throw new Error('plugin failed'); },
        });
        await expect(registry.runErrorHooks(new Error('x'), makeContext())).resolves.toBeUndefined();
    });
});

// ── getToolMiddleware ─────────────────────────────────────────────────────────

describe('PluginRegistry.getToolMiddleware', () => {
    it('returns empty array when no plugins have toolMiddleware', () => {
        const registry = createPluginRegistry();
        registry.register({ id: 'bare', name: 'Bare', version: '1' });
        expect(registry.getToolMiddleware()).toHaveLength(0);
    });

    it('returns middleware from all plugins that have it', () => {
        const registry = createPluginRegistry();
        registry.register(createLoggingPlugin());      // has toolMiddleware
        registry.register({ id: 'bare', name: 'Bare', version: '1' }); // no toolMiddleware
        expect(registry.getToolMiddleware()).toHaveLength(1);
    });
});

// ── createLoggingPlugin ───────────────────────────────────────────────────────

describe('createLoggingPlugin', () => {
    it('has expected id and name', () => {
        const plugin = createLoggingPlugin();
        expect(plugin.id).toBe('builtin:logging');
        expect(plugin.name).toBe('Logging Plugin');
    });

    it('beforeRun returns input unchanged', async () => {
        const plugin = createLoggingPlugin();
        const input = makeInput('test prompt');
        const result = await Promise.resolve(plugin.beforeRun!(input, makeContext()));
        expect(result).toEqual(input);
    });

    it('afterRun returns output unchanged', async () => {
        const plugin = createLoggingPlugin();
        const output = makeOutput('completed');
        const result = await Promise.resolve(plugin.afterRun!(output, makeContext()));
        expect(result).toEqual(output);
    });

    it('accepts a custom logger', () => {
        const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        const plugin = createLoggingPlugin(logger);
        expect(plugin).toBeDefined();
    });
});

// ── createRateLimitPlugin ─────────────────────────────────────────────────────

describe('createRateLimitPlugin', () => {
    it('has expected id', () => {
        const plugin = createRateLimitPlugin();
        expect(plugin.id).toBe('builtin:rate-limit');
    });

    it('allows requests under the limit', async () => {
        const plugin = createRateLimitPlugin({ maxRpm: 5 });
        const input = makeInput();
        const ctx = makeContext();
        for (let i = 0; i < 5; i++) {
            await expect(Promise.resolve(plugin.beforeRun!(input, ctx))).resolves.toBeDefined();
        }
    });

    it('throws when rate limit is exceeded', async () => {
        const plugin = createRateLimitPlugin({ maxRpm: 2 });
        const input = makeInput();
        const ctx = makeContext('agent-ratelimit');
        plugin.beforeRun!(input, ctx);
        plugin.beforeRun!(input, ctx);
        expect(() => plugin.beforeRun!(input, ctx)).toThrow(/Rate limit exceeded/);
    });

    it('isolates rate limits per agentId', () => {
        const plugin = createRateLimitPlugin({ maxRpm: 1 });
        const input = makeInput();
        plugin.beforeRun!(input, { agentId: 'agent-a' } as ReturnType<typeof makeContext>);
        // Different agent should be allowed
        expect(() => plugin.beforeRun!(input, { agentId: 'agent-b' } as ReturnType<typeof makeContext>)).not.toThrow();
    });
});
