import { eq, like, or, and, desc, sum } from 'drizzle-orm';
import { db } from '../db';
import { resources, resourceCopies, borrowingRecords, users, fines } from '../db/schema';
import { GateService } from './GateService';
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
        or(like(resources.title, q), like(resources.author, q), like(resources.isbn, q), like(resources.genre, q))
      ))
      .orderBy(resources.title)
      .limit(50);
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
      available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1)
      .then(r => r[0] ?? null);
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

  async getMemberBorrows(idNumber: string) {
    const member = await db.select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id_number, idNumber))
      .limit(1)
      .then(r => r[0] ?? null);
    if (!member) return null;

    const borrows = await db.select({
      id: borrowingRecords.id,
      book_title: resources.title,
      book_author: resources.author,
      due_date: borrowingRecords.due_date,
      returned_at: borrowingRecords.returned_at,
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
