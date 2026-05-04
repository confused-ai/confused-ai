import { describe, it, expect } from 'vitest';
import {
  tenantScopedKey,
  userScopedKey,
  TenantBudgetEnforcer,
  type TenantContext,
} from '../src/tenant.js';
import { BudgetExceededError } from '../src/errors.js';

// ── key helpers ────────────────────────────────────────────────────────────

describe('tenantScopedKey', () => {
  it('builds a namespaced key', () => {
    expect(tenantScopedKey('t1', 'session', 's123')).toBe('tenant:t1:session:s123');
  });

  it('userScopedKey nests under user', () => {
    expect(userScopedKey('t1', 'u1', 'budget')).toBe('tenant:t1:user:u1:budget');
  });
});

// ── TenantBudgetEnforcer ───────────────────────────────────────────────────

function makeCache() {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string) { return (store.get(key) as T) ?? null; },
    async set<T>(key: string, value: T) { store.set(key, value); },
    async del(key: string) { store.delete(key); },
    async flush() { store.clear(); return 0; },
  };
}

const ctx: TenantContext = {
  tenantId: 'acme',
  userId: 'alice',
  roles: ['user'],
  budget: { maxUsdPerUser: 1.00, maxUsdPerTenant: 5.00 },
};

describe('TenantBudgetEnforcer', () => {
  it('allows spend within user limit', async () => {
    const enforcer = new TenantBudgetEnforcer(ctx, makeCache());
    await expect(enforcer.check(0.50)).resolves.toBeUndefined();
  });

  it('throws BudgetExceededError when user limit would be exceeded', async () => {
    const cache = makeCache();
    const enforcer = new TenantBudgetEnforcer(ctx, cache);
    await enforcer.record(0.90); // record 90 cents already spent
    await expect(enforcer.check(0.20)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('records spend and accumulates correctly', async () => {
    const cache = makeCache();
    const enforcer = new TenantBudgetEnforcer(ctx, cache);
    await enforcer.record(0.30);
    await enforcer.record(0.20);
    // 0.50 total — another 0.40 should succeed
    await expect(enforcer.check(0.40)).resolves.toBeUndefined();
    // but 0.60 should fail
    await expect(enforcer.check(0.60)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('throws BudgetExceededError when tenant limit would be exceeded', async () => {
    const cache = makeCache();
    const tenantCtx: TenantContext = {
      tenantId: 'acme',
      userId: 'bob',
      roles: ['user'],
      budget: { maxUsdPerUser: 100, maxUsdPerTenant: 0.10 },
    };
    const enforcer = new TenantBudgetEnforcer(tenantCtx, cache);
    await expect(enforcer.check(0.20)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('allows unlimited spend when no budget config is set', async () => {
    const unlimitedCtx: TenantContext = { tenantId: 't', userId: 'u', roles: [] };
    const enforcer = new TenantBudgetEnforcer(unlimitedCtx, makeCache());
    await expect(enforcer.check(9999)).resolves.toBeUndefined();
  });
});
