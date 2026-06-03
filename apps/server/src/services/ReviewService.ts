import { eq, and, desc, avg } from 'drizzle-orm';
import { db } from '@bookleaf/db';
import { reviews, borrowingRecords, resourceCopies, users } from '@bookleaf/db';
import { Review } from '@bookleaf/types';

export const ReviewService = {
  async canReview(userId: number, resourceId: number): Promise<boolean> {
    const rows = await db.select({ id: borrowingRecords.id })
      .from(borrowingRecords)
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .where(and(
        eq(borrowingRecords.user_id, userId),
        eq(resourceCopies.resource_id, resourceId),
      ))
      .limit(1);
    return rows.length > 0;
  },

  async submit(userId: number, resourceId: number, rating: number, comment: string | null): Promise<void> {
    const existing = await db.select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.user_id, userId), eq(reviews.resource_id, resourceId)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(reviews)
        .set({ rating, comment: comment ?? null, created_at: new Date().toISOString() })
        .where(eq(reviews.id, existing[0].id));
    } else {
      await db.insert(reviews).values({ user_id: userId, resource_id: resourceId, rating, comment: comment ?? null });
    }
  },

  async getByResource(resourceId: number): Promise<Review[]> {
    return db.select({
      id: reviews.id,
      user_id: reviews.user_id,
      resource_id: reviews.resource_id,
      rating: reviews.rating,
      comment: reviews.comment,
      created_at: reviews.created_at,
      member_name: users.name,
    }).from(reviews)
      .innerJoin(users, eq(reviews.user_id, users.id))
      .where(eq(reviews.resource_id, resourceId))
      .orderBy(desc(reviews.created_at)) as Promise<Review[]>;
  },

  async getAverageRating(resourceId: number): Promise<number> {
    const rows = await db.select({ avg: avg(reviews.rating) })
      .from(reviews)
      .where(eq(reviews.resource_id, resourceId));
    return Number(rows[0]?.avg ?? 0);
  },
};
