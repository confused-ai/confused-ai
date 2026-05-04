import { describe, it, expect } from 'vitest';
import { createCostOptimizedRouter, DEFAULT_COSTS } from '../src/index.js';

// Minimal stub LLMProvider
const stub = { generateText: async () => ({ text: '', finishReason: 'stop' as const }) };

const providers = new Map([
  ['gpt-4o',        stub],
  ['gpt-4o-mini',   stub],
  ['gemini-2.0-flash', stub],
  ['claude-3-haiku-20240307', stub],
]);

describe('createCostOptimizedRouter', () => {
  it('selects cheapest model by default', () => {
    const router = createCostOptimizedRouter({ providers });
    const { model } = router.select('hello');
    // gemini-2.0-flash at $0.10/1M is cheapest among providers
    expect(model).toBe('gemini-2.0-flash');
  });

  it('respects minCapability constraint', () => {
    const router = createCostOptimizedRouter({ providers, minCapability: 9 });
    const { model } = router.select('complex task');
    expect(model).toBe('gpt-4o');
  });

  it('respects minContextWindow constraint', () => {
    const router = createCostOptimizedRouter({ providers, minContextWindow: 200_000 });
    const { model } = router.select('long doc');
    // claude-3-haiku and gemini-2.0-flash both have 200k+; gemini is cheapest
    expect(['gemini-2.0-flash', 'claude-3-haiku-20240307']).toContain(model);
  });

  it('respects maxInputCostPerMillion constraint', () => {
    const router = createCostOptimizedRouter({ providers, maxInputCostPerMillion: 0.20 });
    const { model } = router.select('hello');
    expect(model).toBe('gemini-2.0-flash'); // $0.10
  });

  it('throws when no model meets constraints', () => {
    expect(() =>
      createCostOptimizedRouter({ providers, minCapability: 100 }),
    ).toThrow('No providers match');
  });

  it('selectForBudget picks most capable within budget', () => {
    const router = createCostOptimizedRouter({ providers });
    // maxUsd compares to inputPerMillion directly (same $/1M unit)
    // Budget $0.20/1M: fits gemini-2.0-flash ($0.10) + gpt-4o-mini ($0.15) + claude-haiku ($0.25 — excluded)
    // Most capable of gemini+gpt-mini is gpt-4o-mini (cap 7 vs 7, both qualify)
    const { model } = router.selectForBudget(0.20);
    expect(model).not.toBe('gpt-4o');          // $2.50/M — too expensive
    expect(['gpt-4o-mini', 'gemini-2.0-flash']).toContain(model);
  });

  it('selectForBudget throws when no model fits', () => {
    const router = createCostOptimizedRouter({ providers });
    // $0 budget — nothing fits
    expect(() => router.selectForBudget(0)).toThrow('No model fits');
  });

  it('routing decision has required fields', () => {
    const router = createCostOptimizedRouter({ providers });
    const decision = router.select('x');
    expect(decision).toHaveProperty('model');
    expect(decision).toHaveProperty('provider');
    expect(decision).toHaveProperty('cost');
    expect(decision).toHaveProperty('reason');
  });

  it('DEFAULT_COSTS contains key models', () => {
    expect(DEFAULT_COSTS.has('gpt-4o')).toBe(true);
    expect(DEFAULT_COSTS.has('claude-3-5-sonnet-20241022')).toBe(true);
    expect(DEFAULT_COSTS.has('gemini-2.0-flash')).toBe(true);
  });

  it('allows custom cost overrides', () => {
    const customCosts = new Map(DEFAULT_COSTS);
    customCosts.set('my-model', { inputPerMillion: 0.01, outputPerMillion: 0.02, contextWindow: 100_000, capability: 5 });
    const customProviders = new Map([...providers, ['my-model', stub]]);
    const router = createCostOptimizedRouter({ providers: customProviders, costs: customCosts });
    const { model } = router.select('test');
    expect(model).toBe('my-model'); // cheapest at $0.01/1M
  });
});
