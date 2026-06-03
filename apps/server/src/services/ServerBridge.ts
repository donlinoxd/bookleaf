import nodejs from 'nodejs-mobile-react-native';
import { MdnsService } from './MdnsService';
import { AdminBridgeHandler } from './AdminBridgeHandler';
import { GateService } from './GateService';
import { BorrowService } from './BorrowService';
import { ReservationService } from './ReservationService';
import { FavoritesService } from './FavoritesService';
import { ReviewService } from './ReviewService';
import { SessionService, SessionPrincipal } from './SessionService';
import { db } from '@bookleaf/db';
import { resources, resourceCopies, borrowingRecords, users, fines } from '@bookleaf/db';
import { hashPin, verifyPin, isLegacyHash } from '@bookleaf/db';
import { eq, like, or, and, desc, sum, sql, ne, gte, lte } from 'drizzle-orm';

type BridgeMessage =
  | { requestId: number; action: string; params: Record<string, unknown> }
  | { type: 'server_ready'; port: number }
  | { type: 'server_error'; message: string }
  | { type: 'stop' };

type StatusCallback = (status: 'starting' | 'running' | 'error' | 'stopped', detail?: string) => void;

let institutionId: number | null = null;
let statusCallback: StatusCallback | null = null;
let isStarted = false;

function requireInstitution(): number {
  if (institutionId === null) {
    throw new Error('ServerBridge not initialized — call start(institutionId) first');
  }
  return institutionId;
}

async function handlePatronAction(action: string, params: Record<string, unknown>): Promise<unknown> {
  switch (action) {
    case 'searchBooks': {
      const institutionId = requireInstitution();
      const query = (params.q as string) || '';
      const q = `%${query}%`;
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
        .where(and(
          eq(resources.institution_id, institutionId),
          or(
            like(resources.title, q),
            like(resources.author, q),
            like(resources.isbn, q),
            like(resources.genre, q),
            like(resources.publisher, q),
            like(resources.call_number, q),
          )
        ))
        .orderBy(resources.title)
        .limit(50);
    }

    case 'getAllBooks': {
      const institutionId = requireInstitution();
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
        .orderBy(resources.title);
    }

    case 'getBookDetail': {
      const resourceId = params.id as number;
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
        copies.map(c => c.shelf_location).filter((s): s is string => !!s)
      )];

      return { ...resource, shelf_locations };
    }

    case 'getMemberBorrows': {
      const userId = params.userId as number;
      const member = await db.select({ name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(r => r[0] ?? null);
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
    }

    case 'getRecentlyAdded': {
      const institutionId = requireInstitution();
      const limit = (params.limit as number) || 10;
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
    }

    case 'getPopular': {
      const institutionId = requireInstitution();
      const limit = (params.limit as number) || 10;
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
    }

    case 'renewBorrow': {
      const borrowingId = params.borrowingId as number;
      const userId = params.userId as number;
      const record = await db.select({ user_id: borrowingRecords.user_id })
        .from(borrowingRecords).where(eq(borrowingRecords.id, borrowingId)).limit(1).then(r => r[0] ?? null);
      if (!record) throw new Error('Borrowing record not found');
      if (record.user_id !== userId) throw new Error('Not allowed');
      return BorrowService.renewBook(borrowingId);
    }

    case 'reserveBook': {
      return ReservationService.reserve(params.resourceId as number, params.userId as number);
    }

    case 'getMemberReservations': {
      const userId = params.userId as number;
      const member = await db.select({ name: users.name })
        .from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
      if (!member) return null;
      const holds = await ReservationService.getByUser(userId);
      return { member_name: member.name, reservations: holds.filter(h => h.status === 'active') };
    }

    case 'searchBooksFiltered': {
      const institutionId = requireInstitution();
      const query = (params.query as string) || '';
      const materialType = params.materialType as string | undefined;
      const yearFrom = params.yearFrom as number | undefined;
      const yearTo = params.yearTo as number | undefined;
      const language = params.language as string | undefined;
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
      if (materialType) conditions.push(eq(resources.material_type, materialType as any) as any);
      if (yearFrom) conditions.push(gte(resources.year, yearFrom) as any);
      if (yearTo) conditions.push(lte(resources.year, yearTo) as any);
      if (language) conditions.push(like(resources.language, `%${language}%`) as any);
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
    }

    case 'getSimilarBooks': {
      const resourceId = params.resourceId as number;
      const book = await db.select({ author: resources.author, genre: resources.genre, institution_id: resources.institution_id })
        .from(resources).where(eq(resources.id, resourceId)).limit(1).then(r => r[0] ?? null);
      if (!book) return [];
      const conditions = [eq(resources.institution_id, book.institution_id), ne(resources.id, resourceId)];
      const authorOrGenre = [];
      if (book.author) authorOrGenre.push(eq(resources.author, book.author));
      if (book.genre) authorOrGenre.push(eq(resources.genre, book.genre));
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
    }

    case 'toggleFavorite': {
      return FavoritesService.toggle(params.userId as number, params.resourceId as number);
    }

    case 'getFavoriteStatus': {
      const favorited = await FavoritesService.isFavorited(params.userId as number, params.resourceId as number);
      return { favorited };
    }

    case 'getMemberFavorites': {
      const userId = params.userId as number;
      const member = await db.select({ name: users.name })
        .from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
      if (!member) return null;
      const items = await FavoritesService.getByUser(userId);
      return { member_name: member.name, favorites: items };
    }

    case 'getBookReviews': {
      const resourceId = params.resourceId as number;
      const [reviewList, avgRating] = await Promise.all([
        ReviewService.getByResource(resourceId),
        ReviewService.getAverageRating(resourceId),
      ]);
      return { reviews: reviewList, avg_rating: avgRating };
    }

    case 'submitReview': {
      const resourceId = params.resourceId as number;
      const userId = params.userId as number;
      const rating = params.rating as number;
      const comment = (params.comment as string) || null;
      const eligible = await ReviewService.canReview(userId, resourceId);
      if (!eligible) throw new Error('You must have borrowed this item to leave a review');
      await ReviewService.submit(userId, resourceId, rating, comment);
      return { ok: true };
    }

    case 'gateLogByUserId': {
      const userId = params.userId as number;
      const instId = params.institutionId as number;
      const method = params.method as 'app' | 'browser' | 'manual';
      const user = await db.select({ id: users.id, name: users.name, is_active: users.is_active })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then((r) => r[0] ?? null);
      if (!user || !user.is_active) return null;
      const result = await GateService.logEntry(user.id, instId, method);
      return { user_name: user.name, direction: result.direction, logged_at: result.logged_at };
    }

    case 'gateVerifyAndLog': {
      const idNumber = params.idNumber as string;
      const pin = params.pin as string;
      const instId = params.institutionId as number;
      const user = await db.select({ id: users.id, name: users.name, pin_hash: users.pin_hash, is_active: users.is_active })
        .from(users)
        .where(eq(users.id_number, idNumber))
        .limit(1)
        .then((r) => r[0] ?? null);
      if (!user || !user.is_active) return null;
      if (!verifyPin(pin, user.pin_hash)) return null;
      if (isLegacyHash(user.pin_hash)) {
        await db.update(users).set({ pin_hash: hashPin(pin) }).where(eq(users.id, user.id));
      }
      const result = await GateService.logEntry(user.id, instId, 'browser');
      return { user_name: user.name, direction: result.direction, logged_at: result.logged_at };
    }

    case 'authenticateMember': {
      const idNumber = params.idNumber as string;
      const pin = params.pin as string;
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
      const session = await SessionService.create(row.id);
      return { user: safeUser, token: session.token, expires_at: session.expires_at };
    }

    case 'validateSession': {
      return SessionService.validate(params.token as string);
    }

    case 'logout': {
      await SessionService.revoke(params.token as string);
      return { ok: true };
    }

    default:
      return { error: `Unknown action: ${action}` };
  }
}

async function handleQuery(requestId: number, action: string, params: Record<string, unknown>) {
  let data: unknown;
  try {
    if (action.startsWith('admin')) {
      data = await AdminBridgeHandler.handle(action, params);
    } else {
      data = await handlePatronAction(action, params);
    }
  } catch (e: unknown) {
    data = { error: e instanceof Error ? e.message : 'Unknown error' };
  }
  nodejs.channel.send(JSON.stringify({ requestId, data }));
}

export const ServerBridge = {
  start(instId: number, onStatus: StatusCallback) {
    if (isStarted) return;
    institutionId = instId;
    statusCallback = onStatus;
    isStarted = true;

    onStatus('starting');

    nodejs.channel.addListener('message', (raw: string) => {
      try {
        const msg: BridgeMessage = JSON.parse(raw);

        if ('type' in msg) {
          if (msg.type === 'server_ready') {
            MdnsService.publish();
            statusCallback?.('running', `Port ${msg.port}`);
          } else if (msg.type === 'server_error') {
            statusCallback?.('error', msg.message);
          }
          return;
        }

        // DB query from Node.js side
        if ('requestId' in msg) {
          handleQuery(msg.requestId, msg.action, msg.params);
        }
      } catch {
        // malformed message
      }
    });

    nodejs.start('main.js');
  },

  stop() {
    if (!isStarted) return;
    MdnsService.unpublish();
    nodejs.channel.send(JSON.stringify({ type: 'stop' }));
    isStarted = false;
    statusCallback?.('stopped');
    statusCallback = null;
  },

  isRunning() {
    return isStarted;
  },

  setStatusCallback(cb: StatusCallback | null) {
    statusCallback = cb;
  },
};
