import { getDatabase } from '../db/database';
import { BorrowingRecord, Fine } from '../types';
import { SettingsService } from './SettingsService';

export const BorrowService = {
  async borrowBook(copyId: number, userId: number): Promise<number> {
    const db = await getDatabase();
    const settings = await SettingsService.getAll();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + settings.max_borrow_days);

    const result = await db.runAsync(
      `INSERT INTO borrowing_records (copy_id, user_id, due_date) VALUES (?, ?, ?)`,
      [copyId, userId, dueDate.toISOString()]
    );

    await db.runAsync(
      "UPDATE book_copies SET status = 'borrowed' WHERE id = ?",
      [copyId]
    );

    const copy = await db.getFirstAsync<{ book_id: number }>(
      'SELECT book_id FROM book_copies WHERE id = ?', [copyId]
    );
    if (copy) {
      await db.runAsync(
        'UPDATE books SET available_copies = available_copies - 1 WHERE id = ?',
        [copy.book_id]
      );
    }

    return result.lastInsertRowId;
  },

  async returnBook(borrowingId: number, condition: string = 'good'): Promise<Fine | null> {
    const db = await getDatabase();
    const record = await db.getFirstAsync<BorrowingRecord>(
      'SELECT * FROM borrowing_records WHERE id = ?', [borrowingId]
    );
    if (!record) throw new Error('Borrowing record not found');

    const now = new Date();
    const due = new Date(record.due_date);
    let fineAmount = 0;

    if (now > due) {
      const settings = await SettingsService.getAll();
      const daysLate = Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      fineAmount = daysLate * settings.fine_per_day;
    }

    await db.runAsync(
      'UPDATE borrowing_records SET returned_at = ?, fine_amount = ? WHERE id = ?',
      [now.toISOString(), fineAmount, borrowingId]
    );

    await db.runAsync(
      "UPDATE book_copies SET status = 'available', condition = ? WHERE id = ?",
      [condition, record.copy_id]
    );

    const copy = await db.getFirstAsync<{ book_id: number }>(
      'SELECT book_id FROM book_copies WHERE id = ?', [record.copy_id]
    );
    if (copy) {
      await db.runAsync(
        'UPDATE books SET available_copies = available_copies + 1 WHERE id = ?',
        [copy.book_id]
      );
    }

    if (fineAmount > 0) {
      const fineResult = await db.runAsync(
        'INSERT INTO fines (borrowing_id, amount) VALUES (?, ?)',
        [borrowingId, fineAmount]
      );
      return { id: fineResult.lastInsertRowId, borrowing_id: borrowingId, amount: fineAmount, paid: false, paid_at: null };
    }

    return null;
  },

  async getActiveByUser(userId: number): Promise<BorrowingRecord[]> {
    const db = await getDatabase();
    return db.getAllAsync<BorrowingRecord>(
      `SELECT br.*, b.title as book_title, b.author as book_author
       FROM borrowing_records br
       JOIN book_copies bc ON br.copy_id = bc.id
       JOIN books b ON bc.book_id = b.id
       WHERE br.user_id = ? AND br.returned_at IS NULL
       ORDER BY br.due_date ASC`,
      [userId]
    );
  },

  async getOverdue(): Promise<BorrowingRecord[]> {
    const db = await getDatabase();
    return db.getAllAsync<BorrowingRecord>(
      `SELECT br.*, b.title as book_title, u.name as member_name, u.id_number as member_id_number
       FROM borrowing_records br
       JOIN book_copies bc ON br.copy_id = bc.id
       JOIN books b ON bc.book_id = b.id
       JOIN users u ON br.user_id = u.id
       WHERE br.returned_at IS NULL AND br.due_date < datetime('now')
       ORDER BY br.due_date ASC`
    );
  },

  async getHistory(institutionId: number, limit = 50): Promise<BorrowingRecord[]> {
    const db = await getDatabase();
    return db.getAllAsync<BorrowingRecord>(
      `SELECT br.*, b.title as book_title, u.name as member_name
       FROM borrowing_records br
       JOIN book_copies bc ON br.copy_id = bc.id
       JOIN books b ON bc.book_id = b.id
       JOIN users u ON br.user_id = u.id
       WHERE b.institution_id = ?
       ORDER BY br.borrowed_at DESC LIMIT ?`,
      [institutionId, limit]
    );
  },

  async getUserFines(userId: number): Promise<Fine[]> {
    const db = await getDatabase();
    return db.getAllAsync<Fine>(
      `SELECT f.* FROM fines f
       JOIN borrowing_records br ON f.borrowing_id = br.id
       WHERE br.user_id = ? AND f.paid = 0`,
      [userId]
    );
  },

  async payFine(fineId: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE fines SET paid = 1, paid_at = datetime('now') WHERE id = ?",
      [fineId]
    );
  },

  async canBorrow(userId: number): Promise<{ allowed: boolean; reason?: string }> {
    const db = await getDatabase();
    const settings = await SettingsService.getAll();

    const activeCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM borrowing_records WHERE user_id = ? AND returned_at IS NULL',
      [userId]
    );
    if ((activeCount?.count ?? 0) >= settings.max_books_per_member) {
      return { allowed: false, reason: `Maximum ${settings.max_books_per_member} books allowed` };
    }

    const unpaidFines = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM fines f
       JOIN borrowing_records br ON f.borrowing_id = br.id
       WHERE br.user_id = ? AND f.paid = 0`,
      [userId]
    );
    if ((unpaidFines?.count ?? 0) > 0) {
      return { allowed: false, reason: 'Please settle outstanding fines first' };
    }

    return { allowed: true };
  },
};
