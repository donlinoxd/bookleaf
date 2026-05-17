import { eq, and, desc, sql, count } from 'drizzle-orm';
import { db } from '../db';
import { fines, borrowingRecords, resourceCopies, resources, users } from '../db/schema';

export interface FinesSummary {
  total_fines: number;
  total_collected: number;
  total_pending: number;
  fine_count: number;
  paid_count: number;
  unpaid_count: number;
}

export interface FineDetailRow {
  fine_id: number;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  member_name: string;
  member_id_number: string;
  book_title: string;
  borrowed_at: string;
  due_date: string;
  returned_at: string | null;
}

export interface FineMonthlyRow {
  month: string;
  label: string;
  collected: number;
}

export interface FineDebtorRow {
  user_id: number;
  user_name: string;
  user_id_number: string;
  total_fines: number;
  pending: number;
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

export const FinesReportService = {
  async getSummary(institutionId: number): Promise<FinesSummary> {
    const [row] = await db
      .select({
        total_fines: sql<number>`COALESCE(SUM(${fines.amount}), 0)`,
        total_collected: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 1 THEN ${fines.amount} ELSE 0 END), 0)`,
        total_pending: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 0 THEN ${fines.amount} ELSE 0 END), 0)`,
        fine_count: count(fines.id),
        paid_count: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 1 THEN 1 ELSE 0 END), 0)`,
        unpaid_count: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 0 THEN 1 ELSE 0 END), 0)`,
      })
      .from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(eq(resources.institution_id, institutionId));

    return {
      total_fines: Number(row?.total_fines ?? 0),
      total_collected: Number(row?.total_collected ?? 0),
      total_pending: Number(row?.total_pending ?? 0),
      fine_count: Number(row?.fine_count ?? 0),
      paid_count: Number(row?.paid_count ?? 0),
      unpaid_count: Number(row?.unpaid_count ?? 0),
    };
  },

  async getMonthlyCollection(institutionId: number, months = 6): Promise<FineMonthlyRow[]> {
    const rows = await db
      .select({
        month: sql<string>`strftime('%Y-%m', ${fines.paid_at})`,
        collected: sql<number>`SUM(${fines.amount})`,
      })
      .from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(
        and(
          eq(resources.institution_id, institutionId),
          eq(fines.paid, true),
          sql`${fines.paid_at} IS NOT NULL`,
          sql`${fines.paid_at} >= datetime('now', ${`-${months} months`})`,
        ),
      )
      .groupBy(sql`strftime('%Y-%m', ${fines.paid_at})`)
      .orderBy(sql`strftime('%Y-%m', ${fines.paid_at})`);

    return rows
      .filter((r) => r.month)
      .map((r) => ({ month: r.month, label: monthLabel(r.month), collected: Number(r.collected) }));
  },

  async getTopDebtors(institutionId: number, limit = 10): Promise<FineDebtorRow[]> {
    const rows = await db
      .select({
        user_id: users.id,
        user_name: users.name,
        user_id_number: users.id_number,
        total_fines: sql<number>`SUM(${fines.amount})`,
        pending: sql<number>`SUM(CASE WHEN ${fines.paid} = 0 THEN ${fines.amount} ELSE 0 END)`,
      })
      .from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .innerJoin(users, eq(borrowingRecords.user_id, users.id))
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(eq(resources.institution_id, institutionId), eq(fines.paid, false)))
      .groupBy(users.id)
      .orderBy(desc(sql`SUM(${fines.amount})`))
      .limit(limit);

    return rows.map((r) => ({
      user_id: r.user_id,
      user_name: r.user_name,
      user_id_number: r.user_id_number,
      total_fines: Number(r.total_fines),
      pending: Number(r.pending),
    }));
  },

  async getDetails(institutionId: number, limit = 50): Promise<FineDetailRow[]> {
    const rows = await db
      .select({
        fine_id: fines.id,
        amount: fines.amount,
        paid: fines.paid,
        paid_at: fines.paid_at,
        member_name: users.name,
        member_id_number: users.id_number,
        book_title: resources.title,
        borrowed_at: borrowingRecords.borrowed_at,
        due_date: borrowingRecords.due_date,
        returned_at: borrowingRecords.returned_at,
      })
      .from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .innerJoin(users, eq(borrowingRecords.user_id, users.id))
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(eq(resources.institution_id, institutionId))
      .orderBy(desc(fines.id))
      .limit(limit);

    return rows.map((r) => ({ ...r, paid: Boolean(r.paid) }));
  },
};
