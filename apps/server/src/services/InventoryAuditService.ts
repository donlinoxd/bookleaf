import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '@bookleaf/db';
import { resources, resourceCopies, scanSessions, scanEntries } from '@bookleaf/db';
import { ScanSession } from '@bookleaf/types';

export interface AccessionRow {
  id: number;
  call_number: string | null;
  title: string;
  author: string;
  publisher: string | null;
  year: number | null;
  material_type: string;
  total_copies: number;
  good_copies: number;
  damaged_copies: number;
  lost_copies: number;
}

export interface ConditionByMaterialRow {
  material_type: string;
  good: number;
  damaged: number;
  lost: number;
  total: number;
}

export interface LatestSessionSummary {
  session: ScanSession;
  total_scanned: number;
  unique_isbns: number;
  ghost_count: number;
  phantom_count: number;
  unknown_count: number;
}

export const InventoryAuditService = {
  async getLatestSessionSummary(institutionId: number): Promise<LatestSessionSummary | null> {
    const session = await db
      .select()
      .from(scanSessions)
      .where(and(eq(scanSessions.institution_id, institutionId), eq(scanSessions.status, 'completed')))
      .orderBy(desc(scanSessions.ended_at))
      .limit(1)
      .then((r) => r[0] ?? null) as ScanSession | null;

    if (!session) return null;

    const entries = await db
      .select({ isbn: scanEntries.isbn, resource_id: scanEntries.resource_id })
      .from(scanEntries)
      .where(eq(scanEntries.session_id, session.id));

    const scanCountMap = new Map<string, number>();
    for (const e of entries) {
      scanCountMap.set(e.isbn, (scanCountMap.get(e.isbn) ?? 0) + 1);
    }
    const uniqueUnknownIsbns = new Set(
      entries.filter((e) => !e.resource_id).map((e) => e.isbn),
    ).size;

    const allResources = await db
      .select({ isbn: resources.isbn, available_copies: resources.available_copies, total_copies: resources.total_copies })
      .from(resources)
      .where(eq(resources.institution_id, institutionId));

    let ghostCount = 0;
    let phantomCount = 0;
    for (const r of allResources) {
      if (!r.isbn) continue;
      const scanCount = scanCountMap.get(r.isbn) ?? 0;
      const borrowed = r.total_copies - r.available_copies;
      if (scanCount < r.available_copies) ghostCount++;
      else if (scanCount > r.available_copies && borrowed > 0) phantomCount++;
    }

    return {
      session,
      total_scanned: entries.length,
      unique_isbns: scanCountMap.size,
      ghost_count: ghostCount,
      phantom_count: phantomCount,
      unknown_count: uniqueUnknownIsbns,
    };
  },

  async getAccessionRegister(institutionId: number): Promise<AccessionRow[]> {
    const rows = await db
      .select({
        id: resources.id,
        call_number: resources.call_number,
        title: resources.title,
        author: resources.author,
        publisher: resources.publisher,
        year: resources.year,
        material_type: resources.material_type,
        total_copies: resources.total_copies,
        good_copies: sql<number>`COALESCE(SUM(CASE WHEN ${resourceCopies.condition} = 'good' THEN 1 ELSE 0 END), 0)`,
        damaged_copies: sql<number>`COALESCE(SUM(CASE WHEN ${resourceCopies.condition} = 'damaged' THEN 1 ELSE 0 END), 0)`,
        lost_copies: sql<number>`COALESCE(SUM(CASE WHEN ${resourceCopies.condition} = 'lost' THEN 1 ELSE 0 END), 0)`,
      })
      .from(resources)
      .leftJoin(resourceCopies, eq(resources.id, resourceCopies.resource_id))
      .where(eq(resources.institution_id, institutionId))
      .groupBy(resources.id)
      .orderBy(resources.call_number, resources.title);

    return rows.map((r) => ({
      ...r,
      total_copies: Number(r.total_copies),
      good_copies: Number(r.good_copies),
      damaged_copies: Number(r.damaged_copies),
      lost_copies: Number(r.lost_copies),
    }));
  },

  async getConditionByMaterial(institutionId: number): Promise<ConditionByMaterialRow[]> {
    const rows = await db
      .select({
        material_type: resources.material_type,
        good: sql<number>`COALESCE(SUM(CASE WHEN ${resourceCopies.condition} = 'good' THEN 1 ELSE 0 END), 0)`,
        damaged: sql<number>`COALESCE(SUM(CASE WHEN ${resourceCopies.condition} = 'damaged' THEN 1 ELSE 0 END), 0)`,
        lost: sql<number>`COALESCE(SUM(CASE WHEN ${resourceCopies.condition} = 'lost' THEN 1 ELSE 0 END), 0)`,
      })
      .from(resourceCopies)
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(eq(resources.institution_id, institutionId))
      .groupBy(resources.material_type)
      .orderBy(resources.material_type);

    return rows.map((r) => ({
      material_type: r.material_type,
      good: Number(r.good),
      damaged: Number(r.damaged),
      lost: Number(r.lost),
      total: Number(r.good) + Number(r.damaged) + Number(r.lost),
    }));
  },
};
