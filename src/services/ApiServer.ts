import { eq, like, or, and, desc, sum } from 'drizzle-orm';
import { db } from '../db';
import { books, bookCopies, borrowingRecords, users, fines } from '../db/schema';

export const ApiServer = {
  async ping() {
    return { ok: true, timestamp: new Date().toISOString() };
  },

  async searchBooks(institutionId: number, query: string) {
    const q = `%${query}%`;
    return db.select({
      id: books.id,
      title: books.title,
      author: books.author,
      genre: books.genre,
      year: books.year,
      available_copies: books.available_copies,
      total_copies: books.total_copies,
    }).from(books)
      .where(and(
        eq(books.institution_id, institutionId),
        or(like(books.title, q), like(books.author, q), like(books.isbn, q), like(books.genre, q))
      ))
      .orderBy(books.title)
      .limit(50);
  },

  async getAllBooks(institutionId: number) {
    return db.select({
      id: books.id,
      title: books.title,
      author: books.author,
      genre: books.genre,
      year: books.year,
      available_copies: books.available_copies,
      total_copies: books.total_copies,
    }).from(books)
      .where(eq(books.institution_id, institutionId))
      .orderBy(books.title);
  },

  async getBookDetail(bookId: number) {
    return db.select({
      id: books.id,
      title: books.title,
      author: books.author,
      publisher: books.publisher,
      year: books.year,
      genre: books.genre,
      description: books.description,
      available_copies: books.available_copies,
      total_copies: books.total_copies,
    }).from(books)
      .where(eq(books.id, bookId))
      .limit(1)
      .then(r => r[0] ?? null);
  },

  async getMemberBorrows(idNumber: string) {
    const member = await db.select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id_number, idNumber))
      .limit(1)
      .then(r => r[0] ?? null);
    if (!member) return null;

    const borrows = await db.select({
      id: borrowingRecords.id,
      book_title: books.title,
      book_author: books.author,
      due_date: borrowingRecords.due_date,
      returned_at: borrowingRecords.returned_at,
    }).from(borrowingRecords)
      .innerJoin(bookCopies, eq(borrowingRecords.copy_id, bookCopies.id))
      .innerJoin(books, eq(bookCopies.book_id, books.id))
      .where(eq(borrowingRecords.user_id, member.id))
      .orderBy(desc(borrowingRecords.borrowed_at));

    const fineRow = await db.select({ total: sum(fines.amount) })
      .from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .where(and(eq(borrowingRecords.user_id, member.id), eq(fines.paid, false)))
      .then(r => r[0]);

    return {
      member_name: member.name,
      borrows,
      total_fines: Number(fineRow?.total ?? 0),
    };
  },
};
