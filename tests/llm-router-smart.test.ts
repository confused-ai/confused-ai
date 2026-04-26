import { describe, it, expect } from 'vitest';
import type { LLMProvider, Message } from '../src/providers/types.js';
import {
    createSmartRouter,
    scoreTaskTypesForRouting,
    LLMRouter,
} from '../src/providers/router.js';
import type { RouteContext } from '../src/providers/router.js';

function stubProvider(): LLMProvider {
    return {
        async generateText() {
            return { text: '' };
        },
    };
}

function ctxBase(overrides: Partial<RouteContext> = {}): RouteContext {
    return {
        messages: [],
        detectedTask: 'simple',
        detectedComplexity: 'low',
        estimatedTokens: 100,
        hasTools: false,
        hasMultimodal: false,
        ...overrides,
    };
}

describe('scoreTaskTypesForRouting', () => {
    it('prefers coding for implementation prompts', () => {
        const s = scoreTaskTypesForRouting(
            'Implement a binary search in TypeScript with generics',
            ctxBase({ estimatedTokens: 80 })
        );
        expect(s.coding).toBeGreaterThan(s.simple);
        expect(s.coding).toBeGreaterThanOrEqual(s.reasoning);
    });

    it('prefers reasoning for proof-style language', () => {
        const s = scoreTaskTypesForRouting(
            'Prove by induction that the sum formula holds',
            ctxBase({ estimatedTokens: 50 })
        );
        expect(s.reasoning).toBeGreaterThan(s.coding);
    });

    it('boosts long_context for large token estimates', () => {
        const s = scoreTaskTypesForRouting('What is the main theme?', ctxBase({ estimatedTokens: 15_000 }));
        expect(s.long_context).toBeGreaterThan(5);
    });
});

describe('createSmartRouter (adaptive)', () => {
    it('routes trivial chat to the cheapest capable entry', async () => {
        const router = createSmartRouter([
            {
                provider: stubProvider(),
                model: 'nano',
                capabilities: ['simple'],
                costTier: 'nano',
                speedTier: 'fast',
                contextWindow: 8_000,
            },
            {
                provider: stubProvider(),
                model: 'frontier',
                capabilities: ['simple', 'coding', 'reasoning'],
                costTier: 'frontier',
                speedTier: 'slow',
                contextWindow: 200_000,
            },
        ]);

        await router.generateText([{ role: 'user', content: 'Say hi in one word.' }] as Message[]);
        expect(router.getLastRouteDecision()?.model).toBe('nano');
        expect(router.getLastRouteDecision()?.detectedTask).toBe('simple');
    });

    it('routes coding prompts to a coding-capable model', async () => {
        const router = createSmartRouter([
            {
                provider: stubProvider(),
                model: 'nano',
                capabilities: ['simple'],
                costTier: 'nano',
                speedTier: 'fast',
            },
            {
                provider: stubProvider(),
                model: 'coder',
                capabilities: ['simple', 'coding'],
                costTier: 'medium',
                speedTier: 'medium',
            },
        ]);

        await router.generateText([
            { role: 'user', content: 'Debug this async function:\n```ts\nconst x = await foo();\n```' },
        ] as Message[]);
        expect(router.getLastRouteDecision()?.detectedTask).toBe('coding');
        expect(router.getLastRouteDecision()?.model).toBe('coder');
    });

    it('supports strategy adaptive via LLMRouter constructor', async () => {
        const router = new LLMRouter({
            strategy: 'adaptive',
            entries: [
                {
                    provider: stubProvider(),
                    model: 'a',
                    capabilities: ['simple'],
                    costTier: 'small',
                    speedTier: 'fast',
                },
                {
                    provider: stubProvider(),
                    model: 'b',
                    capabilities: ['simple', 'coding'],
                    costTier: 'medium',
                    speedTier: 'medium',
                },
            ],
        });
        await router.generateText([{ role: 'user', content: '2+2?' }] as Message[]);
        expect(router.getLastRouteDecision()?.strategy).toBe('adaptive');
    });
});
