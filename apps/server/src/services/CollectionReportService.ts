import { eq, sql, count, and, isNotNull } from 'drizzle-orm';
import { db } from '@bookleaf/db';
import { resources, resourceCopies, users } from '@bookleaf/db';

export interface CollectionOverview {
  total_titles: number;
  total_copies: number;
  available_copies: number;
  borrowed_copies: number;
  damaged_copies: number;
  lost_copies: number;
  registered_members: number;
  copies_per_member: number;
}

export interface MaterialTypeRow {
  material_type: string;
  titles: number;
  copies: number;
}

export interface YearBucketRow {
  bucket: string;
  titles: number;
  copies: number;
}

export interface ConditionRow {
  condition: string;
  copies: number;
}

export const CollectionReportService = {
  async getOverview(institutionId: number): Promise<CollectionOverview> {
    const [resources_row] = await db
      .select({
        total_titles: sql<number>`COUNT(DISTINCT ${resources.id})`,
        total_copies: sql<number>`COALESCE(SUM(${resources.total_copies}), 0)`,
        available_copies: sql<number>`COALESCE(SUM(${resources.available_copies}), 0)`,
        borrowed_copies: sql<number>`COALESCE(SUM(${resources.total_copies} - ${resources.available_copies}), 0)`,
      })
      .from(resources)
      .where(eq(resources.institution_id, institutionId));

    const [condition_row] = await db
      .select({
        damaged_copies: sql<number>`COALESCE(SUM(CASE WHEN ${resourceCopies.condition} = 'damaged' THEN 1 ELSE 0 END), 0)`,
        lost_copies: sql<number>`COALESCE(SUM(CASE WHEN ${resourceCopies.condition} = 'lost' THEN 1 ELSE 0 END), 0)`,
      })
      .from(resourceCopies)
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(eq(resources.institution_id, institutionId));

    const [member_row] = await db
      .select({ registered_members: count(users.id) })
      .from(users)
      .where(and(eq(users.institution_id, institutionId), eq(users.role, 'member')));

    const total_copies = Number(resources_row?.total_copies ?? 0);
    const registered_members = Number(member_row?.registered_members ?? 0);

    return {
      total_titles: Number(resources_row?.total_titles ?? 0),
      total_copies,
      available_copies: Number(resources_row?.available_copies ?? 0),
      borrowed_copies: Number(resources_row?.borrowed_copies ?? 0),
      damaged_copies: Number(condition_row?.damaged_copies ?? 0),
      lost_copies: Number(condition_row?.lost_copies ?? 0),
      registered_members,
      copies_per_member: registered_members > 0 ? Math.round((total_copies / registered_members) * 10) / 10 : 0,
    };
  },

  async getByMaterialType(institutionId: number): Promise<MaterialTypeRow[]> {
    return db
      .select({
        material_type: resources.material_type,
        titles: sql<number>`COUNT(DISTINCT ${resources.id})`,
        copies: sql<number>`COALESCE(SUM(${resources.total_copies}), 0)`,
      })
      .from(resources)
      .where(eq(resources.institution_id, institutionId))
      .groupBy(resources.material_type)
      .orderBy(sql`COUNT(DISTINCT ${resources.id}) DESC`) as Promise<MaterialTypeRow[]>;
  },

  async getByPublicationYear(institutionId: number): Promise<YearBucketRow[]> {
    const rows = await db
      .select({
        year: resources.year,
        copies: sql<number>`COALESCE(SUM(${resources.total_copies}), 0)`,
        titles: sql<number>`COUNT(DISTINCT ${resources.id})`,
      })
      .from(resources)
      .where(and(eq(resources.institution_id, institutionId), isNotNull(resources.year)))
      .groupBy(resources.year);

    const unknown = await db
      .select({
        titles: sql<number>`COUNT(DISTINCT ${resources.id})`,
        copies: sql<number>`COALESCE(SUM(${resources.total_copies}), 0)`,
      })
      .from(resources)
      .where(and(eq(resources.institution_id, institutionId), sql`${resources.year} IS NULL`))
      .then((r) => r[0]);

    const buckets: Record<string, { titles: number; copies: number }> = {
      'Pre-2000': { titles: 0, copies: 0 },
      '2000–2009': { titles: 0, copies: 0 },
      '2010–2019': { titles: 0, copies: 0 },
      '2020–present': { titles: 0, copies: 0 },
    };

    for (const row of rows) {
      const y = Number(row.year);
      let key: string;
      if (y < 2000) key = 'Pre-2000';
      else if (y < 2010) key = '2000–2009';
      else if (y < 2020) key = '2010–2019';
      else key = '2020–present';
      buckets[key].titles += Number(row.titles);
      buckets[key].copies += Number(row.copies);
    }

    const result: YearBucketRow[] = Object.entries(buckets).map(([bucket, v]) => ({
      bucket,
      titles: v.titles,
      copies: v.copies,
    }));

    if (Number(unknown?.titles ?? 0) > 0) {
      result.push({ bucket: 'Unknown', titles: Number(unknown.titles), copies: Number(unknown.copies) });
    }

    return result;
  },

  async getConditionSummary(institutionId: number): Promise<ConditionRow[]> {
    return db
      .select({
        condition: resourceCopies.condition,
        copies: sql<number>`COUNT(${resourceCopies.id})`,
      })
      .from(resourceCopies)
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(eq(resources.institution_id, institutionId))
      .groupBy(resourceCopies.condition)
      .orderBy(resourceCopies.condition) as Promise<ConditionRow[]>;
  },
};
