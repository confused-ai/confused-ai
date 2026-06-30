/**
 * Failure-mode / adversarial tests for the production resilience primitives.
 *
 * These complement the happy-path suites (budget.test, circuit-breaker.test,
 * rate-limiter.test) by pinning down behaviour under the conditions that
 * actually bite in production: a single oversized step, a circuit that flaps,
 * and concurrent contention on a limiter.
 */
import { describe, it, expect } from 'vitest';
import { BudgetEnforcer, BudgetExceededError } from '../src/production/budget.js';
import { CircuitBreaker, CircuitState } from '../src/production/circuit-breaker.js';
import { RateLimiter, RateLimitError } from '../src/production/rate-limiter.js';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('BudgetEnforcer — overshoot semantics', () => {
    // The run cap is a POST-STEP hard stop, not a pre-flight guard: addStepCost
    // records the step cost first, then throws. So a single step CAN push
    // runSpend past maxUsdPerRun before the throw. This test documents that —
    // if someone adds a pre-flight estimate, this assertion should change.
    it('a single oversized step overshoots maxUsdPerRun, then throws (no pre-flight)', () => {
        const enforcer = new BudgetEnforcer({ maxUsdPerRun: 0.1, onExceeded: 'throw' });
        let thrown: BudgetExceededError | undefined;
        try {
            // gpt-4: ~$30/1M in, $60/1M out → 1M+1M ≈ $90, vastly over $0.10
            enforcer.addStepCost('gpt-4', 1_000_000, 1_000_000);
        } catch (e) {
            thrown = e as BudgetExceededError;
        }
        expect(thrown).toBeInstanceOf(BudgetExceededError);
        // The cap was crossed BEFORE the throw — spend exceeds the limit, proving
        // a single step is not bounded to the limit.
        expect(thrown!.spentUsd).toBeGreaterThan(thrown!.limitUsd);
        expect(thrown!.cap).toBe('run');
    });

    it("does not throw under 'warn' even when over budget (action honoured)", () => {
        const enforcer = new BudgetEnforcer({ maxUsdPerRun: 0.1, onExceeded: 'warn' });
        expect(() => enforcer.addStepCost('gpt-4', 1_000_000, 1_000_000)).not.toThrow();
    });
});

describe('CircuitBreaker — flapping', () => {
    it('a single failure in HALF_OPEN re-opens the circuit (no premature close)', async () => {
        const cb = new CircuitBreaker({
            name: 'flap',
            failureThreshold: 2,
            successThreshold: 2,
            resetTimeoutMs: 20,
        });
        const boom = () => Promise.reject(new Error('down'));

        // Trip it: 2 failures → OPEN
        await cb.execute(boom);
        await cb.execute(boom);
        expect(cb.getState()).toBe(CircuitState.OPEN);

        // Wait out the reset window, then fail once. The next execute enters
        // HALF_OPEN on entry; the failure must send it straight back to OPEN,
        // NOT close it.
        await sleep(30);
        const result = await cb.execute(boom);
        expect(result.success).toBe(false);
        expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('recovers only after successThreshold consecutive successes in HALF_OPEN', async () => {
        const cb = new CircuitBreaker({
            name: 'recover',
            failureThreshold: 1,
            successThreshold: 2,
            resetTimeoutMs: 20,
        });
        await cb.execute(() => Promise.reject(new Error('down')));
        expect(cb.getState()).toBe(CircuitState.OPEN);

        await sleep(30);
        const ok = () => Promise.resolve('ok');
        await cb.execute(ok); // HALF_OPEN, 1 success — not enough
        expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
        await cb.execute(ok); // 2nd success → CLOSED
        expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
});

describe('RateLimiter — concurrent contention', () => {
    it('admits at most the capacity under a concurrent burst, rejects the rest', async () => {
        const CAPACITY = 5;
        const limiter = new RateLimiter({
            name: 'concurrent',
            maxRequests: CAPACITY,
            burstCapacity: 0, // exact capacity = maxRequests
            intervalMs: 60_000, // no refill mid-test
            overflowMode: 'reject',
        });

        const total = CAPACITY + 5;
        const results = await Promise.allSettled(
            Array.from({ length: total }, () => limiter.execute(() => Promise.resolve('ok'))),
        );

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        expect(fulfilled).toHaveLength(CAPACITY);
        expect(rejected).toHaveLength(total - CAPACITY);
        // Every rejection is a real rate-limit rejection, not an unrelated error.
        for (const r of rejected) {
            expect((r as PromiseRejectedResult).reason).toBeInstanceOf(RateLimitError);
        }
    });

    it('tryAcquire grants exactly the capacity, no more', () => {
        const CAPACITY = 3;
        const limiter = new RateLimiter({
            name: 'try',
            maxRequests: CAPACITY,
            burstCapacity: 0,
            intervalMs: 60_000,
        });
        const grants = Array.from({ length: CAPACITY + 4 }, () => limiter.tryAcquire());
        expect(grants.filter(Boolean)).toHaveLength(CAPACITY);
    });
});
