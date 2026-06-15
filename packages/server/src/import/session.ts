import type { RowVerdict } from '@bookleaf/types';
import type { NormalizedRow } from './types';

export interface SessionPayload {
  institutionId: number;
  norms: Map<number, NormalizedRow>;
  verdicts: RowVerdict[];
}

interface Entry {
  payload: SessionPayload;
  expiresAt: number;
}

export interface SessionStoreOptions {
  ttlMs?: number;
  now?: () => number;
  genId?: () => string;
}

export interface SessionStore {
  create(payload: SessionPayload): string;
  get(id: string): SessionPayload | null;
  evict(id: string): void;
}

let counter = 0;
function defaultId(): string {
  counter += 1;
  return `imp_${counter.toString(36)}_${counter}`;
}

export function createSessionStore(opts: SessionStoreOptions = {}): SessionStore {
  const ttlMs = opts.ttlMs ?? 15 * 60 * 1000;
  const now = opts.now ?? (() => Date.now());
  const genId = opts.genId ?? defaultId;
  const entries = new Map<string, Entry>();

  function sweep(): void {
    const t = now();
    for (const [id, e] of entries) if (e.expiresAt <= t) entries.delete(id);
  }

  return {
    create(payload) {
      sweep();
      const id = genId();
      entries.set(id, { payload, expiresAt: now() + ttlMs });
      return id;
    },
    get(id) {
      const e = entries.get(id);
      if (!e) return null;
      if (e.expiresAt <= now()) { entries.delete(id); return null; }
      return e.payload;
    },
    evict(id) { entries.delete(id); },
  };
}
