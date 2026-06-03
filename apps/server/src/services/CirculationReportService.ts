import { eq, and, isNull, isNotNull, lt, sql, count, desc } from 'drizzle-orm';
import { db } from '@bookleaf/db';
import { borrowingRecords, resourceCopies, resources, users } from '@bookleaf/db';

export interface CirculationOverview {
  total_borrows: number;
  currently_borrowed: number;
  overdue: number;
  returned: number;
  active_borrowers: number;
}

export interface MonthlyTrendRow {
  month: string;      // 'YYYY-MM'
  label: string;      // 'Jan 2025'
  borrows: number;
  returns: number;
}

export interface TopBorrowerRow {
  user_id: number;
  user_name: string;
  user_id_number: string;
  total_borrows: number;
  active_borrows: number;
}

export interface MostBorrowedRow {
  resource_id: number;
  title: string;
  author: string;
  borrow_count: number;
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

function monthLabel(yyyymm: string): string {
  const [year, month] = yyyymm.split('-');
  return `${MONTH_LABELS[month] ?? month} ${year}`;
}

export const CirculationReportService = {
  async getOverview(institutionId: number): Promise<CirculationOverview> {
    const [totals] = await db
      .select({
        total_borrows: count(borrowingRecords.id),
        currently_borrowed: sql<number>`SUM(CASE WHEN ${borrowingRecords.returned_at} IS NULL THEN 1 ELSE 0 END)`,
        overdue: sql<number>`SUM(CASE WHEN ${borrowingRecords.returned_at} IS NULL AND datetime(${borrowingRecords.due_date}) < datetime('now') THEN 1 ELSE 0 END)`,
        returned: sql<number>`SUM(CASE WHEN ${borrowingRecords.returned_at} IS NOT NULL THEN 1 ELSE 0 END)`,
      })
      .from(borrowingRecords)
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(eq(resources.institution_id, institutionId));

    const [borrowerRow] = await db
      .select({ active_borrowers: sql<number>`COUNT(DISTINCT ${borrowingRecords.user_id})` })
      .from(borrowingRecords)
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(
        eq(resources.institution_id, institutionId),
        isNull(borrowingRecords.returned_at),
      ));

    return {
      total_borrows: Number(totals?.total_borrows ?? 0),
      currently_borrowed: Number(totals?.currently_borrowed ?? 0),
      overdue: Number(totals?.overdue ?? 0),
      returned: Number(totals?.returned ?? 0),
      active_borrowers: Number(borrowerRow?.active_borrowers ?? 0),
    };
  },

  async getMonthlyTrends(institutionId: number, months = 12): Promise<MonthlyTrendRow[]> {
    const borrowRows = await db
      .select({
        month: sql<string>`strftime('%Y-%m', ${borrowingRecords.borrowed_at})`,
        borrows: count(borrowingRecords.id),
      })
      .from(borrowingRecords)
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(
        eq(resources.institution_id, institutionId),
        sql`datetime(${borrowingRecords.borrowed_at}) >= datetime('now', ${`-${months} months`})`,
      ))
      .groupBy(sql`strftime('%Y-%m', ${borrowingRecords.borrowed_at})`)
      .orderBy(sql`strftime('%Y-%m', ${borrowingRecords.borrowed_at})`);

    const returnRows = await db
      .select({
        month: sql<string>`strftime('%Y-%m', ${borrowingRecords.returned_at})`,
        returns: count(borrowingRecords.id),
      })
      .from(borrowingRecords)
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(
        eq(resources.institution_id, institutionId),
        isNotNull(borrowingRecords.returned_at),
        sql`datetime(${borrowingRecords.returned_at}) >= datetime('now', ${`-${months} months`})`,
      ))
      .groupBy(sql`strftime('%Y-%m', ${borrowingRecords.returned_at})`)
      .orderBy(sql`strftime('%Y-%m', ${borrowingRecords.returned_at})`);

    // Merge into a unified month map
    const map = new Map<string, MonthlyTrendRow>();

    for (const r of borrowRows) {
      if (!r.month) continue;
      map.set(r.month, { month: r.month, label: monthLabel(r.month), borrows: Number(r.borrows), returns: 0 });
    }
    for (const r of returnRows) {
      if (!r.month) continue;
      const existing = map.get(r.month);
      if (existing) existing.returns = Number(r.returns);
      else map.set(r.month, { month: r.month, label: monthLabel(r.month), borrows: 0, returns: Number(r.returns) });
    }

    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  },

  async getTopBorrowers(institutionId: number, limit = 10): Promise<TopBorrowerRow[]> {
    const rows = await db
      .select({
        user_id: users.id,
        user_name: users.name,
        user_id_number: users.id_number,
        total_borrows: count(borrowingRecords.id),
        active_borrows: sql<number>`SUM(CASE WHEN ${borrowingRecords.returned_at} IS NULL THEN 1 ELSE 0 END)`,
      })
      .from(borrowingRecords)
      .innerJoin(users, eq(borrowingRecords.user_id, users.id))
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(eq(resources.institution_id, institutionId))
      .groupBy(users.id)
      .orderBy(desc(count(borrowingRecords.id)))
      .limit(limit);

    return rows.map((r) => ({
      user_id: r.user_id,
      user_name: r.user_name,
      user_id_number: r.user_id_number,
      total_borrows: Number(r.total_borrows),
      active_borrows: Number(r.active_borrows),
    }));
  },

  async getMostBorrowed(institutionId: number, limit = 10): Promise<MostBorrowedRow[]> {
    const rows = await db
      .select({
        resource_id: resources.id,
        title: resources.title,
        author: resources.author,
        borrow_count: count(borrowingRecords.id),
      })
      .from(resources)
      .leftJoin(resourceCopies, eq(resources.id, resourceCopies.resource_id))
      .leftJoin(borrowingRecords, eq(resourceCopies.id, borrowingRecords.copy_id))
      .where(eq(resources.institution_id, institutionId))
      .groupBy(resources.id)
      .orderBy(desc(count(borrowingRecords.id)))
      .limit(limit);

    return rows.map((r) => ({
      resource_id: r.resource_id,
      title: r.title,
      author: r.author,
      borrow_count: Number(r.borrow_count),
    }));
  },
};
