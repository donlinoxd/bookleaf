import { eq, and, isNull, asc, desc, lt, sql, count } from 'drizzle-orm';
import { db } from '../db';
import { borrowingRecords, bookCopies, books, users, fines } from '../db/schema';
import { BorrowingRecord, Fine } from '../types';
import { SettingsService } from './SettingsService';

export const BorrowService = {
  async borrowBook(copyId: number, userId: number): Promise<number> {
    const settings = await SettingsService.getAll();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + settings.max_borrow_days);

    return db.transaction(async (tx) => {
      const result = await tx.insert(borrowingRecords)
        .values({ copy_id: copyId, user_id: userId, due_date: dueDate.toISOString() })
        .returning({ id: borrowingRecords.id });

      await tx.update(bookCopies)
        .set({ status: 'borrowed' })
        .where(eq(bookCopies.id, copyId));

      const copy = await tx.select({ book_id: bookCopies.book_id })
        .from(bookCopies).where(eq(bookCopies.id, copyId)).limit(1);
      if (copy[0]) {
        await tx.update(books)
          .set({ available_copies: sql`${books.available_copies} - 1` })
          .where(eq(books.id, copy[0].book_id));
      }

      return result[0].id;
    });
  },

  async returnBook(borrowingId: number, condition = 'good'): Promise<Fine | null> {
    const record = await db.select().from(borrowingRecords)
      .where(eq(borrowingRecords.id, borrowingId)).limit(1).then(r => r[0] ?? null);
    if (!record) throw new Error('Borrowing record not found');

    const now = new Date();
    const due = new Date(record.due_date);
    let fineAmount = 0;

    if (now > due) {
      const settings = await SettingsService.getAll();
      const daysLate = Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      fineAmount = daysLate * settings.fine_per_day;
    }

    return db.transaction(async (tx) => {
      await tx.update(borrowingRecords)
        .set({ returned_at: now.toISOString(), fine_amount: fineAmount })
        .where(eq(borrowingRecords.id, borrowingId));

      await tx.update(bookCopies)
        .set({ status: 'available', condition: condition as 'good' | 'damaged' | 'lost' })
        .where(eq(bookCopies.id, record.copy_id));

      const copy = await tx.select({ book_id: bookCopies.book_id })
        .from(bookCopies).where(eq(bookCopies.id, record.copy_id)).limit(1);
      if (copy[0]) {
        await tx.update(books)
          .set({ available_copies: sql`${books.available_copies} + 1` })
          .where(eq(books.id, copy[0].book_id));
      }

      if (fineAmount > 0) {
        const fineResult = await tx.insert(fines)
          .values({ borrowing_id: borrowingId, amount: fineAmount })
          .returning({ id: fines.id });
        return { id: fineResult[0].id, borrowing_id: borrowingId, amount: fineAmount, paid: false, paid_at: null };
      }

      return null;
    });
  },

  async getActiveByUser(userId: number): Promise<BorrowingRecord[]> {
    return db.select({
      id: borrowingRecords.id,
      copy_id: borrowingRecords.copy_id,
      user_id: borrowingRecords.user_id,
      borrowed_at: borrowingRecords.borrowed_at,
      due_date: borrowingRecords.due_date,
      returned_at: borrowingRecords.returned_at,
      fine_amount: borrowingRecords.fine_amount,
      book_title: books.title,
      book_author: books.author,
    }).from(borrowingRecords)
      .innerJoin(bookCopies, eq(borrowingRecords.copy_id, bookCopies.id))
      .innerJoin(books, eq(bookCopies.book_id, books.id))
      .where(and(eq(borrowingRecords.user_id, userId), isNull(borrowingRecords.returned_at)))
      .orderBy(asc(borrowingRecords.due_date)) as Promise<BorrowingRecord[]>;
  },

  async getOverdue(): Promise<BorrowingRecord[]> {
    return db.select({
      id: borrowingRecords.id,
      copy_id: borrowingRecords.copy_id,
      user_id: borrowingRecords.user_id,
      borrowed_at: borrowingRecords.borrowed_at,
      due_date: borrowingRecords.due_date,
      returned_at: borrowingRecords.returned_at,
      fine_amount: borrowingRecords.fine_amount,
      book_title: books.title,
      member_name: users.name,
      member_id_number: users.id_number,
    }).from(borrowingRecords)
      .innerJoin(bookCopies, eq(borrowingRecords.copy_id, bookCopies.id))
      .innerJoin(books, eq(bookCopies.book_id, books.id))
      .innerJoin(users, eq(borrowingRecords.user_id, users.id))
      .where(and(
        isNull(borrowingRecords.returned_at),
        lt(borrowingRecords.due_date, sql`datetime('now')`)
      ))
      .orderBy(asc(borrowingRecords.due_date)) as Promise<BorrowingRecord[]>;
  },

  async getHistory(institutionId: number, limit = 50): Promise<BorrowingRecord[]> {
    return db.select({
      id: borrowingRecords.id,
      copy_id: borrowingRecords.copy_id,
      user_id: borrowingRecords.user_id,
      borrowed_at: borrowingRecords.borrowed_at,
      due_date: borrowingRecords.due_date,
      returned_at: borrowingRecords.returned_at,
      fine_amount: borrowingRecords.fine_amount,
      book_title: books.title,
      member_name: users.name,
    }).from(borrowingRecords)
      .innerJoin(bookCopies, eq(borrowingRecords.copy_id, bookCopies.id))
      .innerJoin(books, eq(bookCopies.book_id, books.id))
      .innerJoin(users, eq(borrowingRecords.user_id, users.id))
      .where(eq(books.institution_id, institutionId))
      .orderBy(desc(borrowingRecords.borrowed_at))
      .limit(limit) as Promise<BorrowingRecord[]>;
  },

  async getUserFines(userId: number): Promise<Fine[]> {
    return db.select({
      id: fines.id,
      borrowing_id: fines.borrowing_id,
      amount: fines.amount,
      paid: fines.paid,
      paid_at: fines.paid_at,
    }).from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .where(and(eq(borrowingRecords.user_id, userId), eq(fines.paid, false))) as Promise<Fine[]>;
  },

  async payFine(fineId: number): Promise<void> {
    await db.update(fines)
      .set({ paid: true, paid_at: new Date().toISOString() })
      .where(eq(fines.id, fineId));
  },

  async getFullHistoryByUser(userId: number): Promise<BorrowingRecord[]> {
    return db.select({
      id: borrowingRecords.id,
      copy_id: borrowingRecords.copy_id,
      user_id: borrowingRecords.user_id,
      borrowed_at: borrowingRecords.borrowed_at,
      due_date: borrowingRecords.due_date,
      returned_at: borrowingRecords.returned_at,
      fine_amount: borrowingRecords.fine_amount,
      book_title: books.title,
      book_author: books.author,
    }).from(borrowingRecords)
      .innerJoin(bookCopies, eq(borrowingRecords.copy_id, bookCopies.id))
      .innerJoin(books, eq(bookCopies.book_id, books.id))
      .where(eq(borrowingRecords.user_id, userId))
      .orderBy(desc(borrowingRecords.borrowed_at)) as Promise<BorrowingRecord[]>;
  },

  async getHistoryByBook(bookId: number, limit = 20): Promise<BorrowingRecord[]> {
    return db.select({
      id: borrowingRecords.id,
      copy_id: borrowingRecords.copy_id,
      user_id: borrowingRecords.user_id,
      borrowed_at: borrowingRecords.borrowed_at,
      due_date: borrowingRecords.due_date,
      returned_at: borrowingRecords.returned_at,
      fine_amount: borrowingRecords.fine_amount,
      member_name: users.name,
      member_id_number: users.id_number,
    }).from(borrowingRecords)
      .innerJoin(bookCopies, eq(borrowingRecords.copy_id, bookCopies.id))
      .innerJoin(users, eq(borrowingRecords.user_id, users.id))
      .where(eq(bookCopies.book_id, bookId))
      .orderBy(desc(borrowingRecords.borrowed_at))
      .limit(limit) as Promise<BorrowingRecord[]>;
  },

  async canBorrow(userId: number): Promise<{ allowed: boolean; reason?: string }> {
    const settings = await SettingsService.getAll();

    const activeRows = await db.select({ count: count() })
      .from(borrowingRecords)
      .where(and(eq(borrowingRecords.user_id, userId), isNull(borrowingRecords.returned_at)));
    if ((activeRows[0]?.count ?? 0) >= settings.max_books_per_member) {
      return { allowed: false, reason: `Maximum ${settings.max_books_per_member} books allowed` };
    }

    const fineRows = await db.select({ count: count() })
      .from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .where(and(eq(borrowingRecords.user_id, userId), eq(fines.paid, false)));
    if ((fineRows[0]?.count ?? 0) > 0) {
      return { allowed: false, reason: 'Please settle outstanding fines first' };
    }

    return { allowed: true };
  },
};
