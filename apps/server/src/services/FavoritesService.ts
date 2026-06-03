import { eq, and } from 'drizzle-orm';
import { db } from '@bookleaf/db';
import { favorites, resources } from '@bookleaf/db';
import { Favorite } from '@bookleaf/types';

export const FavoritesService = {
  async toggle(userId: number, resourceId: number): Promise<{ favorited: boolean }> {
    const existing = await db.select({ id: favorites.id })
      .from(favorites)
      .where(and(eq(favorites.user_id, userId), eq(favorites.resource_id, resourceId)))
      .limit(1);

    if (existing.length > 0) {
      await db.delete(favorites).where(eq(favorites.id, existing[0].id));
      return { favorited: false };
    }
    await db.insert(favorites).values({ user_id: userId, resource_id: resourceId });
    return { favorited: true };
  },

  async isFavorited(userId: number, resourceId: number): Promise<boolean> {
    const rows = await db.select({ id: favorites.id })
      .from(favorites)
      .where(and(eq(favorites.user_id, userId), eq(favorites.resource_id, resourceId)))
      .limit(1);
    return rows.length > 0;
  },

  async getByUser(userId: number): Promise<Favorite[]> {
    return db.select({
      id: favorites.id,
      user_id: favorites.user_id,
      resource_id: favorites.resource_id,
      created_at: favorites.created_at,
      book_title: resources.title,
      book_author: resources.author,
      available_copies: resources.available_copies,
    }).from(favorites)
      .innerJoin(resources, eq(favorites.resource_id, resources.id))
      .where(eq(favorites.user_id, userId)) as Promise<Favorite[]>;
  },
};
