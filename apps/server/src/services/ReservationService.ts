import { eq, and, asc, count } from 'drizzle-orm';
import { db } from '@bookleaf/db';
import { reservations, resources, users } from '@bookleaf/db';
import { Reservation } from '@bookleaf/types';

export const ReservationService = {
  async reserve(resourceId: number, userId: number): Promise<number> {
    // prevent duplicate active reservation
    const existing = await db.select({ id: reservations.id })
      .from(reservations)
      .where(and(
        eq(reservations.resource_id, resourceId),
        eq(reservations.user_id, userId),
        eq(reservations.status, 'active'),
      )).limit(1);
    if (existing.length > 0) throw new Error('You already have an active hold for this item');

    const result = await db.insert(reservations)
      .values({ resource_id: resourceId, user_id: userId })
      .returning({ id: reservations.id });
    return result[0].id;
  },

  async cancel(reservationId: number): Promise<void> {
    await db.update(reservations)
      .set({ status: 'cancelled' })
      .where(eq(reservations.id, reservationId));
  },

  async fulfill(reservationId: number): Promise<void> {
    await db.update(reservations)
      .set({ status: 'fulfilled' })
      .where(eq(reservations.id, reservationId));
  },

  async getNextInQueue(resourceId: number): Promise<Reservation | null> {
    const rows = await db.select({
      id: reservations.id,
      resource_id: reservations.resource_id,
      user_id: reservations.user_id,
      reserved_at: reservations.reserved_at,
      status: reservations.status,
      member_name: users.name,
      member_id_number: users.id_number,
      book_title: resources.title,
    }).from(reservations)
      .innerJoin(users, eq(reservations.user_id, users.id))
      .innerJoin(resources, eq(reservations.resource_id, resources.id))
      .where(and(eq(reservations.resource_id, resourceId), eq(reservations.status, 'active')))
      .orderBy(asc(reservations.reserved_at))
      .limit(1);
    return (rows[0] ?? null) as Reservation | null;
  },

  async getActiveByResource(resourceId: number): Promise<Reservation[]> {
    return db.select({
      id: reservations.id,
      resource_id: reservations.resource_id,
      user_id: reservations.user_id,
      reserved_at: reservations.reserved_at,
      status: reservations.status,
      member_name: users.name,
      member_id_number: users.id_number,
      book_title: resources.title,
    }).from(reservations)
      .innerJoin(users, eq(reservations.user_id, users.id))
      .innerJoin(resources, eq(reservations.resource_id, resources.id))
      .where(and(eq(reservations.resource_id, resourceId), eq(reservations.status, 'active')))
      .orderBy(asc(reservations.reserved_at)) as Promise<Reservation[]>;
  },

  async getByUser(userId: number): Promise<Reservation[]> {
    return db.select({
      id: reservations.id,
      resource_id: reservations.resource_id,
      user_id: reservations.user_id,
      reserved_at: reservations.reserved_at,
      status: reservations.status,
      book_title: resources.title,
      book_author: resources.author,
      available_copies: resources.available_copies,
    }).from(reservations)
      .innerJoin(resources, eq(reservations.resource_id, resources.id))
      .where(eq(reservations.user_id, userId))
      .orderBy(asc(reservations.reserved_at)) as Promise<Reservation[]>;
  },

  async getAll(institutionId: number): Promise<Reservation[]> {
    return db.select({
      id: reservations.id,
      resource_id: reservations.resource_id,
      user_id: reservations.user_id,
      reserved_at: reservations.reserved_at,
      status: reservations.status,
      book_title: resources.title,
      book_author: resources.author,
      member_name: users.name,
      member_id_number: users.id_number,
      available_copies: resources.available_copies,
    }).from(reservations)
      .innerJoin(resources, eq(reservations.resource_id, resources.id))
      .innerJoin(users, eq(reservations.user_id, users.id))
      .where(and(eq(resources.institution_id, institutionId), eq(reservations.status, 'active')))
      .orderBy(asc(reservations.reserved_at)) as Promise<Reservation[]>;
  },

  async countActiveByResource(resourceId: number): Promise<number> {
    const rows = await db.select({ n: count() }).from(reservations)
      .where(and(eq(reservations.resource_id, resourceId), eq(reservations.status, 'active')));
    return rows[0]?.n ?? 0;
  },
};
