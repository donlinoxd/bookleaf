import { getDatabase } from '../db/database';

/**
 * Lightweight REST API handler for incoming client requests.
 * Designed to be called by a native HTTP server module (e.g. nodejs-mobile-react-native).
 * Each method returns a plain object that the caller serializes as JSON.
 */
export const ApiServer = {
  async ping() {
    return { ok: true, timestamp: new Date().toISOString() };
  },

  async searchBooks(institutionId: number, query: string) {
    const db = await getDatabase();
    const q = `%${query}%`;
    return db.getAllAsync(
      `SELECT id, title, author, genre, year, available_copies, total_copies
       FROM books WHERE institution_id = ?
       AND (title LIKE ? OR author LIKE ? OR isbn LIKE ? OR genre LIKE ?)
       ORDER BY title ASC LIMIT 50`,
      [institutionId, q, q, q, q]
    );
  },

  async getAllBooks(institutionId: number) {
    const db = await getDatabase();
    return db.getAllAsync(
      `SELECT id, title, author, genre, year, available_copies, total_copies
       FROM books WHERE institution_id = ? ORDER BY title ASC`,
      [institutionId]
    );
  },

  async getBookDetail(bookId: number) {
    const db = await getDatabase();
    return db.getFirstAsync(
      'SELECT id, title, author, publisher, year, genre, description, available_copies, total_copies FROM books WHERE id = ?',
      [bookId]
    );
  },

  async getMemberBorrows(idNumber: string) {
    const db = await getDatabase();
    const member = await db.getFirstAsync<{ id: number; name: string }>(
      'SELECT id, name FROM users WHERE id_number = ?',
      [idNumber]
    );
    if (!member) return null;

    const borrows = await db.getAllAsync(
      `SELECT br.id, b.title as book_title, b.author as book_author, br.due_date, br.returned_at
       FROM borrowing_records br
       JOIN book_copies bc ON br.copy_id = bc.id
       JOIN books b ON bc.book_id = b.id
       WHERE br.user_id = ? ORDER BY br.borrowed_at DESC`,
      [member.id]
    );

    const fineRow = await db.getFirstAsync<{ total: number }>(
      `SELECT SUM(f.amount) as total FROM fines f
       JOIN borrowing_records br ON f.borrowing_id = br.id
       WHERE br.user_id = ? AND f.paid = 0`,
      [member.id]
    );

    return {
      member_name: member.name,
      borrows,
      total_fines: fineRow?.total ?? 0,
    };
  },
};
