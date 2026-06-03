import { eq, desc, count, sql, and, gte, lte } from 'drizzle-orm';
import { db } from '@bookleaf/db';
import { resources, resourceCopies, borrowingRecords, fines } from '@bookleaf/db';

export interface ResourceReport {
  resource_id: number;
  title: string;
  author: string;
  borrow_count: number;
}

export interface FineReport {
  total_fines: number;
  total_collected: number;
  total_pending: number;
}

export const ReportService = {
  async mostBorrowed(institutionId: number, limit = 10): Promise<ResourceReport[]> {
    return db.select({
      resource_id: resources.id,
      title: resources.title,
      author: resources.author,
      borrow_count: count(borrowingRecords.id),
    }).from(resources)
      .leftJoin(resourceCopies, eq(resources.id, resourceCopies.resource_id))
      .leftJoin(borrowingRecords, eq(resourceCopies.id, borrowingRecords.copy_id))
      .where(eq(resources.institution_id, institutionId))
      .groupBy(resources.id)
      .orderBy(desc(count(borrowingRecords.id)))
      .limit(limit);
  },

  async finesSummary(institutionId: number, from?: string, to?: string): Promise<FineReport> {
    const conditions = [
      eq(resources.institution_id, institutionId),
      ...(from ? [gte(fines.paid_at, from)] : []),
      ...(to ? [lte(fines.paid_at, to)] : []),
    ];

    const row = await db.select({
      total_fines: sql<number>`COALESCE(SUM(${fines.amount}), 0)`,
      total_collected: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 1 THEN ${fines.amount} ELSE 0 END), 0)`,
      total_pending: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 0 THEN ${fines.amount} ELSE 0 END), 0)`,
    }).from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(...conditions))
      .then(r => r[0]);

    return row ?? { total_fines: 0, total_collected: 0, total_pending: 0 };
  },

  async inventorySummary(institutionId: number) {
    return db.select({
      total_resources: sql<number>`COUNT(DISTINCT ${resources.id})`,
      total_copies: sql<number>`COALESCE(SUM(${resources.total_copies}), 0)`,
      available_copies: sql<number>`COALESCE(SUM(${resources.available_copies}), 0)`,
      borrowed_copies: sql<number>`COALESCE(SUM(${resources.total_copies} - ${resources.available_copies}), 0)`,
    }).from(resources)
      .where(eq(resources.institution_id, institutionId))
      .then(r => r[0] ?? null);
  },
};
