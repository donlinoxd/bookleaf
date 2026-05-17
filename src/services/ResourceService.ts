import { eq, asc, and, like, or, max, sql } from 'drizzle-orm';
import { db } from '../db';
import { resources, resourceCopies } from '../db/schema';
import { Resource, ResourceCopy } from '../types';

export const ResourceService = {
  async getAll(institutionId: number): Promise<Resource[]> {
    return db.select().from(resources)
      .where(eq(resources.institution_id, institutionId))
      .orderBy(asc(resources.title)) as Promise<Resource[]>;
  },

  async search(institutionId: number, query: string): Promise<Resource[]> {
    const q = `%${query}%`;
    return db.select().from(resources)
      .where(and(
        eq(resources.institution_id, institutionId),
        or(
          like(resources.title, q),
          like(resources.author, q),
          like(resources.isbn, q),
          like(resources.genre, q),
          like(resources.material_type, q),
        )
      ))
      .orderBy(asc(resources.title)) as Promise<Resource[]>;
  },

  async getById(id: number): Promise<Resource | null> {
    const rows = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
    return (rows[0] ?? null) as Resource | null;
  },

  async create(resource: Omit<Resource, 'id' | 'added_at' | 'available_copies'>): Promise<number> {
    const result = await db.insert(resources).values({
      institution_id: resource.institution_id,
      material_type: resource.material_type,
      isbn: resource.isbn ?? null,
      title: resource.title,
      author: resource.author,
      publisher: resource.publisher ?? null,
      year: resource.year ?? null,
      genre: resource.genre ?? null,
      description: resource.description ?? null,
      cover_uri: resource.cover_uri ?? null,
      subtitle: resource.subtitle ?? null,
      edition: resource.edition ?? null,
      volume: resource.volume ?? null,
      issue_number: resource.issue_number ?? null,
      series_title: resource.series_title ?? null,
      doi: resource.doi ?? null,
      url: resource.url ?? null,
      duration: resource.duration ?? null,
      language: resource.language ?? null,
      call_number: resource.call_number ?? null,
      call_number_type: resource.call_number_type ?? null,
      content_type: resource.content_type ?? null,
      media_type: resource.media_type ?? null,
      carrier_type: resource.carrier_type ?? null,
      is_loanable: resource.is_loanable,
      loan_period_days: resource.loan_period_days ?? null,
      total_copies: resource.total_copies,
      available_copies: resource.total_copies,
    }).returning({ id: resources.id });

    const resourceId = result[0].id;
    for (let i = 1; i <= resource.total_copies; i++) {
      await db.insert(resourceCopies).values({ resource_id: resourceId, copy_number: i });
    }
    return resourceId;
  },

  async update(id: number, data: Partial<Resource>): Promise<void> {
    await db.update(resources).set({
      material_type: data.material_type,
      title: data.title,
      author: data.author,
      publisher: data.publisher ?? null,
      year: data.year ?? null,
      genre: data.genre ?? null,
      description: data.description ?? null,
      cover_uri: data.cover_uri ?? null,
      isbn: data.isbn ?? null,
      subtitle: data.subtitle ?? null,
      edition: data.edition ?? null,
      volume: data.volume ?? null,
      issue_number: data.issue_number ?? null,
      series_title: data.series_title ?? null,
      doi: data.doi ?? null,
      url: data.url ?? null,
      duration: data.duration ?? null,
      language: data.language ?? null,
      call_number: data.call_number ?? null,
      call_number_type: data.call_number_type ?? null,
      content_type: data.content_type ?? null,
      media_type: data.media_type ?? null,
      carrier_type: data.carrier_type ?? null,
      is_loanable: data.is_loanable,
      loan_period_days: data.loan_period_days ?? null,
    }).where(eq(resources.id, id));
  },

  async getCopies(resourceId: number): Promise<ResourceCopy[]> {
    return db.select().from(resourceCopies)
      .where(eq(resourceCopies.resource_id, resourceId))
      .orderBy(asc(resourceCopies.copy_number)) as Promise<ResourceCopy[]>;
  },

  async addCopy(resourceId: number): Promise<void> {
    const rows = await db.select({ max_copy: max(resourceCopies.copy_number) })
      .from(resourceCopies)
      .where(eq(resourceCopies.resource_id, resourceId));
    const nextNum = (rows[0]?.max_copy ?? 0) + 1;

    await db.insert(resourceCopies).values({ resource_id: resourceId, copy_number: nextNum });
    await db.update(resources).set({
      total_copies: sql`${resources.total_copies} + 1`,
      available_copies: sql`${resources.available_copies} + 1`,
    }).where(eq(resources.id, resourceId));
  },

  async getAvailableCopy(resourceId: number): Promise<ResourceCopy | null> {
    const rows = await db.select().from(resourceCopies)
      .where(and(eq(resourceCopies.resource_id, resourceId), eq(resourceCopies.status, 'available')))
      .limit(1);
    return (rows[0] ?? null) as ResourceCopy | null;
  },
};
