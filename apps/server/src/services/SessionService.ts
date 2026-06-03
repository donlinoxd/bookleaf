import { eq, lt } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '@bookleaf/db';
import { sessions, users } from '@bookleaf/db';
import { UserRole } from '@bookleaf/types';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionPrincipal {
  user_id: number;
  institution_id: number;
  id_number: string;
  name: string;
  role: UserRole;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export const SessionService = {
  async create(userId: number): Promise<{ token: string; expires_at: string }> {
    const raw = await Crypto.getRandomBytesAsync(32);
    const token = bytesToHex(raw);
    const expires_at = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    await db.insert(sessions).values({ token, user_id: userId, expires_at });
    return { token, expires_at };
  },

  async validate(token: string): Promise<SessionPrincipal | null> {
    if (!token) return null;
    const row = await db.select({
      user_id: sessions.user_id,
      expires_at: sessions.expires_at,
      institution_id: users.institution_id,
      id_number: users.id_number,
      name: users.name,
      role: users.role,
      is_active: users.is_active,
    })
      .from(sessions)
      .innerJoin(users, eq(sessions.user_id, users.id))
      .where(eq(sessions.token, token))
      .limit(1)
      .then(r => r[0] ?? null);

    if (!row) return null;
    if (!row.is_active) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await db.delete(sessions).where(eq(sessions.token, token));
      return null;
    }

    return {
      user_id: row.user_id,
      institution_id: row.institution_id,
      id_number: row.id_number,
      name: row.name,
      role: row.role,
    };
  },

  async revoke(token: string): Promise<void> {
    if (!token) return;
    await db.delete(sessions).where(eq(sessions.token, token));
  },

  async cleanupExpired(): Promise<void> {
    await db.delete(sessions).where(lt(sessions.expires_at, new Date().toISOString()));
  },
};
