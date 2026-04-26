import { describe, it, expect } from 'vitest';
import {
    getContextLimitForModel,
    resolveModelKeyForContextLimit,
    MODEL_CONTEXT_LIMITS,
} from '../src/providers/context-window-manager.js';

describe('context window limits', () => {
    it('strips provider prefix', () => {
        expect(resolveModelKeyForContextLimit('openai:gpt-4o')).toBe('gpt-4o');
        expect(resolveModelKeyForContextLimit('anthropic/claude-3-5-sonnet-20241022')).toBe(
            'anthropic/claude-3-5-sonnet-20241022'
        );
    });

    it('resolves gpt-4o and dated Claude ids', () => {
        expect(getContextLimitForModel('gpt-4o')).toBe(128_000);
        expect(getContextLimitForModel('openai:gpt-4o')).toBe(128_000);
        expect(getContextLimitForModel('claude-3-5-sonnet-20241022')).toBe(200_000);
        expect(getContextLimitForModel('anthropic/claude-3-5-sonnet-20241022')).toBe(200_000);
        expect(getContextLimitForModel('gemini-2.0-flash')).toBe(1_000_000);
    });

    it('uses explicit override', () => {
        expect(getContextLimitForModel('unknown-model', 50_000)).toBe(50_000);
    });

    it('falls back to default', () => {
        expect(getContextLimitForModel('totally-unknown-xyz')).toBe(MODEL_CONTEXT_LIMITS['__default__']);
    });
});
