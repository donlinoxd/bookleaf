import { eq, asc, and, like, or, max, sql } from 'drizzle-orm';
import { db } from '../db';
import { books, bookCopies } from '../db/schema';
import { Book, BookCopy } from '../types';

export const BookService = {
  async getAll(institutionId: number): Promise<Book[]> {
    return db.select().from(books)
      .where(eq(books.institution_id, institutionId))
      .orderBy(asc(books.title)) as Promise<Book[]>;
  },

  async search(institutionId: number, query: string): Promise<Book[]> {
    const q = `%${query}%`;
    return db.select().from(books)
      .where(and(
        eq(books.institution_id, institutionId),
        or(like(books.title, q), like(books.author, q), like(books.isbn, q), like(books.genre, q))
      ))
      .orderBy(asc(books.title)) as Promise<Book[]>;
  },

  async getById(id: number): Promise<Book | null> {
    const rows = await db.select().from(books).where(eq(books.id, id)).limit(1);
    return (rows[0] ?? null) as Book | null;
  },

  async create(book: Omit<Book, 'id' | 'added_at' | 'available_copies'>): Promise<number> {
    const result = await db.insert(books).values({
      institution_id: book.institution_id,
      isbn: book.isbn ?? null,
      title: book.title,
      author: book.author,
      publisher: book.publisher ?? null,
      year: book.year ?? null,
      genre: book.genre ?? null,
      description: book.description ?? null,
      cover_uri: book.cover_uri ?? null,
      total_copies: book.total_copies,
      available_copies: book.total_copies,
    }).returning({ id: books.id });

    const bookId = result[0].id;
    for (let i = 1; i <= book.total_copies; i++) {
      await db.insert(bookCopies).values({ book_id: bookId, copy_number: i });
    }
    return bookId;
  },

  async update(id: number, data: Partial<Book>): Promise<void> {
    await db.update(books).set({
      title: data.title,
      author: data.author,
      publisher: data.publisher ?? null,
      year: data.year ?? null,
      genre: data.genre ?? null,
      description: data.description ?? null,
      cover_uri: data.cover_uri ?? null,
      isbn: data.isbn ?? null,
    }).where(eq(books.id, id));
  },

  async getCopies(bookId: number): Promise<BookCopy[]> {
    return db.select().from(bookCopies)
      .where(eq(bookCopies.book_id, bookId))
      .orderBy(asc(bookCopies.copy_number)) as Promise<BookCopy[]>;
  },

  async addCopy(bookId: number): Promise<void> {
    const rows = await db.select({ max_copy: max(bookCopies.copy_number) })
      .from(bookCopies)
      .where(eq(bookCopies.book_id, bookId));
    const nextNum = (rows[0]?.max_copy ?? 0) + 1;

    await db.insert(bookCopies).values({ book_id: bookId, copy_number: nextNum });
    await db.update(books).set({
      total_copies: sql`${books.total_copies} + 1`,
      available_copies: sql`${books.available_copies} + 1`,
    }).where(eq(books.id, bookId));
  },

  async getAvailableCopy(bookId: number): Promise<BookCopy | null> {
    const rows = await db.select().from(bookCopies)
      .where(and(eq(bookCopies.book_id, bookId), eq(bookCopies.status, 'available')))
      .limit(1);
    return (rows[0] ?? null) as BookCopy | null;
  },
};
