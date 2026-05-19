import { eq, like, or, and, desc, sum, sql, ne, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { resources, resourceCopies, borrowingRecords, users, fines, favorites, reviews } from '../db/schema';
import { GateService } from './GateService';
import { BorrowService } from './BorrowService';
import { ReservationService } from './ReservationService';
import { FavoritesService } from './FavoritesService';
import { ReviewService } from './ReviewService';
import { verifyPin } from '../db/database';

export const ApiServer = {
  async ping() {
    return { ok: true, timestamp: new Date().toISOString() };
  },

  async searchBooks(institutionId: number, query: string) {
    const q = `%${query}%`;
    return db.select({
      id: resources.id,
      title: resources.title,
      author: resources.author,
      genre: resources.genre,
      year: resources.year,
      material_type: resources.material_type,
      available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources)
      .where(and(
        eq(resources.institution_id, institutionId),
        or(
          like(resources.title, q),
          like(resources.author, q),
          like(resources.isbn, q),
          like(resources.genre, q),
          like(resources.publisher, q),
          like(resources.call_number, q),
        )
      ))
      .orderBy(resources.title)
      .limit(50);
  },

  async getRecentlyAdded(institutionId: number, limit = 10) {
    return db.select({
      id: resources.id,
      title: resources.title,
      author: resources.author,
      genre: resources.genre,
      year: resources.year,
      material_type: resources.material_type,
      available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources)
      .where(eq(resources.institution_id, institutionId))
      .orderBy(desc(resources.added_at))
      .limit(limit);
  },

  async getPopular(institutionId: number, limit = 10) {
    return db.select({
      id: resources.id,
      title: resources.title,
      author: resources.author,
      genre: resources.genre,
      year: resources.year,
      material_type: resources.material_type,
      available_copies: resources.available_copies,
      total_copies: resources.total_copies,
      borrow_count: sql<number>`count(${borrowingRecords.id})`,
    }).from(resources)
      .leftJoin(resourceCopies, eq(resourceCopies.resource_id, resources.id))
      .leftJoin(borrowingRecords, eq(borrowingRecords.copy_id, resourceCopies.id))
      .where(eq(resources.institution_id, institutionId))
      .groupBy(resources.id)
      .orderBy(desc(sql`count(${borrowingRecords.id})`))
      .limit(limit);
  },

  async renewBorrow(borrowingId: number, idNumber: string) {
    const member = await db.select({ id: users.id })
      .from(users).where(eq(users.id_number, idNumber)).limit(1).then(r => r[0] ?? null);
    if (!member) throw new Error('Member not found');
    const record = await db.select({ user_id: borrowingRecords.user_id })
      .from(borrowingRecords).where(eq(borrowingRecords.id, borrowingId)).limit(1).then(r => r[0] ?? null);
    if (!record) throw new Error('Borrowing record not found');
    if (record.user_id !== member.id) throw new Error('Unauthorized');
    return BorrowService.renewBook(borrowingId);
  },

  async reserveBook(resourceId: number, idNumber: string) {
    const member = await db.select({ id: users.id })
      .from(users).where(eq(users.id_number, idNumber)).limit(1).then(r => r[0] ?? null);
    if (!member) throw new Error('Member not found');
    return ReservationService.reserve(resourceId, member.id);
  },

  async getMemberReservations(idNumber: string) {
    const member = await db.select({ id: users.id, name: users.name })
      .from(users).where(eq(users.id_number, idNumber)).limit(1).then(r => r[0] ?? null);
    if (!member) return null;
    const holds = await ReservationService.getByUser(member.id);
    return { member_name: member.name, reservations: holds.filter(h => h.status === 'active') };
  },

  async getAllBooks(institutionId: number) {
    return db.select({
      id: resources.id,
      title: resources.title,
      author: resources.author,
      genre: resources.genre,
      year: resources.year,
      material_type: resources.material_type,
      available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources)
      .where(eq(resources.institution_id, institutionId))
      .orderBy(resources.title);
  },

  async getBookDetail(resourceId: number) {
    return db.select({
      id: resources.id,
      title: resources.title,
      author: resources.author,
      publisher: resources.publisher,
      year: resources.year,
      genre: resources.genre,
      description: resources.description,
      material_type: resources.material_type,
      language: resources.language,
      call_number: resources.call_number,
      isbn: resources.isbn,
      subject_headings: resources.subject_headings,
      available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1)
      .then(r => r[0] ?? null);
  },

  async getSimilarBooks(resourceId: number) {
    const book = await db.select({ author: resources.author, genre: resources.genre, institution_id: resources.institution_id })
      .from(resources).where(eq(resources.id, resourceId)).limit(1).then(r => r[0] ?? null);
    if (!book) return [];
    const conditions = [eq(resources.institution_id, book.institution_id), ne(resources.id, resourceId)];
    const authorOrGenre = [];
    if (book.author) authorOrGenre.push(eq(resources.author, book.author));
    if (book.genre) authorOrGenre.push(eq(resources.genre, book.genre));
    if (authorOrGenre.length === 0) return [];
    return db.select({
      id: resources.id,
      title: resources.title,
      author: resources.author,
      genre: resources.genre,
      available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources)
      .where(and(...conditions, or(...authorOrGenre)))
      .limit(8);
  },

  async searchBooksFiltered(institutionId: number, query: string, materialType?: string, yearFrom?: number, yearTo?: number, language?: string) {
    const conditions: ReturnType<typeof eq>[] = [eq(resources.institution_id, institutionId) as any];
    if (query) {
      const q = `%${query}%`;
      conditions.push(or(
        like(resources.title, q),
        like(resources.author, q),
        like(resources.isbn, q),
        like(resources.genre, q),
        like(resources.publisher, q),
        like(resources.call_number, q),
      ) as any);
    }
    if (materialType) conditions.push(eq(resources.material_type, materialType as any) as any);
    if (yearFrom) conditions.push(gte(resources.year, yearFrom) as any);
    if (yearTo) conditions.push(lte(resources.year, yearTo) as any);
    if (language) conditions.push(like(resources.language, `%${language}%`) as any);
    return db.select({
      id: resources.id,
      title: resources.title,
      author: resources.author,
      genre: resources.genre,
      year: resources.year,
      material_type: resources.material_type,
      language: resources.language,
      available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources)
      .where(and(...conditions))
      .orderBy(resources.title)
      .limit(100);
  },

  async toggleFavorite(resourceId: number, idNumber: string) {
    const member = await db.select({ id: users.id })
      .from(users).where(eq(users.id_number, idNumber)).limit(1).then(r => r[0] ?? null);
    if (!member) throw new Error('Member not found');
    return FavoritesService.toggle(member.id, resourceId);
  },

  async getFavoriteStatus(resourceId: number, idNumber: string) {
    const member = await db.select({ id: users.id })
      .from(users).where(eq(users.id_number, idNumber)).limit(1).then(r => r[0] ?? null);
    if (!member) return { favorited: false };
    const favorited = await FavoritesService.isFavorited(member.id, resourceId);
    return { favorited };
  },

  async getMemberFavorites(idNumber: string) {
    const member = await db.select({ id: users.id, name: users.name })
      .from(users).where(eq(users.id_number, idNumber)).limit(1).then(r => r[0] ?? null);
    if (!member) return null;
    const items = await FavoritesService.getByUser(member.id);
    return { member_name: member.name, favorites: items };
  },

  async getBookReviews(resourceId: number) {
    const [reviewList, avgRating] = await Promise.all([
      ReviewService.getByResource(resourceId),
      ReviewService.getAverageRating(resourceId),
    ]);
    return { reviews: reviewList, avg_rating: avgRating };
  },

  async submitReview(resourceId: number, idNumber: string, rating: number, comment: string | null) {
    const member = await db.select({ id: users.id })
      .from(users).where(eq(users.id_number, idNumber)).limit(1).then(r => r[0] ?? null);
    if (!member) throw new Error('Member not found');
    const eligible = await ReviewService.canReview(member.id, resourceId);
    if (!eligible) throw new Error('You must have borrowed this item to leave a review');
    await ReviewService.submit(member.id, resourceId, rating, comment);
    return { ok: true };
  },

  async gateLogByIdNumber(idNumber: string, institutionId: number, method: 'app' | 'browser' | 'manual') {
    const user = await db.select({ id: users.id, name: users.name, is_active: users.is_active })
      .from(users)
      .where(eq(users.id_number, idNumber))
      .limit(1)
      .then((r) => r[0] ?? null);
    if (!user || !user.is_active) return null;
    const result = await GateService.logEntry(user.id, institutionId, method);
    return { user_name: user.name, direction: result.direction, logged_at: result.logged_at };
  },

  async gateVerifyAndLog(idNumber: string, pin: string, institutionId: number) {
    const user = await db.select({ id: users.id, name: users.name, pin_hash: users.pin_hash, is_active: users.is_active })
      .from(users)
      .where(eq(users.id_number, idNumber))
      .limit(1)
      .then((r) => r[0] ?? null);
    if (!user || !user.is_active) return null;
    if (!verifyPin(pin, user.pin_hash)) return null;
    const result = await GateService.logEntry(user.id, institutionId, 'browser');
    return { user_name: user.name, direction: result.direction, logged_at: result.logged_at };
  },

  async authenticateMember(idNumber: string, pin: string) {
    const row = await db.select({
      id: users.id,
      institution_id: users.institution_id,
      name: users.name,
      id_number: users.id_number,
      role: users.role,
      pin_hash: users.pin_hash,
      photo_uri: users.photo_uri,
      is_active: users.is_active,
      created_at: users.created_at,
      department: users.department,
      user_type: users.user_type,
    }).from(users).where(eq(users.id_number, idNumber)).limit(1).then(r => r[0] ?? null);
    if (!row || !row.is_active) return null;
    if (!verifyPin(pin, row.pin_hash)) return null;
    const { pin_hash: _, ...safeUser } = row;
    return safeUser;
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
      resource_id: resourceCopies.resource_id,
      book_title: resources.title,
      book_author: resources.author,
      due_date: borrowingRecords.due_date,
      returned_at: borrowingRecords.returned_at,
      renewal_count: borrowingRecords.renewal_count,
    }).from(borrowingRecords)
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
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
