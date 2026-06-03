import { eq, and, count, desc } from 'drizzle-orm';
import { db } from '../db';
import { scanSessions, scanEntries, resources } from '../db/schema';
import { DiscrepancyReport, ExtraCopy, GhostCopy, PhantomReturn, ScanSession, UnknownScan } from '../types';

export const InventoryService = {
  async getActiveSession(institutionId: number): Promise<ScanSession | null> {
    const rows = await db.select().from(scanSessions)
      .where(and(eq(scanSessions.institution_id, institutionId), eq(scanSessions.status, 'in_progress')))
      .limit(1);
    return (rows[0] ?? null) as ScanSession | null;
  },

  async startSession(institutionId: number): Promise<ScanSession> {
    const result = await db.insert(scanSessions)
      .values({ institution_id: institutionId })
      .returning();
    return result[0] as ScanSession;
  },

  async recordScan(
    sessionId: number,
    isbn: string,
    institutionId: number,
  ): Promise<{ scanCount: number; resource: { title: string; author: string } | null }> {
    const resourceRows = await db.select({
      id: resources.id,
      title: resources.title,
      author: resources.author,
    }).from(resources)
      .where(and(eq(resources.institution_id, institutionId), eq(resources.isbn, isbn)))
      .limit(1);

    const found = resourceRows[0] ?? null;

    await db.insert(scanEntries).values({
      session_id: sessionId,
      isbn,
      resource_id: found?.id ?? null,
    });

    const countRow = await db.select({ c: count() }).from(scanEntries)
      .where(and(eq(scanEntries.session_id, sessionId), eq(scanEntries.isbn, isbn)))
      .then(r => r[0]);

    return { scanCount: countRow?.c ?? 1, resource: found ?? null };
  },

  async getSessionProgress(sessionId: number): Promise<{ totalScanned: number; uniqueIsbns: number }> {
    const rows = await db.select({
      totalScanned: count(),
    }).from(scanEntries).where(eq(scanEntries.session_id, sessionId));

    const uniqueRows = await db.selectDistinct({ isbn: scanEntries.isbn })
      .from(scanEntries).where(eq(scanEntries.session_id, sessionId));

    return {
      totalScanned: rows[0]?.totalScanned ?? 0,
      uniqueIsbns: uniqueRows.length,
    };
  },

  async getUnscannedAvailableCount(sessionId: number, institutionId: number): Promise<number> {
    const scannedIsbns = await db.selectDistinct({ isbn: scanEntries.isbn })
      .from(scanEntries).where(eq(scanEntries.session_id, sessionId));

    const scannedSet = new Set(scannedIsbns.map(r => r.isbn));

    const allAvailable = await db.select({ isbn: resources.isbn })
      .from(resources)
      .where(and(eq(resources.institution_id, institutionId)));

    return allAvailable.filter(r => r.isbn && !scannedSet.has(r.isbn)).length;
  },

  async endSession(sessionId: number, institutionId: number): Promise<DiscrepancyReport> {
    await db.update(scanSessions).set({
      ended_at: new Date().toISOString().replace('T', ' ').split('.')[0],
      status: 'completed',
    }).where(eq(scanSessions.id, sessionId));

    return this.getDiscrepancyReport(sessionId, institutionId);
  },

  async getDiscrepancyReport(sessionId: number, institutionId: number): Promise<DiscrepancyReport> {
    const session = await db.select().from(scanSessions)
      .where(eq(scanSessions.id, sessionId)).limit(1).then(r => r[0]);

    const entries = await db.select().from(scanEntries)
      .where(eq(scanEntries.session_id, sessionId));

    // Build ISBN → scan count map and track unknowns
    const scanCountMap = new Map<string, number>();
    const unknownIsbnMap = new Map<string, number>();

    for (const entry of entries) {
      scanCountMap.set(entry.isbn, (scanCountMap.get(entry.isbn) ?? 0) + 1);
      if (!entry.resource_id) {
        unknownIsbnMap.set(entry.isbn, (unknownIsbnMap.get(entry.isbn) ?? 0) + 1);
      }
    }

    const allResources = await db.select({
      id: resources.id,
      title: resources.title,
      author: resources.author,
      isbn: resources.isbn,
      call_number: resources.call_number,
      available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources).where(eq(resources.institution_id, institutionId));

    const ghostCopies: GhostCopy[] = [];
    const phantomReturns: PhantomReturn[] = [];
    const extraCopies: ExtraCopy[] = [];

    for (const r of allResources) {
      if (!r.isbn) continue;
      const scanCount = scanCountMap.get(r.isbn) ?? 0;
      const borrowedCopies = r.total_copies - r.available_copies;

      if (scanCount < r.available_copies) {
        ghostCopies.push({
          resource_id: r.id,
          title: r.title,
          author: r.author,
          isbn: r.isbn,
          call_number: r.call_number,
          db_available: r.available_copies,
          scan_count: scanCount,
          missing_count: r.available_copies - scanCount,
        });
      } else if (scanCount > r.available_copies && borrowedCopies > 0) {
        // Phantom returns: found on shelf but marked borrowed (capped at borrowed count).
        // Scans beyond total_copies are handled separately as extra copies below.
        const phantomCount = Math.min(scanCount - r.available_copies, borrowedCopies);
        phantomReturns.push({
          resource_id: r.id,
          title: r.title,
          author: r.author,
          isbn: r.isbn,
          call_number: r.call_number,
          db_available: r.available_copies,
          scan_count: scanCount,
          phantom_count: phantomCount,
        });
      }

      if (scanCount > r.total_copies) {
        extraCopies.push({
          resource_id: r.id,
          title: r.title,
          author: r.author,
          isbn: r.isbn,
          call_number: r.call_number,
          total_copies: r.total_copies,
          scan_count: scanCount,
          extra_count: scanCount - r.total_copies,
        });
      }
    }

    const unknownScans: UnknownScan[] = Array.from(unknownIsbnMap.entries())
      .map(([isbn, scan_count]) => ({ isbn, scan_count }));

    return {
      session_id: sessionId,
      started_at: session.started_at,
      ended_at: session.ended_at!,
      total_scanned: entries.length,
      unique_isbns_scanned: scanCountMap.size,
      ghost_copies: ghostCopies.sort((a, b) => b.missing_count - a.missing_count),
      phantom_returns: phantomReturns.sort((a, b) => b.phantom_count - a.phantom_count),
      unknown_scans: unknownScans,
      extra_copies: extraCopies.sort((a, b) => b.extra_count - a.extra_count),
    };
  },

  async getCompletedSessions(institutionId: number): Promise<ScanSession[]> {
    return db.select().from(scanSessions)
      .where(and(eq(scanSessions.institution_id, institutionId), eq(scanSessions.status, 'completed')))
      .orderBy(desc(scanSessions.ended_at)) as Promise<ScanSession[]>;
  },
};
