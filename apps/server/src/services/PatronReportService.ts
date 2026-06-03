import { eq, and, isNull, isNotNull, sql, count, desc } from 'drizzle-orm';
import { db } from '@bookleaf/db';
import { users, borrowingRecords, resourceCopies, resources, gateLogs } from '@bookleaf/db';

export interface PatronOverview {
  total_members: number;
  active_members: number;
  inactive_members: number;
  active_borrowers: number;
  never_borrowed: number;
  total_staff: number;
}

export interface PatronByTypeRow {
  user_type: string;
  count: number;
  active: number;
}

export interface PatronByDepartmentRow {
  department: string;
  count: number;
  active_borrowers: number;
}

export interface PatronRegistrationRow {
  month: string;
  label: string;
  count: number;
}

export interface AttendanceMonthRow {
  month: string;
  label: string;
  unique_visitors: number;
  total_visits: number;
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

export const PatronReportService = {
  async getOverview(institutionId: number): Promise<PatronOverview> {
    const [totals] = await db
      .select({
        total_members: sql<number>`SUM(CASE WHEN ${users.role} = 'member' THEN 1 ELSE 0 END)`,
        active_members: sql<number>`SUM(CASE WHEN ${users.role} = 'member' AND ${users.is_active} = 1 THEN 1 ELSE 0 END)`,
        inactive_members: sql<number>`SUM(CASE WHEN ${users.role} = 'member' AND ${users.is_active} = 0 THEN 1 ELSE 0 END)`,
        total_staff: sql<number>`SUM(CASE WHEN ${users.role} IN ('admin','librarian') THEN 1 ELSE 0 END)`,
      })
      .from(users)
      .where(eq(users.institution_id, institutionId));

    const [borrowers] = await db
      .select({ active_borrowers: sql<number>`COUNT(DISTINCT ${borrowingRecords.user_id})` })
      .from(borrowingRecords)
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(eq(resources.institution_id, institutionId), isNull(borrowingRecords.returned_at)));

    const [neverBorrowed] = await db
      .select({ never_borrowed: count(users.id) })
      .from(users)
      .where(
        and(
          eq(users.institution_id, institutionId),
          eq(users.role, 'member'),
          sql`${users.id} NOT IN (SELECT DISTINCT ${borrowingRecords.user_id} FROM ${borrowingRecords})`,
        ),
      );

    return {
      total_members: Number(totals?.total_members ?? 0),
      active_members: Number(totals?.active_members ?? 0),
      inactive_members: Number(totals?.inactive_members ?? 0),
      active_borrowers: Number(borrowers?.active_borrowers ?? 0),
      never_borrowed: Number(neverBorrowed?.never_borrowed ?? 0),
      total_staff: Number(totals?.total_staff ?? 0),
    };
  },

  async getByType(institutionId: number): Promise<PatronByTypeRow[]> {
    const rows = await db
      .select({
        user_type: users.user_type,
        count: count(users.id),
        active: sql<number>`SUM(CASE WHEN ${users.is_active} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(users)
      .where(and(eq(users.institution_id, institutionId), eq(users.role, 'member'), isNotNull(users.user_type)))
      .groupBy(users.user_type)
      .orderBy(desc(count(users.id)));

    return rows.map((r) => ({
      user_type: r.user_type ?? 'unknown',
      count: Number(r.count),
      active: Number(r.active),
    }));
  },

  async getByDepartment(institutionId: number): Promise<PatronByDepartmentRow[]> {
    const rows = await db
      .select({
        department: users.department,
        count: count(users.id),
      })
      .from(users)
      .where(and(eq(users.institution_id, institutionId), eq(users.role, 'member'), isNotNull(users.department)))
      .groupBy(users.department)
      .orderBy(desc(count(users.id)));

    const activeBorrows = await db
      .select({ user_id: borrowingRecords.user_id })
      .from(borrowingRecords)
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(eq(resources.institution_id, institutionId), isNull(borrowingRecords.returned_at)));

    const activeSet = new Set(activeBorrows.map((r) => r.user_id));

    const membersByDept = await db
      .select({ department: users.department, user_id: users.id })
      .from(users)
      .where(and(eq(users.institution_id, institutionId), eq(users.role, 'member'), isNotNull(users.department)));

    const deptActiveBorrowers = new Map<string, number>();
    for (const m of membersByDept) {
      if (!m.department) continue;
      if (activeSet.has(m.user_id)) {
        deptActiveBorrowers.set(m.department, (deptActiveBorrowers.get(m.department) ?? 0) + 1);
      }
    }

    return rows
      .filter((r) => r.department)
      .map((r) => ({
        department: r.department!,
        count: Number(r.count),
        active_borrowers: deptActiveBorrowers.get(r.department!) ?? 0,
      }));
  },

  async getMonthlyRegistrations(institutionId: number, months = 6): Promise<PatronRegistrationRow[]> {
    const rows = await db
      .select({
        month: sql<string>`strftime('%Y-%m', ${users.created_at})`,
        count: count(users.id),
      })
      .from(users)
      .where(
        and(
          eq(users.institution_id, institutionId),
          eq(users.role, 'member'),
          sql`datetime(${users.created_at}) >= datetime('now', ${`-${months} months`})`,
        ),
      )
      .groupBy(sql`strftime('%Y-%m', ${users.created_at})`)
      .orderBy(sql`strftime('%Y-%m', ${users.created_at})`);

    return rows
      .filter((r) => r.month)
      .map((r) => ({ month: r.month, label: monthLabel(r.month), count: Number(r.count) }));
  },

  async getMonthlyAttendance(institutionId: number, months = 6): Promise<AttendanceMonthRow[]> {
    const rows = await db
      .select({
        month: sql<string>`strftime('%Y-%m', ${gateLogs.logged_at})`,
        unique_visitors: sql<number>`COUNT(DISTINCT ${gateLogs.user_id})`,
        total_visits: sql<number>`COUNT(*)`,
      })
      .from(gateLogs)
      .where(
        and(
          eq(gateLogs.institution_id, institutionId),
          eq(gateLogs.direction, 'in'),
          sql`datetime(${gateLogs.logged_at}) >= datetime('now', ${`-${months} months`})`,
        ),
      )
      .groupBy(sql`strftime('%Y-%m', ${gateLogs.logged_at})`)
      .orderBy(sql`strftime('%Y-%m', ${gateLogs.logged_at})`);

    return rows
      .filter((r) => r.month)
      .map((r) => ({
        month: r.month,
        label: monthLabel(r.month),
        unique_visitors: Number(r.unique_visitors),
        total_visits: Number(r.total_visits),
      }));
  },
};
