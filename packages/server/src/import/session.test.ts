import { describe, it, expect } from 'vitest';
import { createSessionStore } from './session';
import type { NormalizedRow } from './types';

const payload = { institutionId: 1, norms: new Map<number, NormalizedRow>(), verdicts: [] };

describe('session store', () => {
  it('stores and retrieves a session', () => {
    let t = 1000;
    let n = 0;
    const store = createSessionStore({ ttlMs: 5000, now: () => t, genId: () => `s${++n}` });
    const id = store.create(payload);
    expect(id).toBe('s1');
    expect(store.get(id)?.institutionId).toBe(1);
  });

  it('expires a session past its TTL', () => {
    let t = 1000;
    const store = createSessionStore({ ttlMs: 5000, now: () => t, genId: () => 'x' });
    const id = store.create(payload);
    t = 7000;
    expect(store.get(id)).toBeNull();
  });

  it('evicts a session on demand', () => {
    const store = createSessionStore({ ttlMs: 5000, now: () => 0, genId: () => 'x' });
    const id = store.create(payload);
    store.evict(id);
    expect(store.get(id)).toBeNull();
  });
});
