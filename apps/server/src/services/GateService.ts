import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '@bookleaf/db';
import { gateLogs, users } from '@bookleaf/db';
import { GateDirection, GateMethod, GateLog } from '@bookleaf/types';

export const GateService = {
  async getLastDirection(userId: number): Promise<GateDirection | null> {
    const row = await db
      .select({ direction: gateLogs.direction })
      .from(gateLogs)
      .where(eq(gateLogs.user_id, userId))
      .orderBy(desc(gateLogs.logged_at))
      .limit(1)
      .then((r) => r[0] ?? null);
    return row ? (row.direction as GateDirection) : null;
  },

  async logEntry(
    userId: number,
    institutionId: number,
    method: GateMethod,
  ): Promise<{ direction: GateDirection; logged_at: string }> {
    const last = await GateService.getLastDirection(userId);
    const direction: GateDirection = last === 'in' ? 'out' : 'in';
    const logged_at = new Date().toISOString().replace('T', ' ').slice(0, 19);

    await db.insert(gateLogs).values({
      institution_id: institutionId,
      user_id: userId,
      direction,
      method,
      logged_at,
    });

    return { direction, logged_at };
  },

  async getTodayLogs(institutionId: number): Promise<GateLog[]> {
    const today = new Date().toISOString().slice(0, 10);
    return db
      .select({
        id: gateLogs.id,
        institution_id: gateLogs.institution_id,
        user_id: gateLogs.user_id,
        direction: gateLogs.direction,
        method: gateLogs.method,
        logged_at: gateLogs.logged_at,
        user_name: users.name,
        user_id_number: users.id_number,
        user_role: users.role,
      })
      .from(gateLogs)
      .innerJoin(users, eq(gateLogs.user_id, users.id))
      .where(
        and(
          eq(gateLogs.institution_id, institutionId),
          sql`date(${gateLogs.logged_at}) = ${today}`,
        ),
      )
      .orderBy(desc(gateLogs.logged_at)) as Promise<GateLog[]>;
  },

  async getLogsByDate(institutionId: number, date: string): Promise<GateLog[]> {
    return db
      .select({
        id: gateLogs.id,
        institution_id: gateLogs.institution_id,
        user_id: gateLogs.user_id,
        direction: gateLogs.direction,
        method: gateLogs.method,
        logged_at: gateLogs.logged_at,
        user_name: users.name,
        user_id_number: users.id_number,
        user_role: users.role,
      })
      .from(gateLogs)
      .innerJoin(users, eq(gateLogs.user_id, users.id))
      .where(
        and(
          eq(gateLogs.institution_id, institutionId),
          sql`date(${gateLogs.logged_at}) = ${date}`,
        ),
      )
      .orderBy(desc(gateLogs.logged_at)) as Promise<GateLog[]>;
  },

  async getTodayCount(institutionId: number): Promise<{ total: number; inside: number }> {
    const logs = await GateService.getTodayLogs(institutionId);
    const total = new Set(logs.map((l) => l.user_id)).size;
    // Users currently inside = last log is 'in'
    const byUser = new Map<number, GateDirection>();
    // logs ordered desc, so iterate reversed to get latest-first per user
    for (const l of logs) {
      if (!byUser.has(l.user_id)) byUser.set(l.user_id, l.direction as GateDirection);
    }
    const inside = [...byUser.values()].filter((d) => d === 'in').length;
    return { total, inside };
  },
};
