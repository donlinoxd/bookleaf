import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import {
  eq, ne, and, or, like, desc, asc, sql, gte, lte, isNull, isNotNull,
  lt, count, sum, avg, max, inArray,
} from 'drizzle-orm';
import * as schema from '@bookleaf/db/schema';
import { hashPin, verifyPin, isLegacyHash } from '@bookleaf/db/database';
import { normalizeAuthorityName } from '../authorities/normalize';
import type { DbAdapter, SessionPrincipal } from './types';
import type { LoanRule, CategoryLimit, ResolvedPolicy } from '@bookleaf/types';
import { resolvePolicy, evaluateCheckout, PolicyError, type CheckoutCounters } from './loanPolicy';

const {
  institutions, users, resources, resourceCopies, borrowingRecords,
  reservations, fines, favorites, reviews, gateLogs, settings,
  authorityNames, resourceSubjects, scanSessions, scanEntries, sessions,
  DEFAULT_SETTINGS,
  loanRules, categoryLimits, circOverrides,
} = schema;

// ── Helpers ────────────────────────────────────────────────────────────────

function serializeSubjectHeadings(headings: string[] | null | undefined): string | null {
  if (!headings || headings.length === 0) return null;
  return JSON.stringify(headings);
}

function parseSubjectHeadings(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as string[]; } catch { return null; }
}

function serializeVariants(variants: string[] | null | undefined): string | null {
  if (!variants || variants.length === 0) return null;
  return JSON.stringify(variants);
}

function parseVariants(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    // Legacy non-JSON variants (mobile stored comma-or-free text); treat as single.
    return [raw];
  }
}

function mapResourceRow(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, subject_headings: parseSubjectHeadings(row.subject_headings as string | null) };
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

function monthLabel(yyyymm: string): string {
  const [year, month] = yyyymm.split('-');
  return `${MONTH_LABELS[month] ?? month} ${year}`;
}

// ── Migrations ─────────────────────────────────────────────────────────────

function runMigrations(rawDb: Database.Database, ...sqlFiles: string[]): void {
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('foreign_keys = ON');
  // Create a migration tracking table so we only run each file once.
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS _bookleaf_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  for (let i = 0; i < sqlFiles.length; i++) {
    const migrationName = `migration_${String(i).padStart(4, '0')}`;
    const already = rawDb.prepare('SELECT 1 FROM _bookleaf_migrations WHERE name = ?').get(migrationName);
    if (already) continue;
    const sqlFile = sqlFiles[i];
    const statements = sqlFile.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      try {
        rawDb.exec(trimmed);
      } catch (err: unknown) {
        // Tolerate "already exists" errors so this migration can be applied
        // to an existing database that was created before migration tracking
        // was introduced.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('already exists')) throw err;
      }
    }
    rawDb.prepare('INSERT INTO _bookleaf_migrations (name) VALUES (?)').run(migrationName);
  }
}

function seedDefaultsIfEmpty(rawDb: Database.Database): void {
  const row = rawDb.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number };
  if (row.c === 0) {
    const insert = rawDb.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    const insertMany = rawDb.transaction(() => {
      for (const s of DEFAULT_SETTINGS) {
        insert.run(s.key, s.value);
      }
    });
    insertMany();
  }
}

// ── Settings helper (replaces SettingsService) ─────────────────────────────

type Settings = {
  fine_per_day: number;
  max_borrow_days: number;
  max_books_per_member: number;
  institution_name: string;
  grace_period_days: number;
  max_renewals: number;
};

async function getSettings(db: ReturnType<typeof drizzle>): Promise<Settings> {
  const rows = await db.select().from(settings);
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    fine_per_day: parseFloat(map.fine_per_day ?? '5'),
    max_borrow_days: parseInt(map.max_borrow_days ?? '7'),
    max_books_per_member: parseInt(map.max_books_per_member ?? '3'),
    institution_name: map.institution_name ?? 'My School Library',
    grace_period_days: parseInt(map.grace_period_days ?? '0'),
    max_renewals: parseInt(map.max_renewals ?? '2'),
  };
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createSqliteAdapter(
  dbPath: string,
  ...sqlFiles: string[]
): DbAdapter {
  const rawDb = new Database(dbPath);
  runMigrations(rawDb, ...sqlFiles);
  const db = drizzle(rawDb);
  seedDefaultsIfEmpty(rawDb);

  // Replace a resource's subject links and re-derive its denormalized
  // subject_headings JSON from the linked authorities' preferred names.
  function syncResourceSubjects(resourceId: number, authorityIds: number[] | undefined): void {
    if (authorityIds === undefined) return; // caller didn't touch subjects
    const unique = [...new Set(authorityIds)];
    rawDb.prepare('DELETE FROM resource_subjects WHERE resource_id = ?').run(resourceId);
    const insert = rawDb.prepare('INSERT OR IGNORE INTO resource_subjects (resource_id, authority_id) VALUES (?, ?)');
    for (const aid of unique) insert.run(resourceId, aid);
    const names = unique.length
      ? (rawDb.prepare(
          `SELECT name FROM authority_names WHERE id IN (${unique.map(() => '?').join(',')}) ORDER BY name`,
        ).all(...unique) as { name: string }[]).map(n => n.name)
      : [];
    rawDb.prepare('UPDATE resources SET subject_headings = ? WHERE id = ?')
      .run(names.length ? JSON.stringify(names) : null, resourceId);
  }

  // If a publisher/author authority is linked, force the denormalized text to its name.
  function authorityNameFor(authorityId: number | null | undefined): string | undefined {
    if (authorityId == null) return undefined;
    const row = rawDb.prepare('SELECT name FROM authority_names WHERE id = ?').get(authorityId) as { name: string } | undefined;
    return row?.name;
  }

  // After an authority's preferred name changes, propagate it to the denormalized
  // text columns on every resource that links to it (author/publisher) and
  // re-derive subject_headings for resources that use it as a subject. Assumes the
  // authority_names row already holds the NEW name. Wrapped in a transaction so the
  // multi-row rewrite is atomic.
  function resyncDenormalizedTextForAuthority(authorityId: number, newName: string): void {
    const tx = rawDb.transaction(() => {
      rawDb.prepare('UPDATE resources SET author = ? WHERE author_authority_id = ?').run(newName, authorityId);
      rawDb.prepare('UPDATE resources SET publisher = ? WHERE publisher_authority_id = ?').run(newName, authorityId);
      const affected = rawDb.prepare('SELECT DISTINCT resource_id FROM resource_subjects WHERE authority_id = ?').all(authorityId) as { resource_id: number }[];
      const subjNames = rawDb.prepare(
        `SELECT an.name AS name FROM resource_subjects rs
           JOIN authority_names an ON an.id = rs.authority_id
          WHERE rs.resource_id = ? ORDER BY an.name`,
      );
      const setSubjects = rawDb.prepare('UPDATE resources SET subject_headings = ? WHERE id = ?');
      for (const a of affected) {
        const names = (subjNames.all(a.resource_id) as { name: string }[]).map(n => n.name);
        setSubjects.run(names.length ? JSON.stringify(names) : null, a.resource_id);
      }
    });
    tx();
  }

  async function ensureDefaultRules(institutionId: number): Promise<void> {
    const existing = await db.select({ id: loanRules.id }).from(loanRules)
      .where(and(eq(loanRules.institution_id, institutionId),
        eq(loanRules.user_type, 'ANY'), eq(loanRules.material_type, 'ANY'))).limit(1);
    const limitExists = await db.select({ id: categoryLimits.id }).from(categoryLimits)
      .where(and(eq(categoryLimits.institution_id, institutionId), eq(categoryLimits.user_type, 'ANY'))).limit(1);
    if (existing.length === 0 || limitExists.length === 0) {
      const cfg = await getSettings(db);
      if (existing.length === 0) {
        await db.insert(loanRules).values({
          institution_id: institutionId, user_type: 'ANY', material_type: 'ANY',
          loan_period_days: cfg.max_borrow_days, type_limit: null,
          max_renewals: cfg.max_renewals, renewal_period_days: null,
          fine_per_day: cfg.fine_per_day, grace_period_days: cfg.grace_period_days,
          fine_max: null, is_loanable: true, is_holdable: true,
        }).onConflictDoNothing();
      }
      if (limitExists.length === 0) {
        await db.insert(categoryLimits).values({
          institution_id: institutionId, user_type: 'ANY',
          overall_limit: cfg.max_books_per_member, fines_block_threshold: 0,
        }).onConflictDoNothing();
      }
    }
  }

  async function loadRulesAndLimits(institutionId: number): Promise<{ rules: LoanRule[]; limits: CategoryLimit[] }> {
    await ensureDefaultRules(institutionId);
    const rules = await db.select().from(loanRules).where(eq(loanRules.institution_id, institutionId)) as unknown as LoanRule[];
    const limits = await db.select().from(categoryLimits).where(eq(categoryLimits.institution_id, institutionId)) as unknown as CategoryLimit[];
    return { rules, limits };
  }

  async function fetchCheckoutCounters(userId: number, materialType: string): Promise<CheckoutCounters> {
    const totalRow = await db.select({ c: sql<number>`count(*)` }).from(borrowingRecords)
      .where(and(eq(borrowingRecords.user_id, userId), isNull(borrowingRecords.returned_at)));
    const typeRow = await db.select({ c: sql<number>`count(*)` }).from(borrowingRecords)
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(eq(borrowingRecords.user_id, userId), isNull(borrowingRecords.returned_at), sql`${resources.material_type} = ${materialType}`));
    const fineRow = await db.select({ s: sum(fines.amount) }).from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .where(and(eq(borrowingRecords.user_id, userId), eq(fines.paid, false)));
    return {
      activeTotal: Number(totalRow[0]?.c ?? 0),
      activeOfType: Number(typeRow[0]?.c ?? 0),
      unpaidFines: Number(fineRow[0]?.s ?? 0),
    };
  }

  async function resolveForResource(institutionId: number, userId: number, resourceId: number): Promise<ResolvedPolicy> {
    const { rules, limits } = await loadRulesAndLimits(institutionId);
    const patron = await db.select({ user_type: users.user_type }).from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
    const resource = await db.select({
      material_type: resources.material_type, loan_period_days: resources.loan_period_days, is_loanable: resources.is_loanable,
    }).from(resources).where(eq(resources.id, resourceId)).limit(1).then(r => r[0] ?? null);
    if (!patron || !resource) throw new Error('Patron or resource not found');
    return resolvePolicy(rules, limits, { user_type: patron.user_type }, {
      material_type: resource.material_type, loan_period_days: resource.loan_period_days, is_loanable: resource.is_loanable,
    });
  }

  async function checkoutCopy(
    copyId: number,
    userId: number,
    opts?: { override?: boolean; actedByUserId?: number; institutionId?: number; note?: string },
  ): Promise<{ borrowingId: number }> {
    const copyInfo = await db.select({ resource_id: resourceCopies.resource_id, institution_id: resources.institution_id, material_type: resources.material_type })
      .from(resourceCopies)
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(eq(resourceCopies.id, copyId)).limit(1).then(r => r[0] ?? null);
    if (!copyInfo) throw new Error('This copy is no longer available. Please pick another.');

    const policy = await resolveForResource(copyInfo.institution_id, userId, copyInfo.resource_id);
    const counters = await fetchCheckoutCounters(userId, copyInfo.material_type);
    const violations = evaluateCheckout(policy, counters);
    if (violations.length > 0 && !opts?.override) throw new PolicyError(violations);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + policy.loan_period_days);

    const doCheckout = rawDb.transaction(() => {
      const claimed = rawDb.prepare(
        `UPDATE resource_copies SET status = 'borrowed' WHERE id = ? AND status = 'available' AND condition != 'lost' RETURNING id, resource_id`,
      ).all(copyId) as { id: number; resource_id: number }[];
      if (claimed.length === 0) throw new Error('This copy is no longer available. Please pick another.');

      if (violations.length > 0 && opts?.override) {
        const insertOverride = rawDb.prepare(
          `INSERT INTO circ_overrides (institution_id, acted_by_user_id, patron_user_id, copy_id, reason_code, note) VALUES (?, ?, ?, ?, ?, ?)`,
        );
        for (const v of violations) {
          insertOverride.run(opts.institutionId ?? copyInfo.institution_id, opts.actedByUserId ?? userId, userId, copyId, v.reason_code, opts.note ?? null);
        }
      }

      const borrowResult = rawDb.prepare(
        `INSERT INTO borrowing_records (copy_id, user_id, due_date) VALUES (?, ?, ?) RETURNING id`,
      ).get(copyId, userId, dueDate.toISOString()) as { id: number };
      rawDb.prepare(`UPDATE resources SET available_copies = available_copies - 1 WHERE id = ?`).run(claimed[0].resource_id);
      rawDb.prepare(`UPDATE reservations SET status = 'fulfilled' WHERE resource_id = ? AND user_id = ? AND status = 'active'`).run(claimed[0].resource_id, userId);
      return { borrowingId: borrowResult.id };
    });
    return doCheckout();
  }

  async function returnBorrowing(
    borrowingId: number,
    condition: string,
  ): Promise<{ id: number; borrowing_id: number; amount: number; paid: boolean; paid_at: null } | null> {
    const record = await db.select().from(borrowingRecords)
      .where(eq(borrowingRecords.id, borrowingId)).limit(1).then(r => r[0] ?? null);
    if (!record) throw new Error('Borrowing record not found');

    const now = new Date();
    const due = new Date(record.due_date);
    let fineAmount = 0;

    if (now > due) {
      const copyRes = await db.select({ resource_id: resourceCopies.resource_id, institution_id: resources.institution_id })
        .from(resourceCopies)
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resourceCopies.id, record.copy_id)).limit(1).then(r => r[0] ?? null);
      if (copyRes) {
        const policy = await resolveForResource(copyRes.institution_id, record.user_id, copyRes.resource_id);
        const daysLate = Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
        const billableDays = Math.max(0, daysLate - policy.grace_period_days);
        fineAmount = billableDays * policy.fine_per_day;
        if (policy.fine_max != null) fineAmount = Math.min(fineAmount, policy.fine_max);
      }
    }

    const typedCondition = (condition ?? 'good') as 'good' | 'damaged' | 'lost';
    const doReturn = rawDb.transaction(() => {
      rawDb.prepare(`UPDATE borrowing_records SET returned_at = ?, fine_amount = ? WHERE id = ?`).run(now.toISOString(), fineAmount, borrowingId);
      rawDb.prepare(`UPDATE resource_copies SET status = 'available', condition = ? WHERE id = ?`).run(typedCondition, record.copy_id);
      if (typedCondition !== 'lost') {
        const copy = rawDb.prepare(`SELECT resource_id FROM resource_copies WHERE id = ? LIMIT 1`).get(record.copy_id) as { resource_id: number } | undefined;
        if (copy) rawDb.prepare(`UPDATE resources SET available_copies = available_copies + 1 WHERE id = ?`).run(copy.resource_id);
      }
      if (fineAmount > 0) {
        const fineResult = rawDb.prepare(`INSERT INTO fines (borrowing_id, amount) VALUES (?, ?) RETURNING id`).get(borrowingId, fineAmount) as { id: number };
        return { id: fineResult.id, borrowing_id: borrowingId, amount: fineAmount, paid: false, paid_at: null };
      }
      return null;
    });
    return doReturn();
  }

  const adapterImpl: DbAdapter = {
    // ── Auth ────────────────────────────────────────────────────────────────

    async authenticateMember(idNumber, pin) {
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
      if (isLegacyHash(row.pin_hash)) {
        await db.update(users).set({ pin_hash: hashPin(pin) }).where(eq(users.id, row.id));
      }
      const { pin_hash: _, ...safeUser } = row;

      // Generate a 32-byte hex token using Node.js crypto
      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await db.insert(sessions).values({
        token,
        user_id: row.id,
        expires_at: expiresAt,
      });

      return { user: safeUser as Record<string, unknown>, token, expires_at: expiresAt };
    },

    async validateSession(token) {
      // Purge expired sessions first
      await db.delete(sessions).where(
        lt(sql`datetime(${sessions.expires_at})`, sql`datetime('now')`),
      );
      const row = await db.select({
        user_id: sessions.user_id,
        role: users.role,
        institution_id: users.institution_id,
      }).from(sessions)
        .innerJoin(users, eq(sessions.user_id, users.id))
        .where(eq(sessions.token, token))
        .limit(1)
        .then(r => r[0] ?? null);

      if (!row) return null;
      return { user_id: row.user_id, institution_id: row.institution_id, role: row.role };
    },

    async logout(token) {
      await db.delete(sessions).where(eq(sessions.token, token));
      return { ok: true };
    },

    async getInstitutionInfo() {
      const row = await db.select({ id: institutions.id, name: institutions.name })
        .from(institutions)
        .limit(1)
        .then(r => r[0] ?? null);
      return { institutionId: row?.id ?? 1, institutionName: row?.name ?? 'Library' };
    },

    // ── Catalog ─────────────────────────────────────────────────────────────

    async searchBooks(institutionId, query) {
      const q = `%${query}%`;
      const rows = await db.select({
        id: resources.id,
        title: resources.title,
        author: resources.author,
        genre: resources.genre,
        year: resources.year,
        material_type: resources.material_type,
        cover_uri: resources.cover_uri,
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
          ),
        ))
        .orderBy(resources.title)
        .limit(50);
      return rows;
    },

    async searchBooksFiltered(institutionId, query, filters) {
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
      if (filters.materialType) conditions.push(eq(resources.material_type, filters.materialType as any) as any);
      if (filters.yearFrom) conditions.push(gte(resources.year, filters.yearFrom) as any);
      if (filters.yearTo) conditions.push(lte(resources.year, filters.yearTo) as any);
      if (filters.language) conditions.push(like(resources.language, `%${filters.language}%`) as any);
      return db.select({
        id: resources.id,
        title: resources.title,
        author: resources.author,
        genre: resources.genre,
        year: resources.year,
        material_type: resources.material_type,
        language: resources.language,
        cover_uri: resources.cover_uri,
        available_copies: resources.available_copies,
        total_copies: resources.total_copies,
      }).from(resources)
        .where(and(...conditions))
        .orderBy(resources.title)
        .limit(100);
    },

    async getRecentlyAdded(institutionId, limit) {
      return db.select({
        id: resources.id,
        title: resources.title,
        author: resources.author,
        genre: resources.genre,
        year: resources.year,
        material_type: resources.material_type,
        cover_uri: resources.cover_uri,
        available_copies: resources.available_copies,
        total_copies: resources.total_copies,
      }).from(resources)
        .where(eq(resources.institution_id, institutionId))
        .orderBy(desc(resources.added_at))
        .limit(limit);
    },

    async getPopular(institutionId, limit) {
      return db.select({
        id: resources.id,
        title: resources.title,
        author: resources.author,
        genre: resources.genre,
        year: resources.year,
        material_type: resources.material_type,
        cover_uri: resources.cover_uri,
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

    async getBookDetail(resourceId) {
      const resource = await db.select({
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
        edition: resources.edition,
        url: resources.url,
        subject_headings: resources.subject_headings,
        cover_uri: resources.cover_uri,
        available_copies: resources.available_copies,
        total_copies: resources.total_copies,
      }).from(resources)
        .where(eq(resources.id, resourceId))
        .limit(1)
        .then(r => r[0] ?? null);

      if (!resource) return null;

      const copies = await db.select({ shelf_location: resourceCopies.shelf_location })
        .from(resourceCopies)
        .where(eq(resourceCopies.resource_id, resourceId));

      const shelf_locations = [...new Set(
        copies.map(c => c.shelf_location).filter((s): s is string => !!s),
      )];

      return { ...mapResourceRow(resource as Record<string, unknown>), shelf_locations };
    },

    async getSimilarBooks(resourceId) {
      const book = await db.select({
        author: resources.author,
        genre: resources.genre,
        institution_id: resources.institution_id,
      }).from(resources).where(eq(resources.id, resourceId)).limit(1).then(r => r[0] ?? null);
      if (!book) return [];
      const conditions = [eq(resources.institution_id, book.institution_id), ne(resources.id, resourceId)];
      const authorOrGenre: ReturnType<typeof eq>[] = [];
      if (book.author) authorOrGenre.push(eq(resources.author, book.author));
      if (book.genre) authorOrGenre.push(eq(resources.genre, book.genre) as any);
      if (authorOrGenre.length === 0) return [];
      return db.select({
        id: resources.id,
        title: resources.title,
        author: resources.author,
        genre: resources.genre,
        cover_uri: resources.cover_uri,
        available_copies: resources.available_copies,
        total_copies: resources.total_copies,
      }).from(resources)
        .where(and(...conditions, or(...authorOrGenre)))
        .limit(8);
    },

    // ── Books (patron) ───────────────────────────────────────────────────────

    async getBookReviews(resourceId) {
      const reviewList = await db.select({
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
        .orderBy(desc(reviews.created_at));

      const avgRow = await db.select({ avg: avg(reviews.rating) })
        .from(reviews)
        .where(eq(reviews.resource_id, resourceId))
        .then(r => r[0]);

      return { reviews: reviewList, avg_rating: avgRow?.avg != null ? Number(avgRow.avg) : null };
    },

    async submitReview(resourceId, userId, rating, comment) {
      // Check eligibility: user must have borrowed this resource
      const eligible = await db.select({ id: borrowingRecords.id })
        .from(borrowingRecords)
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .where(and(
          eq(borrowingRecords.user_id, userId),
          eq(resourceCopies.resource_id, resourceId),
        ))
        .limit(1)
        .then(r => r.length > 0);

      if (!eligible) throw new Error('You must have borrowed this item to leave a review');

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
      return { ok: true as const };
    },

    async toggleFavorite(resourceId, userId) {
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

    async getFavoriteStatus(resourceId, userId) {
      const rows = await db.select({ id: favorites.id })
        .from(favorites)
        .where(and(eq(favorites.user_id, userId), eq(favorites.resource_id, resourceId)))
        .limit(1);
      return { favorited: rows.length > 0 };
    },

    async getMemberFavorites(userId) {
      const member = await db.select({ name: users.name })
        .from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
      if (!member) return null;
      const items = await db.select({
        id: favorites.id,
        user_id: favorites.user_id,
        resource_id: favorites.resource_id,
        created_at: favorites.created_at,
        book_title: resources.title,
        book_author: resources.author,
        available_copies: resources.available_copies,
      }).from(favorites)
        .innerJoin(resources, eq(favorites.resource_id, resources.id))
        .where(eq(favorites.user_id, userId));
      return { member_name: member.name, favorites: items };
    },

    async reserveBook(resourceId, userId) {
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
      return result[0];
    },

    // ── Me ───────────────────────────────────────────────────────────────────

    async getMemberBorrows(userId) {
      const member = await db.select({ name: users.name })
        .from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
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
        .where(eq(borrowingRecords.user_id, userId))
        .orderBy(desc(borrowingRecords.borrowed_at));

      const fineRows = await db.select({
        borrowing_id: fines.borrowing_id,
        total: sum(fines.amount),
      }).from(fines)
        .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
        .where(and(eq(borrowingRecords.user_id, userId), eq(fines.paid, false)))
        .groupBy(fines.borrowing_id);

      const fineMap: Record<number, number> = {};
      for (const f of fineRows) {
        if (f.borrowing_id !== null) fineMap[f.borrowing_id] = Number(f.total ?? 0);
      }

      return {
        member_name: member.name,
        borrows: borrows.map(b => ({ ...b, fine_amount: fineMap[b.id] ?? 0 })),
        total_fines: Object.values(fineMap).reduce((a, b) => a + b, 0),
      };
    },

    async getMemberReservations(userId) {
      const member = await db.select({ name: users.name })
        .from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
      if (!member) return null;

      const holds = await db.select({
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
        .orderBy(asc(reservations.reserved_at));

      return { member_name: member.name, reservations: holds.filter(h => h.status === 'active') };
    },

    // ── Borrows ──────────────────────────────────────────────────────────────

    async renewBorrow(borrowingId, userId) {
      const record = await db.select({ user_id: borrowingRecords.user_id })
        .from(borrowingRecords).where(eq(borrowingRecords.id, borrowingId)).limit(1).then(r => r[0] ?? null);
      if (!record) throw new Error('Borrowing record not found');
      if (record.user_id !== userId) throw new Error('Not allowed');

      const full = await db.select().from(borrowingRecords)
        .where(eq(borrowingRecords.id, borrowingId)).limit(1).then(r => r[0] ?? null);
      if (!full) throw new Error('Borrowing record not found');
      if (full.returned_at) throw new Error('This item has already been returned');

      const copy = await db.select({ resource_id: resourceCopies.resource_id, institution_id: resources.institution_id })
        .from(resourceCopies)
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resourceCopies.id, full.copy_id)).limit(1).then(r => r[0] ?? null);
      if (!copy) throw new Error('Copy not found');

      const policy = await resolveForResource(copy.institution_id, userId, copy.resource_id);
      if (full.renewal_count >= policy.max_renewals) {
        throw new Error(`Maximum renewals (${policy.max_renewals}) reached`);
      }
      const newDue = new Date(full.due_date);
      newDue.setDate(newDue.getDate() + policy.renewal_period_days);
      await db.update(borrowingRecords).set({
        due_date: newDue.toISOString(),
        renewal_count: full.renewal_count + 1,
      }).where(eq(borrowingRecords.id, borrowingId));
      return { new_due_date: newDue.toISOString() };
    },

    // ── Gate ─────────────────────────────────────────────────────────────────

    async gateLogByUserId(userId, institutionId, method) {
      const user = await db.select({ id: users.id, name: users.name, is_active: users.is_active })
        .from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
      if (!user || !user.is_active) return null;

      // Determine direction: toggle from last
      const last = await db.select({ direction: gateLogs.direction })
        .from(gateLogs)
        .where(eq(gateLogs.user_id, userId))
        .orderBy(desc(gateLogs.logged_at))
        .limit(1)
        .then(r => r[0] ?? null);
      const direction = last?.direction === 'in' ? 'out' : 'in';
      const logged_at = new Date().toISOString().replace('T', ' ').slice(0, 19);

      await db.insert(gateLogs).values({ institution_id: institutionId, user_id: userId, direction, method, logged_at });
      return { user_name: user.name, direction, logged_at };
    },

    async gateVerifyAndLog(idNumber, pin, institutionId) {
      const user = await db.select({ id: users.id, name: users.name, pin_hash: users.pin_hash, is_active: users.is_active })
        .from(users).where(eq(users.id_number, idNumber)).limit(1).then(r => r[0] ?? null);
      if (!user || !user.is_active) return null;
      if (!verifyPin(pin, user.pin_hash)) return null;
      if (isLegacyHash(user.pin_hash)) {
        await db.update(users).set({ pin_hash: hashPin(pin) }).where(eq(users.id, user.id));
      }

      const last = await db.select({ direction: gateLogs.direction })
        .from(gateLogs)
        .where(eq(gateLogs.user_id, user.id))
        .orderBy(desc(gateLogs.logged_at))
        .limit(1)
        .then(r => r[0] ?? null);
      const direction = last?.direction === 'in' ? 'out' : 'in';
      const logged_at = new Date().toISOString().replace('T', ' ').slice(0, 19);

      await db.insert(gateLogs).values({ institution_id: institutionId, user_id: user.id, direction, method: 'browser', logged_at });
      return { user_name: user.name, direction, logged_at };
    },

    // ── Admin: Books ─────────────────────────────────────────────────────────

    async adminLoadImportContext(institutionId) {
      const catalog = rawDb.prepare(
        'SELECT id, isbn, title, author FROM resources WHERE institution_id = ?',
      ).all(institutionId) as { id: number; isbn: string | null; title: string; author: string }[];
      const codes = rawDb.prepare(
        'SELECT rc.barcode AS barcode, rc.accession_number AS accession ' +
        'FROM resource_copies rc JOIN resources r ON r.id = rc.resource_id ' +
        'WHERE r.institution_id = ?',
      ).all(institutionId) as { barcode: string | null; accession: string | null }[];
      return {
        catalog,
        barcodes: codes.map(c => c.barcode).filter((b): b is string => !!b),
        accessions: codes.map(c => c.accession).filter((a): a is string => !!a),
      };
    },

    async adminBulkImport(institutionId, plan, job) {
      const tx = rawDb.transaction(() => {
        let created = 0;
        let copiesAdded = 0;

        const insertResource = rawDb.prepare(
          `INSERT INTO resources
            (institution_id, material_type, isbn, issn, title, author, publisher, year, genre,
             description, subtitle, edition, volume, series_title, language, call_number,
             call_number_type, subject_headings, total_copies, available_copies)
           VALUES (@institution_id, @material_type, @isbn, @issn, @title, @author, @publisher,
             @year, @genre, @description, @subtitle, @edition, @volume, @series_title, @language,
             @call_number, @call_number_type, @subject_headings, @total_copies, @available_copies)`,
        );
        const insertCopy = rawDb.prepare(
          `INSERT INTO resource_copies (resource_id, copy_number, barcode, accession_number, shelf_location)
           VALUES (?, ?, ?, ?, ?)`,
        );
        const maxCopyNo = rawDb.prepare(
          'SELECT COALESCE(MAX(copy_number), 0) AS m FROM resource_copies WHERE resource_id = ?',
        );
        const bumpCopies = rawDb.prepare(
          'UPDATE resources SET total_copies = total_copies + ?, available_copies = available_copies + ? WHERE id = ?',
        );

        for (const n of plan.creates) {
          const r = insertResource.run({
            institution_id: institutionId,
            material_type: n.material_type,
            isbn: n.isbn, issn: n.issn, title: n.title, author: n.author, publisher: n.publisher,
            year: n.year, genre: n.genre, description: n.description, subtitle: n.subtitle,
            edition: n.edition, volume: n.volume, series_title: n.series_title, language: n.language,
            call_number: n.call_number, call_number_type: n.call_number_type,
            subject_headings: serializeSubjectHeadings(n.subject_headings),
            total_copies: n.copies, available_copies: n.copies,
          });
          const resourceId = Number(r.lastInsertRowid);
          for (let i = 0; i < n.copies; i++) {
            const bc = i === 0 ? n.barcode : null;
            const ac = i === 0 ? n.accession_number : null;
            insertCopy.run(resourceId, i + 1, bc, ac, n.shelf_location);
          }
          created += 1;
        }

        for (const add of plan.copyAdds) {
          const startNo = (maxCopyNo.get(add.resourceId) as { m: number }).m;
          for (let i = 0; i < add.copies; i++) {
            insertCopy.run(add.resourceId, startNo + i + 1, null, null, null);
          }
          bumpCopies.run(add.copies, add.copies, add.resourceId);
          copiesAdded += add.copies;
        }

        const j = rawDb.prepare(
          `INSERT INTO import_jobs
            (institution_id, imported_by_user_id, filename, duplicate_strategy, row_count,
             created_count, copies_added_count, skipped_count, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        ).run(
          institutionId, job.importedByUserId, job.filename, job.duplicateStrategy,
          job.rowCount, created, copiesAdded, job.skippedCount,
        );

        return { created, copiesAdded, jobId: Number(j.lastInsertRowid) };
      });

      return tx();
    },

    async adminListBooks(institutionId, q) {
      if (q) {
        const qp = `%${q}%`;
        const rows = await db.select().from(resources)
          .where(and(
            eq(resources.institution_id, institutionId),
            or(
              like(resources.title, qp),
              like(resources.author, qp),
              like(resources.isbn, qp),
              like(resources.issn, qp),
              like(resources.genre, qp),
              like(resources.subject_headings, qp),
              like(resources.material_type, qp),
            ),
          ))
          .orderBy(asc(resources.title));
        return rows.map(r => mapResourceRow(r as Record<string, unknown>));
      }
      const rows = await db.select().from(resources)
        .where(eq(resources.institution_id, institutionId))
        .orderBy(asc(resources.title));
      return rows.map(r => mapResourceRow(r as Record<string, unknown>));
    },

    async adminGetBook(id) {
      const row = await db.select().from(resources).where(eq(resources.id, id)).limit(1).then(r => r[0] ?? null);
      return row ? mapResourceRow(row as Record<string, unknown>) : null;
    },

    async adminGetBookWithCopies(id) {
      const book = await db.select().from(resources).where(eq(resources.id, id)).limit(1).then(r => r[0] ?? null);
      if (!book) return null;
      const copies = await db.select().from(resourceCopies)
        .where(eq(resourceCopies.resource_id, id))
        .orderBy(asc(resourceCopies.copy_number));
      return { ...mapResourceRow(book as Record<string, unknown>), copies };
    },

    async adminCreateBook(institutionId, data, copies) {
      const d = data as any;
      const result = await db.insert(resources).values({
        institution_id: institutionId,
        material_type: d.material_type ?? 'BOOK',
        isbn: d.isbn ?? null,
        issn: d.issn ?? null,
        title: d.title,
        author: authorityNameFor(d.author_authority_id) ?? d.author,
        publisher: authorityNameFor(d.publisher_authority_id) ?? d.publisher ?? null,
        year: d.year ?? null,
        genre: d.genre ?? null,
        description: d.description ?? null,
        cover_uri: d.cover_uri ?? null,
        subtitle: d.subtitle ?? null,
        edition: d.edition ?? null,
        volume: d.volume ?? null,
        issue_number: d.issue_number ?? null,
        series_title: d.series_title ?? null,
        doi: d.doi ?? null,
        url: d.url ?? null,
        duration: d.duration ?? null,
        language: d.language ?? null,
        call_number: d.call_number ?? null,
        call_number_type: d.call_number_type ?? null,
        content_type: d.content_type ?? null,
        media_type: d.media_type ?? null,
        carrier_type: d.carrier_type ?? null,
        frequency: d.frequency ?? null,
        container_title: d.container_title ?? null,
        pages: d.pages ?? null,
        thesis_degree: d.thesis_degree ?? null,
        thesis_institution: d.thesis_institution ?? null,
        thesis_advisor: d.thesis_advisor ?? null,
        subject_headings: serializeSubjectHeadings(d.subject_headings),
        author_authority_id: d.author_authority_id ?? null,
        publisher_authority_id: d.publisher_authority_id ?? null,
        is_loanable: d.is_loanable ?? true,
        loan_period_days: d.loan_period_days ?? null,
        total_copies: d.total_copies ?? 1,
        available_copies: d.total_copies ?? 1,
      }).returning({ id: resources.id });

      const resourceId = result[0].id;
      const totalCopies = d.total_copies ?? 1;
      if (totalCopies > 0) {
        const copyRows = Array.from({ length: totalCopies }, (_: unknown, i: number) => ({
          resource_id: resourceId,
          copy_number: i + 1,
          accession_number: copies[i]?.accession_number ?? null,
          barcode: copies[i]?.barcode ?? null,
          shelf_location: copies[i]?.shelf_location ?? null,
        }));
        await db.insert(resourceCopies).values(copyRows);
      }
      syncResourceSubjects(resourceId, d.subject_authority_ids as number[] | undefined);
      return { id: resourceId };
    },

    async adminUpdateBook(id, data) {
      const d = data as any;
      await db.update(resources).set({
        material_type: d.material_type,
        title: d.title,
        author: authorityNameFor(d.author_authority_id) ?? d.author,
        publisher: authorityNameFor(d.publisher_authority_id) ?? d.publisher ?? null,
        year: d.year ?? null,
        genre: d.genre ?? null,
        description: d.description ?? null,
        cover_uri: d.cover_uri ?? null,
        isbn: d.isbn ?? null,
        issn: d.issn ?? null,
        subtitle: d.subtitle ?? null,
        edition: d.edition ?? null,
        volume: d.volume ?? null,
        issue_number: d.issue_number ?? null,
        series_title: d.series_title ?? null,
        doi: d.doi ?? null,
        url: d.url ?? null,
        duration: d.duration ?? null,
        language: d.language ?? null,
        call_number: d.call_number ?? null,
        call_number_type: d.call_number_type ?? null,
        content_type: d.content_type ?? null,
        media_type: d.media_type ?? null,
        carrier_type: d.carrier_type ?? null,
        frequency: d.frequency ?? null,
        container_title: d.container_title ?? null,
        pages: d.pages ?? null,
        thesis_degree: d.thesis_degree ?? null,
        thesis_institution: d.thesis_institution ?? null,
        thesis_advisor: d.thesis_advisor ?? null,
        subject_headings: serializeSubjectHeadings(d.subject_headings),
        author_authority_id: d.author_authority_id ?? null,
        publisher_authority_id: d.publisher_authority_id ?? null,
        is_loanable: d.is_loanable,
        loan_period_days: d.loan_period_days ?? null,
      }).where(eq(resources.id, id));
      syncResourceSubjects(id, d.subject_authority_ids as number[] | undefined);
    },

    async adminDeleteBook(id) {
      await db.delete(resources).where(eq(resources.id, id));
    },

    async adminAddCopy(resourceId) {
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

    // ── Admin: Authorities ─────────────────────────────────────────────────

    async adminCreateAuthority(input) {
      const name = input.name.trim();
      const normalized = normalizeAuthorityName(name);
      const existing = await db.select({ id: authorityNames.id })
        .from(authorityNames)
        .where(and(
          eq(authorityNames.institution_id, input.institutionId),
          eq(authorityNames.name_type, input.type as any),
          eq(authorityNames.normalized_name, normalized),
        ))
        .limit(1)
        .then(r => r[0] ?? null);
      if (existing) return { id: existing.id };

      const result = await db.insert(authorityNames).values({
        institution_id: input.institutionId,
        name,
        name_type: input.type as any,
        variants: serializeVariants(input.variants),
        normalized_name: normalized,
      }).returning({ id: authorityNames.id });
      return { id: result[0].id };
    },

    async adminListAuthorities(institutionId, filter) {
      const conditions: any[] = [eq(authorityNames.institution_id, institutionId)];
      if (filter.type) conditions.push(eq(authorityNames.name_type, filter.type as any));
      if (filter.q) {
        const qp = `%${filter.q}%`;
        conditions.push(or(like(authorityNames.name, qp), like(authorityNames.variants, qp)));
      }
      const rows = await db.select().from(authorityNames)
        .where(and(...conditions))
        .orderBy(asc(authorityNames.name));

      const usage = rawDb.prepare(
        `SELECT a.id AS id,
           (SELECT COUNT(*) FROM resources r WHERE r.author_authority_id = a.id)
         + (SELECT COUNT(*) FROM resources r WHERE r.publisher_authority_id = a.id)
         + (SELECT COUNT(*) FROM resource_subjects rs WHERE rs.authority_id = a.id) AS usage_count
         FROM authority_names a WHERE a.institution_id = ?`,
      ).all(institutionId) as { id: number; usage_count: number }[];
      const usageMap = new Map(usage.map(u => [u.id, u.usage_count]));

      return rows.map(r => ({
        ...r,
        variants: parseVariants(r.variants),
        usage_count: usageMap.get(r.id) ?? 0,
      }));
    },

    async adminGetAuthority(id) {
      const row = await db.select().from(authorityNames).where(eq(authorityNames.id, id)).limit(1).then(r => r[0] ?? null);
      if (!row) return null;
      const usageRow = rawDb.prepare(
        `SELECT (SELECT COUNT(*) FROM resources r WHERE r.author_authority_id = ?)
              + (SELECT COUNT(*) FROM resources r WHERE r.publisher_authority_id = ?)
              + (SELECT COUNT(*) FROM resource_subjects rs WHERE rs.authority_id = ?) AS usage_count`,
      ).get(id, id, id) as { usage_count: number };
      return { ...row, variants: parseVariants(row.variants), usage_count: usageRow.usage_count };
    },

    async adminUpdateAuthority(id, data) {
      const patch: Record<string, unknown> = {};
      if (data.name !== undefined) {
        patch.name = data.name.trim();
        patch.normalized_name = normalizeAuthorityName(data.name);
      }
      if (data.type !== undefined) patch.name_type = data.type;
      if (data.variants !== undefined) patch.variants = serializeVariants(data.variants);
      if (Object.keys(patch).length === 0) return;
      await db.update(authorityNames).set(patch as any).where(eq(authorityNames.id, id));
      // Keep denormalized resource text in sync when the preferred name changed.
      if (patch.name !== undefined) resyncDenormalizedTextForAuthority(id, patch.name as string);
    },

    async adminDeleteAuthority(id) {
      const usage = rawDb.prepare(
        `SELECT (SELECT COUNT(*) FROM resources r WHERE r.author_authority_id = ?)
              + (SELECT COUNT(*) FROM resources r WHERE r.publisher_authority_id = ?)
              + (SELECT COUNT(*) FROM resource_subjects rs WHERE rs.authority_id = ?) AS c`,
      ).get(id, id, id) as { c: number };
      if (usage.c > 0) {
        throw new Error(`This authority is in use by ${usage.c} record(s). Merge it into another authority or unlink it first.`);
      }
      await db.delete(authorityNames).where(eq(authorityNames.id, id));
    },

    async adminMergeAuthorities(survivorId, loserIds) {
      const losers = loserIds.filter(id => id !== survivorId);
      if (losers.length === 0) return;

      const tx = rawDb.transaction(() => {
        const survivor = rawDb.prepare('SELECT id, name, variants FROM authority_names WHERE id = ?').get(survivorId) as
          { id: number; name: string; variants: string | null } | undefined;
        if (!survivor) throw new Error('Survivor authority not found');

        const placeholders = losers.map(() => '?').join(',');
        const loserRows = rawDb.prepare(
          `SELECT id, name, variants FROM authority_names WHERE id IN (${placeholders})`,
        ).all(...losers) as { id: number; name: string; variants: string | null }[];

        // 1. Repoint author + publisher FKs.
        rawDb.prepare(`UPDATE resources SET author_authority_id = ? WHERE author_authority_id IN (${placeholders})`).run(survivorId, ...losers);
        rawDb.prepare(`UPDATE resources SET publisher_authority_id = ? WHERE publisher_authority_id IN (${placeholders})`).run(survivorId, ...losers);

        // 2. Repoint subject links, dropping rows that would collide with an
        //    existing survivor link on the same resource (UNIQUE(resource_id, authority_id)).
        rawDb.prepare(
          `DELETE FROM resource_subjects
            WHERE authority_id IN (${placeholders})
              AND resource_id IN (SELECT resource_id FROM resource_subjects WHERE authority_id = ?)`,
        ).run(...losers, survivorId);
        rawDb.prepare(`UPDATE resource_subjects SET authority_id = ? WHERE authority_id IN (${placeholders})`).run(survivorId, ...losers);

        // 3. Fold loser names + variants into survivor variants (deduped).
        const folded = new Set(parseVariants(survivor.variants));
        for (const l of loserRows) {
          folded.add(l.name);
          for (const v of parseVariants(l.variants)) folded.add(v);
        }
        folded.delete(survivor.name);
        rawDb.prepare('UPDATE authority_names SET variants = ? WHERE id = ?')
          .run(serializeVariants([...folded]), survivorId);

        // 4. Re-sync denormalized text on resources now pointing at the survivor.
        rawDb.prepare('UPDATE resources SET author = ? WHERE author_authority_id = ?').run(survivor.name, survivorId);
        rawDb.prepare('UPDATE resources SET publisher = ? WHERE publisher_authority_id = ?').run(survivor.name, survivorId);

        // 5. Re-derive subject_headings JSON for every resource touched.
        const affected = rawDb.prepare('SELECT DISTINCT resource_id FROM resource_subjects WHERE authority_id = ?').all(survivorId) as { resource_id: number }[];
        const subjNames = rawDb.prepare(
          `SELECT an.name AS name FROM resource_subjects rs
             JOIN authority_names an ON an.id = rs.authority_id
            WHERE rs.resource_id = ? ORDER BY an.name`,
        );
        const setSubjects = rawDb.prepare('UPDATE resources SET subject_headings = ? WHERE id = ?');
        for (const a of affected) {
          const names = (subjNames.all(a.resource_id) as { name: string }[]).map(n => n.name);
          setSubjects.run(names.length ? JSON.stringify(names) : null, a.resource_id);
        }

        // 6. Delete losers.
        rawDb.prepare(`DELETE FROM authority_names WHERE id IN (${placeholders})`).run(...losers);
      });
      tx();
    },

    // ── Admin: Members ───────────────────────────────────────────────────────

    async adminListMembers(institutionId, q) {
      if (q) {
        const qp = `%${q}%`;
        return db.select().from(users)
          .where(and(
            eq(users.institution_id, institutionId),
            or(like(users.name, qp), like(users.id_number, qp)),
          ))
          .orderBy(asc(users.name));
      }
      return db.select().from(users)
        .where(eq(users.institution_id, institutionId))
        .orderBy(asc(users.name));
    },

    async adminGetMember(id) {
      return db.select().from(users).where(eq(users.id, id)).limit(1).then(r => r[0] ?? null);
    },

    async adminCreateMember(data) {
      const d = data as any;
      const pin_hash = hashPin(d.pin as string);
      const result = await db.insert(users).values({
        institution_id: d.institution_id,
        name: d.name,
        id_number: d.id_number,
        role: d.role,
        pin_hash,
        photo_uri: d.photo_uri ?? null,
        department: d.department ?? null,
        user_type: d.user_type ?? null,
      }).returning({ id: users.id });
      return { id: result[0].id };
    },

    async adminUpdateMember(id, data) {
      const d = data as any;
      await db.update(users).set({
        name: d.name,
        id_number: d.id_number,
        role: d.role,
        department: d.department ?? null,
        user_type: d.user_type ?? null,
      }).where(eq(users.id, id));
    },

    async adminSetMemberActive(id, isActive) {
      await db.update(users).set({ is_active: isActive }).where(eq(users.id, id));
    },

    async adminResetMemberPin(id, newPin) {
      await db.update(users).set({ pin_hash: hashPin(newPin) }).where(eq(users.id, id));
    },

    // ── Admin: Circulation ───────────────────────────────────────────────────

    async adminActiveBorrows(institutionId) {
      return db.select({
        id: borrowingRecords.id,
        copy_id: borrowingRecords.copy_id,
        user_id: borrowingRecords.user_id,
        borrowed_at: borrowingRecords.borrowed_at,
        due_date: borrowingRecords.due_date,
        resource_id: resourceCopies.resource_id,
        book_title: resources.title,
        user_name: users.name,
        user_id_number: users.id_number,
      })
        .from(borrowingRecords)
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .innerJoin(users, eq(borrowingRecords.user_id, users.id))
        .where(and(
          eq(resources.institution_id, institutionId),
          isNull(borrowingRecords.returned_at),
        ));
    },

    async adminOverdueBorrows(institutionId) {
      return db.select({
        id: borrowingRecords.id,
        copy_id: borrowingRecords.copy_id,
        user_id: borrowingRecords.user_id,
        borrowed_at: borrowingRecords.borrowed_at,
        due_date: borrowingRecords.due_date,
        resource_id: resourceCopies.resource_id,
        book_title: resources.title,
        user_name: users.name,
        user_id_number: users.id_number,
      })
        .from(borrowingRecords)
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .innerJoin(users, eq(borrowingRecords.user_id, users.id))
        .where(and(
          eq(resources.institution_id, institutionId),
          isNull(borrowingRecords.returned_at),
          lt(
            sql`datetime(${borrowingRecords.due_date})`,
            sql`datetime('now')`,
          ),
        ));
    },

    async adminResolvePolicy(institutionId, userId, resourceId) {
      return resolveForResource(institutionId, userId, resourceId);
    },

    async adminResolvePatron(institutionId, idNumber) {
      const u = await db.select({
        id: users.id, name: users.name, user_type: users.user_type, is_active: users.is_active,
      }).from(users)
        .where(and(eq(users.institution_id, institutionId), eq(users.id_number, idNumber)))
        .limit(1).then(r => r[0] ?? null);
      if (!u) return null;
      const activeRow = await db.select({ c: sql<number>`count(*)` }).from(borrowingRecords)
        .where(and(eq(borrowingRecords.user_id, u.id), isNull(borrowingRecords.returned_at)));
      const fineRow = await db.select({ s: sum(fines.amount) }).from(fines)
        .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
        .where(and(eq(borrowingRecords.user_id, u.id), eq(fines.paid, false)));
      return {
        userId: u.id, name: u.name, user_type: u.user_type, is_active: u.is_active,
        active_loans: Number(activeRow[0]?.c ?? 0),
        unpaid_fines: Number(fineRow[0]?.s ?? 0),
      };
    },

    async adminListLoanRules(institutionId) {
      const { rules } = await loadRulesAndLimits(institutionId);
      return rules;
    },

    async adminUpsertLoanRule(institutionId, data) {
      const values = {
        institution_id: institutionId,
        user_type: data.user_type, material_type: data.material_type,
        loan_period_days: data.loan_period_days, type_limit: data.type_limit ?? null,
        max_renewals: data.max_renewals, renewal_period_days: data.renewal_period_days ?? null,
        fine_per_day: data.fine_per_day, grace_period_days: data.grace_period_days,
        fine_max: data.fine_max ?? null, is_loanable: data.is_loanable, is_holdable: data.is_holdable,
      };
      if (data.id) {
        await db.update(loanRules).set(values).where(eq(loanRules.id, data.id));
        return { id: data.id };
      }
      const res = await db.insert(loanRules).values(values)
        .onConflictDoUpdate({ target: [loanRules.institution_id, loanRules.user_type, loanRules.material_type], set: values })
        .returning({ id: loanRules.id });
      return { id: res[0].id };
    },

    async adminDeleteLoanRule(id) {
      await db.delete(loanRules).where(eq(loanRules.id, id));
    },

    async adminGetCategoryLimits(institutionId) {
      const { limits } = await loadRulesAndLimits(institutionId);
      return limits;
    },

    async adminUpsertCategoryLimit(institutionId, data) {
      const values = {
        institution_id: institutionId, user_type: data.user_type,
        overall_limit: data.overall_limit ?? null, fines_block_threshold: data.fines_block_threshold,
      };
      if (data.id) {
        await db.update(categoryLimits).set(values).where(eq(categoryLimits.id, data.id));
        return { id: data.id };
      }
      const res = await db.insert(categoryLimits).values(values)
        .onConflictDoUpdate({ target: [categoryLimits.institution_id, categoryLimits.user_type], set: values })
        .returning({ id: categoryLimits.id });
      return { id: res[0].id };
    },

    async adminCheckout(copyId, userId, opts) {
      return checkoutCopy(copyId, userId, opts);
    },

    async adminReturn(borrowingId, condition) {
      return returnBorrowing(borrowingId, condition);
    },

    async adminPendingReservations(institutionId) {
      return db.select({
        id: reservations.id,
        resource_id: reservations.resource_id,
        user_id: reservations.user_id,
        reserved_at: reservations.reserved_at,
        book_title: resources.title,
        user_name: users.name,
        user_id_number: users.id_number,
      })
        .from(reservations)
        .innerJoin(resources, eq(reservations.resource_id, resources.id))
        .innerJoin(users, eq(reservations.user_id, users.id))
        .where(and(
          eq(resources.institution_id, institutionId),
          eq(reservations.status, 'active'),
        ));
    },

    async adminCancelReservation(reservationId) {
      await db.update(reservations)
        .set({ status: 'cancelled' })
        .where(eq(reservations.id, reservationId));
    },

    async adminPayFine(borrowingId) {
      await db.update(fines)
        .set({ paid: true, paid_at: new Date().toISOString() })
        .where(eq(fines.borrowing_id, borrowingId));
    },

    // ── Admin: Reports ───────────────────────────────────────────────────────

    async adminCirculationReport(institutionId) {
      // Overview
      const [totals] = await db.select({
        total_borrows: count(borrowingRecords.id),
        currently_borrowed: sql<number>`SUM(CASE WHEN ${borrowingRecords.returned_at} IS NULL THEN 1 ELSE 0 END)`,
        overdue: sql<number>`SUM(CASE WHEN ${borrowingRecords.returned_at} IS NULL AND datetime(${borrowingRecords.due_date}) < datetime('now') THEN 1 ELSE 0 END)`,
        returned: sql<number>`SUM(CASE WHEN ${borrowingRecords.returned_at} IS NOT NULL THEN 1 ELSE 0 END)`,
      })
        .from(borrowingRecords)
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resources.institution_id, institutionId));

      const [borrowerRow] = await db.select({
        active_borrowers: sql<number>`COUNT(DISTINCT ${borrowingRecords.user_id})`,
      })
        .from(borrowingRecords)
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(and(eq(resources.institution_id, institutionId), isNull(borrowingRecords.returned_at)));

      const overview = {
        total_borrows: Number(totals?.total_borrows ?? 0),
        currently_borrowed: Number(totals?.currently_borrowed ?? 0),
        overdue: Number(totals?.overdue ?? 0),
        returned: Number(totals?.returned ?? 0),
        active_borrowers: Number(borrowerRow?.active_borrowers ?? 0),
      };

      // Monthly trends (12 months)
      const months = 12;
      const borrowRows = await db.select({
        month: sql<string>`strftime('%Y-%m', ${borrowingRecords.borrowed_at})`,
        borrows: count(borrowingRecords.id),
      })
        .from(borrowingRecords)
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(and(
          eq(resources.institution_id, institutionId),
          sql`datetime(${borrowingRecords.borrowed_at}) >= datetime('now', ${`-${months} months`})`,
        ))
        .groupBy(sql`strftime('%Y-%m', ${borrowingRecords.borrowed_at})`)
        .orderBy(sql`strftime('%Y-%m', ${borrowingRecords.borrowed_at})`);

      const returnRows = await db.select({
        month: sql<string>`strftime('%Y-%m', ${borrowingRecords.returned_at})`,
        returns: count(borrowingRecords.id),
      })
        .from(borrowingRecords)
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(and(
          eq(resources.institution_id, institutionId),
          isNotNull(borrowingRecords.returned_at),
          sql`datetime(${borrowingRecords.returned_at}) >= datetime('now', ${`-${months} months`})`,
        ))
        .groupBy(sql`strftime('%Y-%m', ${borrowingRecords.returned_at})`)
        .orderBy(sql`strftime('%Y-%m', ${borrowingRecords.returned_at})`);

      const trendMap = new Map<string, { month: string; label: string; borrows: number; returns: number }>();
      for (const r of borrowRows) {
        if (!r.month) continue;
        trendMap.set(r.month, { month: r.month, label: monthLabel(r.month), borrows: Number(r.borrows), returns: 0 });
      }
      for (const r of returnRows) {
        if (!r.month) continue;
        const existing = trendMap.get(r.month);
        if (existing) existing.returns = Number(r.returns);
        else trendMap.set(r.month, { month: r.month, label: monthLabel(r.month), borrows: 0, returns: Number(r.returns) });
      }
      const monthlyTrends = [...trendMap.values()].sort((a, b) => a.month.localeCompare(b.month));

      // Top borrowers
      const topBorrowersRaw = await db.select({
        user_id: users.id,
        user_name: users.name,
        user_id_number: users.id_number,
        total_borrows: count(borrowingRecords.id),
        active_borrows: sql<number>`SUM(CASE WHEN ${borrowingRecords.returned_at} IS NULL THEN 1 ELSE 0 END)`,
      })
        .from(borrowingRecords)
        .innerJoin(users, eq(borrowingRecords.user_id, users.id))
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resources.institution_id, institutionId))
        .groupBy(users.id)
        .orderBy(desc(count(borrowingRecords.id)))
        .limit(10);

      const topBorrowers = topBorrowersRaw.map(r => ({
        user_id: r.user_id,
        user_name: r.user_name,
        user_id_number: r.user_id_number,
        total_borrows: Number(r.total_borrows),
        active_borrows: Number(r.active_borrows),
      }));

      // Most borrowed
      const mostBorrowedRaw = await db.select({
        resource_id: resources.id,
        title: resources.title,
        author: resources.author,
        borrow_count: count(borrowingRecords.id),
      })
        .from(resources)
        .leftJoin(resourceCopies, eq(resources.id, resourceCopies.resource_id))
        .leftJoin(borrowingRecords, eq(resourceCopies.id, borrowingRecords.copy_id))
        .where(eq(resources.institution_id, institutionId))
        .groupBy(resources.id)
        .orderBy(desc(count(borrowingRecords.id)))
        .limit(10);

      const mostBorrowed = mostBorrowedRaw.map(r => ({
        resource_id: r.resource_id,
        title: r.title,
        author: r.author,
        borrow_count: Number(r.borrow_count),
      }));

      return { overview, monthlyTrends, topBorrowers, mostBorrowed };
    },

    async adminCollectionReport(institutionId) {
      const [resources_row] = await db.select({
        total_titles: sql<number>`COUNT(DISTINCT ${resources.id})`,
        total_copies: sql<number>`COALESCE(SUM(${resources.total_copies}), 0)`,
        available_copies: sql<number>`COALESCE(SUM(${resources.available_copies}), 0)`,
        borrowed_copies: sql<number>`COALESCE(SUM(${resources.total_copies} - ${resources.available_copies}), 0)`,
      }).from(resources).where(eq(resources.institution_id, institutionId));

      const [condition_row] = await db.select({
        damaged_copies: sql<number>`COALESCE(SUM(CASE WHEN ${resourceCopies.condition} = 'damaged' THEN 1 ELSE 0 END), 0)`,
        lost_copies: sql<number>`COALESCE(SUM(CASE WHEN ${resourceCopies.condition} = 'lost' THEN 1 ELSE 0 END), 0)`,
      }).from(resourceCopies)
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resources.institution_id, institutionId));

      const [member_row] = await db.select({ registered_members: count(users.id) })
        .from(users)
        .where(and(eq(users.institution_id, institutionId), eq(users.role, 'member')));

      const total_copies = Number(resources_row?.total_copies ?? 0);
      const registered_members = Number(member_row?.registered_members ?? 0);

      const overview = {
        total_titles: Number(resources_row?.total_titles ?? 0),
        total_copies,
        available_copies: Number(resources_row?.available_copies ?? 0),
        borrowed_copies: Number(resources_row?.borrowed_copies ?? 0),
        damaged_copies: Number(condition_row?.damaged_copies ?? 0),
        lost_copies: Number(condition_row?.lost_copies ?? 0),
        registered_members,
        copies_per_member: registered_members > 0 ? Math.round((total_copies / registered_members) * 10) / 10 : 0,
      };

      const byMaterialType = await db.select({
        material_type: resources.material_type,
        titles: sql<number>`COUNT(DISTINCT ${resources.id})`,
        copies: sql<number>`COALESCE(SUM(${resources.total_copies}), 0)`,
      }).from(resources)
        .where(eq(resources.institution_id, institutionId))
        .groupBy(resources.material_type)
        .orderBy(sql`COUNT(DISTINCT ${resources.id}) DESC`);

      // Publication year buckets
      const yearRows = await db.select({
        year: resources.year,
        copies: sql<number>`COALESCE(SUM(${resources.total_copies}), 0)`,
        titles: sql<number>`COUNT(DISTINCT ${resources.id})`,
      }).from(resources)
        .where(and(eq(resources.institution_id, institutionId), isNotNull(resources.year)))
        .groupBy(resources.year);

      const unknownYear = await db.select({
        titles: sql<number>`COUNT(DISTINCT ${resources.id})`,
        copies: sql<number>`COALESCE(SUM(${resources.total_copies}), 0)`,
      }).from(resources)
        .where(and(eq(resources.institution_id, institutionId), sql`${resources.year} IS NULL`))
        .then(r => r[0]);

      const buckets: Record<string, { titles: number; copies: number }> = {
        'Pre-2000': { titles: 0, copies: 0 },
        '2000–2009': { titles: 0, copies: 0 },
        '2010–2019': { titles: 0, copies: 0 },
        '2020–present': { titles: 0, copies: 0 },
      };
      for (const row of yearRows) {
        const y = Number(row.year);
        let key: string;
        if (y < 2000) key = 'Pre-2000';
        else if (y < 2010) key = '2000–2009';
        else if (y < 2020) key = '2010–2019';
        else key = '2020–present';
        buckets[key].titles += Number(row.titles);
        buckets[key].copies += Number(row.copies);
      }
      const byPublicationYear = Object.entries(buckets).map(([bucket, v]) => ({ bucket, ...v }));
      if (Number(unknownYear?.titles ?? 0) > 0) {
        byPublicationYear.push({ bucket: 'Unknown', titles: Number(unknownYear!.titles), copies: Number(unknownYear!.copies) });
      }

      const conditionSummary = await db.select({
        condition: resourceCopies.condition,
        copies: sql<number>`COUNT(${resourceCopies.id})`,
      }).from(resourceCopies)
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resources.institution_id, institutionId))
        .groupBy(resourceCopies.condition)
        .orderBy(resourceCopies.condition);

      return { overview, byMaterialType, byPublicationYear, conditionSummary };
    },

    async adminFinesReport(institutionId) {
      const [summaryRow] = await db.select({
        total_fines: sql<number>`COALESCE(SUM(${fines.amount}), 0)`,
        total_collected: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 1 THEN ${fines.amount} ELSE 0 END), 0)`,
        total_pending: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 0 THEN ${fines.amount} ELSE 0 END), 0)`,
        fine_count: count(fines.id),
        paid_count: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 1 THEN 1 ELSE 0 END), 0)`,
        unpaid_count: sql<number>`COALESCE(SUM(CASE WHEN ${fines.paid} = 0 THEN 1 ELSE 0 END), 0)`,
      }).from(fines)
        .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resources.institution_id, institutionId));

      const summary = {
        total_fines: Number(summaryRow?.total_fines ?? 0),
        total_collected: Number(summaryRow?.total_collected ?? 0),
        total_pending: Number(summaryRow?.total_pending ?? 0),
        fine_count: Number(summaryRow?.fine_count ?? 0),
        paid_count: Number(summaryRow?.paid_count ?? 0),
        unpaid_count: Number(summaryRow?.unpaid_count ?? 0),
      };

      const fineMonths = 6;
      const monthlyCollectionRaw = await db.select({
        month: sql<string>`strftime('%Y-%m', ${fines.paid_at})`,
        collected: sql<number>`SUM(${fines.amount})`,
      }).from(fines)
        .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(and(
          eq(resources.institution_id, institutionId),
          eq(fines.paid, true),
          sql`${fines.paid_at} IS NOT NULL`,
          sql`datetime(${fines.paid_at}) >= datetime('now', ${`-${fineMonths} months`})`,
        ))
        .groupBy(sql`strftime('%Y-%m', ${fines.paid_at})`)
        .orderBy(sql`strftime('%Y-%m', ${fines.paid_at})`);

      const monthlyCollection = monthlyCollectionRaw
        .filter(r => r.month)
        .map(r => ({ month: r.month, label: monthLabel(r.month), collected: Number(r.collected) }));

      const topDebtorsRaw = await db.select({
        user_id: users.id,
        user_name: users.name,
        user_id_number: users.id_number,
        total_fines: sql<number>`SUM(${fines.amount})`,
        pending: sql<number>`SUM(CASE WHEN ${fines.paid} = 0 THEN ${fines.amount} ELSE 0 END)`,
      }).from(fines)
        .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
        .innerJoin(users, eq(borrowingRecords.user_id, users.id))
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resources.institution_id, institutionId))
        .groupBy(users.id)
        .having(sql`SUM(CASE WHEN ${fines.paid} = 0 THEN ${fines.amount} ELSE 0 END) > 0`)
        .orderBy(desc(sql`SUM(CASE WHEN ${fines.paid} = 0 THEN ${fines.amount} ELSE 0 END)`))
        .limit(10);

      const topDebtors = topDebtorsRaw.map(r => ({
        user_id: r.user_id,
        user_name: r.user_name,
        user_id_number: r.user_id_number,
        total_fines: Number(r.total_fines),
        pending: Number(r.pending),
      }));

      const detailsRaw = await db.select({
        fine_id: fines.id,
        amount: fines.amount,
        paid: fines.paid,
        paid_at: fines.paid_at,
        member_name: users.name,
        member_id_number: users.id_number,
        book_title: resources.title,
        borrowed_at: borrowingRecords.borrowed_at,
        due_date: borrowingRecords.due_date,
        returned_at: borrowingRecords.returned_at,
      }).from(fines)
        .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
        .innerJoin(users, eq(borrowingRecords.user_id, users.id))
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resources.institution_id, institutionId))
        .orderBy(desc(fines.id))
        .limit(50);

      const details = detailsRaw.map(r => ({ ...r, paid: Boolean(r.paid) }));

      return { summary, monthlyCollection, topDebtors, details };
    },

    async adminPatronReport(institutionId) {
      const [totals] = await db.select({
        total_members: sql<number>`SUM(CASE WHEN ${users.role} = 'member' THEN 1 ELSE 0 END)`,
        active_members: sql<number>`SUM(CASE WHEN ${users.role} = 'member' AND ${users.is_active} = 1 THEN 1 ELSE 0 END)`,
        inactive_members: sql<number>`SUM(CASE WHEN ${users.role} = 'member' AND ${users.is_active} = 0 THEN 1 ELSE 0 END)`,
        total_staff: sql<number>`SUM(CASE WHEN ${users.role} IN ('admin','librarian') THEN 1 ELSE 0 END)`,
      }).from(users).where(eq(users.institution_id, institutionId));

      const [borrowers] = await db.select({
        active_borrowers: sql<number>`COUNT(DISTINCT ${borrowingRecords.user_id})`,
      }).from(borrowingRecords)
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(and(eq(resources.institution_id, institutionId), isNull(borrowingRecords.returned_at)));

      const [neverBorrowed] = await db.select({ never_borrowed: count(users.id) })
        .from(users)
        .where(and(
          eq(users.institution_id, institutionId),
          eq(users.role, 'member'),
          sql`${users.id} NOT IN (SELECT DISTINCT ${borrowingRecords.user_id} FROM ${borrowingRecords})`,
        ));

      const overview = {
        total_members: Number(totals?.total_members ?? 0),
        active_members: Number(totals?.active_members ?? 0),
        inactive_members: Number(totals?.inactive_members ?? 0),
        active_borrowers: Number(borrowers?.active_borrowers ?? 0),
        never_borrowed: Number(neverBorrowed?.never_borrowed ?? 0),
        total_staff: Number(totals?.total_staff ?? 0),
      };

      const byTypeRaw = await db.select({
        user_type: users.user_type,
        count: count(users.id),
        active: sql<number>`SUM(CASE WHEN ${users.is_active} = 1 THEN 1 ELSE 0 END)`,
      }).from(users)
        .where(and(eq(users.institution_id, institutionId), eq(users.role, 'member'), isNotNull(users.user_type)))
        .groupBy(users.user_type)
        .orderBy(desc(count(users.id)));

      const byType = byTypeRaw.map(r => ({
        user_type: r.user_type ?? 'unknown',
        count: Number(r.count),
        active: Number(r.active),
      }));

      const deptRows = await db.select({
        department: users.department,
        count: count(users.id),
      }).from(users)
        .where(and(eq(users.institution_id, institutionId), eq(users.role, 'member'), isNotNull(users.department)))
        .groupBy(users.department)
        .orderBy(desc(count(users.id)));

      const activeBorrows = await db.select({ user_id: borrowingRecords.user_id })
        .from(borrowingRecords)
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(and(eq(resources.institution_id, institutionId), isNull(borrowingRecords.returned_at)));

      const activeSet = new Set(activeBorrows.map(r => r.user_id));

      const membersByDept = await db.select({ department: users.department, user_id: users.id })
        .from(users)
        .where(and(eq(users.institution_id, institutionId), eq(users.role, 'member'), isNotNull(users.department)));

      const deptActiveBorrowers = new Map<string, number>();
      for (const m of membersByDept) {
        if (!m.department) continue;
        if (activeSet.has(m.user_id)) {
          deptActiveBorrowers.set(m.department, (deptActiveBorrowers.get(m.department) ?? 0) + 1);
        }
      }

      const byDepartment = deptRows.filter(r => r.department).map(r => ({
        department: r.department!,
        count: Number(r.count),
        active_borrowers: deptActiveBorrowers.get(r.department!) ?? 0,
      }));

      const patronMonths = 6;
      const regRows = await db.select({
        month: sql<string>`strftime('%Y-%m', ${users.created_at})`,
        count: count(users.id),
      }).from(users)
        .where(and(
          eq(users.institution_id, institutionId),
          eq(users.role, 'member'),
          sql`datetime(${users.created_at}) >= datetime('now', ${`-${patronMonths} months`})`,
        ))
        .groupBy(sql`strftime('%Y-%m', ${users.created_at})`)
        .orderBy(sql`strftime('%Y-%m', ${users.created_at})`);

      const monthlyRegistrations = regRows.filter(r => r.month).map(r => ({
        month: r.month,
        label: monthLabel(r.month),
        count: Number(r.count),
      }));

      const attendanceRows = await db.select({
        month: sql<string>`strftime('%Y-%m', ${gateLogs.logged_at})`,
        unique_visitors: sql<number>`COUNT(DISTINCT ${gateLogs.user_id})`,
        total_visits: sql<number>`COUNT(*)`,
      }).from(gateLogs)
        .where(and(
          eq(gateLogs.institution_id, institutionId),
          eq(gateLogs.direction, 'in'),
          sql`datetime(${gateLogs.logged_at}) >= datetime('now', ${`-${patronMonths} months`})`,
        ))
        .groupBy(sql`strftime('%Y-%m', ${gateLogs.logged_at})`)
        .orderBy(sql`strftime('%Y-%m', ${gateLogs.logged_at})`);

      const monthlyAttendance = attendanceRows.filter(r => r.month).map(r => ({
        month: r.month,
        label: monthLabel(r.month),
        unique_visitors: Number(r.unique_visitors),
        total_visits: Number(r.total_visits),
      }));

      return { overview, byType, byDepartment, monthlyRegistrations, monthlyAttendance };
    },

    // ── Admin: Inventory ─────────────────────────────────────────────────────

    async adminActiveInventorySession(institutionId) {
      return db.select().from(scanSessions)
        .where(and(eq(scanSessions.institution_id, institutionId), eq(scanSessions.status, 'in_progress')))
        .limit(1)
        .then(r => r[0] ?? null);
    },

    async adminStartInventorySession(institutionId) {
      const result = await db.insert(scanSessions)
        .values({ institution_id: institutionId })
        .returning();
      return result[0];
    },

    async adminInventoryScan(sessionId, isbn, institutionId) {
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

    async adminFinishInventorySession(sessionId) {
      await db.update(scanSessions).set({
        ended_at: new Date().toISOString().replace('T', ' ').split('.')[0],
        status: 'completed',
      }).where(eq(scanSessions.id, sessionId));

      // Build discrepancy report
      const session = await db.select().from(scanSessions)
        .where(eq(scanSessions.id, sessionId)).limit(1).then(r => r[0]);

      const entries = await db.select().from(scanEntries)
        .where(eq(scanEntries.session_id, sessionId));

      const scanCountMap = new Map<string, number>();
      const unknownIsbnMap = new Map<string, number>();

      for (const entry of entries) {
        scanCountMap.set(entry.isbn, (scanCountMap.get(entry.isbn) ?? 0) + 1);
        if (!entry.resource_id) {
          unknownIsbnMap.set(entry.isbn, (unknownIsbnMap.get(entry.isbn) ?? 0) + 1);
        }
      }

      const institutionId = session?.institution_id;
      const allResources = institutionId
        ? await db.select({
          id: resources.id,
          title: resources.title,
          author: resources.author,
          isbn: resources.isbn,
          call_number: resources.call_number,
          available_copies: resources.available_copies,
          total_copies: resources.total_copies,
        }).from(resources).where(eq(resources.institution_id, institutionId))
        : [];

      const ghostCopies: unknown[] = [];
      const phantomReturns: unknown[] = [];
      const extraCopies: unknown[] = [];

      for (const r of allResources) {
        if (!r.isbn) continue;
        const scanCount = scanCountMap.get(r.isbn) ?? 0;
        const borrowedCopies = r.total_copies - r.available_copies;
        if (scanCount < r.available_copies) {
          ghostCopies.push({
            resource_id: r.id, title: r.title, author: r.author, isbn: r.isbn,
            call_number: r.call_number, db_available: r.available_copies, scan_count: scanCount,
            missing_count: r.available_copies - scanCount,
          });
        } else if (scanCount > r.available_copies && borrowedCopies > 0) {
          const phantomCount = Math.min(scanCount - r.available_copies, borrowedCopies);
          phantomReturns.push({
            resource_id: r.id, title: r.title, author: r.author, isbn: r.isbn,
            call_number: r.call_number, db_available: r.available_copies, scan_count: scanCount,
            phantom_count: phantomCount,
          });
        }
        if (scanCount > r.total_copies) {
          extraCopies.push({
            resource_id: r.id, title: r.title, author: r.author, isbn: r.isbn,
            call_number: r.call_number, total_copies: r.total_copies, scan_count: scanCount,
            extra_count: scanCount - r.total_copies,
          });
        }
      }

      const unknownScans = Array.from(unknownIsbnMap.entries()).map(([isbn, scan_count]) => ({ isbn, scan_count }));

      return {
        session_id: sessionId,
        started_at: session?.started_at,
        ended_at: session?.ended_at,
        total_scanned: entries.length,
        unique_isbns_scanned: scanCountMap.size,
        ghost_copies: ghostCopies,
        phantom_returns: phantomReturns,
        unknown_scans: unknownScans,
        extra_copies: extraCopies,
      };
    },

    async adminGateRecentLogs(institutionId, limit = 50) {
      return db.select({
        id: gateLogs.id,
        user_name: users.name,
        user_id_number: users.id_number,
        direction: gateLogs.direction,
        method: gateLogs.method,
        logged_at: gateLogs.logged_at,
      })
        .from(gateLogs)
        .innerJoin(users, eq(gateLogs.user_id, users.id))
        .where(eq(gateLogs.institution_id, institutionId))
        .orderBy(desc(gateLogs.logged_at))
        .limit(limit);
    },

    // ── Admin: Settings ──────────────────────────────────────────────────────

    async adminGetSettings(_institutionId) {
      const rows = await db.select().from(settings);
      const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
      return {
        fine_per_day: parseFloat(map.fine_per_day ?? '5'),
        max_borrow_days: parseInt(map.max_borrow_days ?? '7'),
        max_books_per_member: parseInt(map.max_books_per_member ?? '3'),
        institution_name: map.institution_name ?? 'My School Library',
        grace_period_days: parseInt(map.grace_period_days ?? '0'),
        max_renewals: parseInt(map.max_renewals ?? '2'),
      };
    },

    async adminUpdateSettings(_institutionId, data) {
      for (const [key, value] of Object.entries(data)) {
        await db.insert(settings)
          .values({ key, value: String(value) })
          .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } });
      }
    },

    // ── Admin: Backup ────────────────────────────────────────────────────────

    async adminExportBackup(_institutionId, _passphrase) {
      throw new Error('Not implemented in Phase 4');
    },

    async adminImportBackup(_institutionId, _encryptedData, _passphrase) {
      throw new Error('Not implemented in Phase 4');
    },

    async adminImportSQLite(filePath) {
      const tables = [
        'institutions', 'authority_names', 'users', 'resources',
        'resource_copies', 'borrowing_records', 'reservations',
        'fines', 'favorites', 'reviews', 'gate_logs',
        'scan_sessions', 'scan_entries', 'settings',
      ];

      const source = new Database(filePath, { readonly: true });
      let rowsImported = 0;
      let tablesImported = 0;

      try {
        for (const table of tables) {
          let rows: unknown[];
          try {
            rows = source.prepare(`SELECT * FROM "${table}"`).all();
          } catch {
            continue;
          }
          if (rows.length === 0) continue;

          const cols = Object.keys(rows[0] as Record<string, unknown>);
          const placeholders = cols.map(() => '?').join(', ');
          const colNames = cols.map((c) => `"${c}"`).join(', ');

          const insertStmt = rawDb.prepare(
            `INSERT OR IGNORE INTO "${table}" (${colNames}) VALUES (${placeholders})`,
          );

          const insertBatch = rawDb.transaction((batch: unknown[]) => {
            for (const row of batch) {
              insertStmt.run(...cols.map((c) => (row as Record<string, unknown>)[c]));
            }
          });

          insertBatch(rows);
          rowsImported += rows.length;
          tablesImported += 1;
        }
      } finally {
        source.close();
      }

      return { ok: true as const, tablesImported, rowsImported };
    },
  };

  // Test-only helper attached outside the typed object literal so it doesn't
  // violate the DbAdapter excess-property check. Cast it off in tests via:
  //   (adapter as unknown as { __seedTestInstitution(): number }).__seedTestInstitution()
  return Object.assign(adapterImpl, {
    __raw(): Database.Database {
      return rawDb;
    },
    __seedTestInstitution(): number {
      const inst = rawDb.prepare(
        "INSERT INTO institutions (name) VALUES ('Test Inst')",
      ).run();
      const institutionId = Number(inst.lastInsertRowid);
      rawDb.prepare(
        "INSERT INTO users (institution_id, name, role, id_number, pin_hash, user_type) " +
        "VALUES (?, 'Lib', 'librarian', 'L1', 'x', 'faculty')",
      ).run(institutionId);
      return institutionId;
    },
  }) as unknown as DbAdapter;
}
