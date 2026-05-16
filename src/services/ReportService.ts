import { getDatabase } from '../db/database';

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
    const db = await getDatabase();
    return db.getAllAsync<BookReport>(
      `SELECT b.id as book_id, b.title, b.author, COUNT(br.id) as borrow_count
       FROM books b
       LEFT JOIN book_copies bc ON b.id = bc.book_id
       LEFT JOIN borrowing_records br ON bc.id = br.copy_id
       WHERE b.institution_id = ?
       GROUP BY b.id ORDER BY borrow_count DESC LIMIT ?`,
      [institutionId, limit]
    );
  },

  async finesSummary(institutionId: number, from?: string, to?: string): Promise<FineReport> {
    const db = await getDatabase();
    let query = `
      SELECT
        SUM(f.amount) as total_fines,
        SUM(CASE WHEN f.paid = 1 THEN f.amount ELSE 0 END) as total_collected,
        SUM(CASE WHEN f.paid = 0 THEN f.amount ELSE 0 END) as total_pending
      FROM fines f
      JOIN borrowing_records br ON f.borrowing_id = br.id
      JOIN book_copies bc ON br.copy_id = bc.id
      JOIN books b ON bc.book_id = b.id
      WHERE b.institution_id = ?
    `;
    const params: (string | number)[] = [institutionId];
    if (from) { query += ' AND f.paid_at >= ?'; params.push(from); }
    if (to) { query += ' AND f.paid_at <= ?'; params.push(to); }

    const row = await db.getFirstAsync<FineReport>(query, params);
    return row ?? { total_fines: 0, total_collected: 0, total_pending: 0 };
  },

  async inventorySummary(institutionId: number) {
    const db = await getDatabase();
    return db.getFirstAsync<{
      total_books: number;
      total_copies: number;
      available_copies: number;
      borrowed_copies: number;
    }>(
      `SELECT
        COUNT(DISTINCT b.id) as total_books,
        SUM(b.total_copies) as total_copies,
        SUM(b.available_copies) as available_copies,
        SUM(b.total_copies - b.available_copies) as borrowed_copies
       FROM books b WHERE b.institution_id = ?`,
      [institutionId]
    );
  },
};
