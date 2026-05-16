import { eq, desc, count, sql, and, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { books, bookCopies, borrowingRecords, fines } from '../db/schema';

export interface BookReport {
  book_id: number;
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
  async mostBorrowed(institutionId: number, limit = 10): Promise<BookReport[]> {
    return db.select({
      book_id: books.id,
      title: books.title,
      author: books.author,
      borrow_count: count(borrowingRecords.id),
    }).from(books)
      .leftJoin(bookCopies, eq(books.id, bookCopies.book_id))
      .leftJoin(borrowingRecords, eq(bookCopies.id, borrowingRecords.copy_id))
      .where(eq(books.institution_id, institutionId))
      .groupBy(books.id)
      .orderBy(desc(count(borrowingRecords.id)))
      .limit(limit);
  },

  async finesSummary(institutionId: number, from?: string, to?: string): Promise<FineReport> {
    const conditions = [
      eq(books.institution_id, institutionId),
      ...(from ? [gte(fines.paid_at, from)] : []),
      ...(to ? [lte(fines.paid_at, to)] : []),
    ];

    const row = await db.select({
      total_fines: sql<number>`COALESCE(SUM(${fines.amount}), 0)`,
      total_collected: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 1 THEN ${fines.amount} ELSE 0 END), 0)`,
      total_pending: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 0 THEN ${fines.amount} ELSE 0 END), 0)`,
    }).from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .innerJoin(bookCopies, eq(borrowingRecords.copy_id, bookCopies.id))
      .innerJoin(books, eq(bookCopies.book_id, books.id))
      .where(and(...conditions))
      .then(r => r[0]);

    return row ?? { total_fines: 0, total_collected: 0, total_pending: 0 };
  },

  async inventorySummary(institutionId: number) {
    return db.select({
      total_books: sql<number>`COUNT(DISTINCT ${books.id})`,
      total_copies: sql<number>`COALESCE(SUM(${books.total_copies}), 0)`,
      available_copies: sql<number>`COALESCE(SUM(${books.available_copies}), 0)`,
      borrowed_copies: sql<number>`COALESCE(SUM(${books.total_copies} - ${books.available_copies}), 0)`,
    }).from(books)
      .where(eq(books.institution_id, institutionId))
      .then(r => r[0] ?? null);
  },
};
