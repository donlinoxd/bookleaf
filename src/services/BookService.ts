import { getDatabase } from '../db/database';
import { Book, BookCopy } from '../types';

export const BookService = {
  async getAll(institutionId: number): Promise<Book[]> {
    const db = await getDatabase();
    return db.getAllAsync<Book>(
      'SELECT * FROM books WHERE institution_id = ? ORDER BY title ASC',
      [institutionId]
    );
  },

  async search(institutionId: number, query: string): Promise<Book[]> {
    const db = await getDatabase();
    const q = `%${query}%`;
    return db.getAllAsync<Book>(
      `SELECT * FROM books WHERE institution_id = ?
       AND (title LIKE ? OR author LIKE ? OR isbn LIKE ? OR genre LIKE ?)
       ORDER BY title ASC`,
      [institutionId, q, q, q, q]
    );
  },

  async getById(id: number): Promise<Book | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Book>('SELECT * FROM books WHERE id = ?', [id]);
  },

  async create(book: Omit<Book, 'id' | 'added_at' | 'available_copies'>): Promise<number> {
    const db = await getDatabase();
    const result = await db.runAsync(
      `INSERT INTO books (institution_id, isbn, title, author, publisher, year, genre, description, cover_uri, total_copies, available_copies)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [book.institution_id, book.isbn ?? null, book.title, book.author,
       book.publisher ?? null, book.year ?? null, book.genre ?? null,
       book.description ?? null, book.cover_uri ?? null,
       book.total_copies, book.total_copies]
    );
    const bookId = result.lastInsertRowId;
    for (let i = 1; i <= book.total_copies; i++) {
      await db.runAsync(
        'INSERT INTO book_copies (book_id, copy_number) VALUES (?, ?)',
        [bookId, i]
      );
    }
    return bookId;
  },

  async update(id: number, data: Partial<Book>): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE books SET title=?, author=?, publisher=?, year=?, genre=?,
       description=?, cover_uri=?, isbn=? WHERE id=?`,
      [data.title ?? '', data.author ?? '', data.publisher ?? null,
       data.year ?? null, data.genre ?? null, data.description ?? null,
       data.cover_uri ?? null, data.isbn ?? null, id]
    );
  },

  async getCopies(bookId: number): Promise<BookCopy[]> {
    const db = await getDatabase();
    return db.getAllAsync<BookCopy>(
      'SELECT * FROM book_copies WHERE book_id = ? ORDER BY copy_number ASC',
      [bookId]
    );
  },

  async addCopy(bookId: number): Promise<void> {
    const db = await getDatabase();
    const last = await db.getFirstAsync<{ max_copy: number }>(
      'SELECT MAX(copy_number) as max_copy FROM book_copies WHERE book_id = ?', [bookId]
    );
    const nextNum = (last?.max_copy ?? 0) + 1;
    await db.runAsync(
      'INSERT INTO book_copies (book_id, copy_number) VALUES (?, ?)', [bookId, nextNum]
    );
    await db.runAsync(
      'UPDATE books SET total_copies = total_copies + 1, available_copies = available_copies + 1 WHERE id = ?',
      [bookId]
    );
  },

  async getAvailableCopy(bookId: number): Promise<BookCopy | null> {
    const db = await getDatabase();
    return db.getFirstAsync<BookCopy>(
      "SELECT * FROM book_copies WHERE book_id = ? AND status = 'available' LIMIT 1",
      [bookId]
    );
  },
};
