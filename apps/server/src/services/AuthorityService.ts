import { and, asc, eq, like, or } from 'drizzle-orm';
import { db } from '../db';
import { authorityNames } from '../db/schema';
import { AuthorityName, AuthorityNameType } from '../types';

export const AuthorityService = {
  async search(institutionId: number, query: string): Promise<AuthorityName[]> {
    const q = `%${query}%`;
    return db.select().from(authorityNames)
      .where(and(
        eq(authorityNames.institution_id, institutionId),
        or(
          like(authorityNames.name, q),
          like(authorityNames.variants, q),
        ),
      ))
      .orderBy(asc(authorityNames.name)) as Promise<AuthorityName[]>;
  },

  async searchByName(institutionId: number, query: string): Promise<AuthorityName[]> {
    return AuthorityService.search(institutionId, query);
  },

  async getAll(institutionId: number): Promise<AuthorityName[]> {
    return db.select().from(authorityNames)
      .where(eq(authorityNames.institution_id, institutionId))
      .orderBy(asc(authorityNames.name)) as Promise<AuthorityName[]>;
  },

  async getById(id: number): Promise<AuthorityName | null> {
    const rows = await db.select().from(authorityNames)
      .where(eq(authorityNames.id, id)).limit(1);
    return (rows[0] ?? null) as AuthorityName | null;
  },

  async create(institutionId: number, name: string, nameType: AuthorityNameType = 'personal'): Promise<number> {
    const result = await db.insert(authorityNames).values({
      institution_id: institutionId,
      name: name.trim(),
      name_type: nameType,
    }).returning({ id: authorityNames.id });
    return result[0].id;
  },

  async update(id: number, data: { name?: string; name_type?: AuthorityNameType; variants?: string | null }): Promise<void> {
    await db.update(authorityNames).set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.name_type !== undefined && { name_type: data.name_type }),
      ...(data.variants !== undefined && { variants: data.variants }),
    }).where(eq(authorityNames.id, id));
  },
};
