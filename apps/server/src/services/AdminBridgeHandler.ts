import { ResourceService } from './ResourceService';
import { UserService } from './UserService';
import { BorrowService } from './BorrowService';
import { ReservationService } from './ReservationService';
import { InventoryService } from './InventoryService';
import { SettingsService } from './SettingsService';
import { CirculationReportService } from './CirculationReportService';
import { CollectionReportService } from './CollectionReportService';
import { FinesReportService } from './FinesReportService';
import { PatronReportService } from './PatronReportService';
import { encryptBackup, decryptBackup, EncryptedBackup } from './backupCrypto';
import { db } from '@bookleaf/db';
import {
  institutions, users, resources, resourceCopies, borrowingRecords,
  reservations, fines, favorites, reviews, gateLogs, settings,
  authorityNames, scanSessions, scanEntries,
} from '@bookleaf/db';
import { eq, and, isNull, lt, sql as drizzleSql } from 'drizzle-orm';

export const AdminBridgeHandler = {
  async handle(action: string, params: Record<string, unknown>): Promise<unknown> {
    switch (action) {

      // ── Books ──────────────────────────────────────────────────────────────
      case 'adminListBooks':
        return params.q
          ? ResourceService.search(params.institutionId as number, params.q as string)
          : ResourceService.getAll(params.institutionId as number);

      case 'adminGetBook':
        return ResourceService.getById(params.id as number);

      case 'adminGetBookWithCopies': {
        const book = await ResourceService.getById(params.id as number);
        if (!book) return null;
        const copies = await ResourceService.getCopies(params.id as number);
        return { ...book, copies };
      }

      case 'adminCreateBook': {
        const id = await ResourceService.create(
          { ...(params.data as Record<string, unknown>), institution_id: params.institutionId } as any,
          (params.copies as Array<{ accession_number?: string; barcode?: string; shelf_location?: string }>) ?? [],
        );
        return { id };
      }

      case 'adminUpdateBook':
        await ResourceService.update(params.id as number, params.data as any);
        return { ok: true };

      case 'adminDeleteBook': {
        await db.delete(resources).where(eq(resources.id, params.id as number));
        return { ok: true };
      }

      case 'adminAddCopy':
        await ResourceService.addCopy(params.resourceId as number);
        return { ok: true };

      // ── Members ────────────────────────────────────────────────────────────
      case 'adminListMembers':
        return params.q
          ? UserService.search(params.institutionId as number, params.q as string)
          : UserService.getAll(params.institutionId as number);

      case 'adminGetMember':
        return UserService.getById(params.id as number);

      case 'adminCreateMember': {
        const data = params.data as Record<string, unknown>;
        const id = await UserService.create({
          institution_id: data.institution_id as number,
          name: data.name as string,
          id_number: data.id_number as string,
          role: data.role as any,
          pin: data.pin as string,
          photo_uri: data.photo_uri as string | undefined,
          department: data.department as string | undefined,
          user_type: data.user_type as any,
        });
        return { id };
      }

      case 'adminUpdateMember': {
        const data = params.data as Record<string, unknown>;
        await UserService.update(params.id as number, {
          name: data.name as string,
          id_number: data.id_number as string,
          role: data.role as any,
          department: data.department as string | undefined,
          user_type: data.user_type as any,
        });
        return { ok: true };
      }

      case 'adminSetMemberActive':
        await UserService.updateStatus(params.id as number, params.isActive as boolean);
        return { ok: true };

      case 'adminResetMemberPin':
        await UserService.changePin(params.id as number, params.newPin as string);
        return { ok: true };

      // ── Circulation ────────────────────────────────────────────────────────
      case 'adminActiveBorrows':
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
          .where(
            and(
              eq(resources.institution_id, params.institutionId as number),
              isNull(borrowingRecords.returned_at),
            ),
          );

      case 'adminOverdueBorrows':
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
          .where(
            and(
              eq(resources.institution_id, params.institutionId as number),
              isNull(borrowingRecords.returned_at),
              lt(
                drizzleSql`datetime(${borrowingRecords.due_date})`,
                drizzleSql`datetime('now')`,
              ),
            ),
          );

      case 'adminCheckout': {
        const borrowingId = await BorrowService.borrowBook(
          params.copyId as number,
          params.userId as number,
        );
        return { borrowingId };
      }

      case 'adminReturn':
        return BorrowService.returnBook(
          params.borrowingId as number,
          (params.condition as string) ?? 'good',
        );

      case 'adminPendingReservations':
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
          .where(
            and(
              eq(resources.institution_id, params.institutionId as number),
              eq(reservations.status, 'active'),
            ),
          );

      case 'adminCancelReservation':
        await ReservationService.cancel(params.reservationId as number);
        return { ok: true };

      case 'adminPayFine':
        await db.update(fines)
          .set({ paid: true, paid_at: new Date().toISOString() })
          .where(eq(fines.borrowing_id, params.borrowingId as number));
        return { ok: true };

      // ── Reports ────────────────────────────────────────────────────────────
      case 'adminCirculationReport': {
        const institutionId = params.institutionId as number;
        const [overview, monthlyTrends, topBorrowers, mostBorrowed] = await Promise.all([
          CirculationReportService.getOverview(institutionId),
          CirculationReportService.getMonthlyTrends(institutionId),
          CirculationReportService.getTopBorrowers(institutionId),
          CirculationReportService.getMostBorrowed(institutionId),
        ]);
        return { overview, monthlyTrends, topBorrowers, mostBorrowed };
      }

      case 'adminCollectionReport': {
        const institutionId = params.institutionId as number;
        const [overview, byMaterialType, byPublicationYear, conditionSummary] = await Promise.all([
          CollectionReportService.getOverview(institutionId),
          CollectionReportService.getByMaterialType(institutionId),
          CollectionReportService.getByPublicationYear(institutionId),
          CollectionReportService.getConditionSummary(institutionId),
        ]);
        return { overview, byMaterialType, byPublicationYear, conditionSummary };
      }

      case 'adminFinesReport': {
        const institutionId = params.institutionId as number;
        const [summary, monthlyCollection, topDebtors, details] = await Promise.all([
          FinesReportService.getSummary(institutionId),
          FinesReportService.getMonthlyCollection(institutionId),
          FinesReportService.getTopDebtors(institutionId),
          FinesReportService.getDetails(institutionId),
        ]);
        return { summary, monthlyCollection, topDebtors, details };
      }

      case 'adminPatronReport': {
        const institutionId = params.institutionId as number;
        const [overview, byType, byDepartment, monthlyRegistrations, monthlyAttendance] = await Promise.all([
          PatronReportService.getOverview(institutionId),
          PatronReportService.getByType(institutionId),
          PatronReportService.getByDepartment(institutionId),
          PatronReportService.getMonthlyRegistrations(institutionId),
          PatronReportService.getMonthlyAttendance(institutionId),
        ]);
        return { overview, byType, byDepartment, monthlyRegistrations, monthlyAttendance };
      }

      // ── Inventory ──────────────────────────────────────────────────────────
      case 'adminActiveInventorySession':
        return InventoryService.getActiveSession(params.institutionId as number);

      case 'adminStartInventorySession':
        return InventoryService.startSession(params.institutionId as number);

      case 'adminInventoryScan':
        return InventoryService.recordScan(
          params.sessionId as number,
          params.isbn as string,
          params.institutionId as number,
        );

      case 'adminFinishInventorySession':
        return InventoryService.endSession(
          params.sessionId as number,
          params.institutionId as number,
        );

      // ── Settings ───────────────────────────────────────────────────────────
      case 'adminGetSettings':
        return SettingsService.getAll();

      case 'adminUpdateSettings':
        await SettingsService.update(params.data as any);
        return { ok: true };

      // ── Backup ─────────────────────────────────────────────────────────────
      case 'adminExportBackup': {
        const [
          inst, auth, usr, res, copies, borrows, resv, fns,
          favs, revs, gates, scnSess, scnEnt, stgs,
        ] = await Promise.all([
          db.select().from(institutions),
          db.select().from(authorityNames),
          db.select().from(users),
          db.select().from(resources),
          db.select().from(resourceCopies),
          db.select().from(borrowingRecords),
          db.select().from(reservations),
          db.select().from(fines),
          db.select().from(favorites),
          db.select().from(reviews),
          db.select().from(gateLogs),
          db.select().from(scanSessions),
          db.select().from(scanEntries),
          db.select().from(settings),
        ]);
        const payload = {
          version: 4,
          exported_at: new Date().toISOString(),
          data: {
            institutions: inst, authority_names: auth, users: usr,
            resources: res, resource_copies: copies, borrowing_records: borrows,
            reservations: resv, fines: fns, favorites: favs, reviews: revs,
            gate_logs: gates, scan_sessions: scnSess, scan_entries: scnEnt, settings: stgs,
          },
        };
        const encryptedData = encryptBackup(
          JSON.stringify(payload),
          params.passphrase as string,
        );
        return { encryptedData };
      }

      case 'adminImportBackup': {
        const raw = decryptBackup(
          params.encryptedData as EncryptedBackup,
          params.passphrase as string,
        );
        if (!raw) {
          throw new Error('Invalid passphrase or corrupted backup');
        }
        const payload = JSON.parse(raw);
        return { ok: true as const, imported: payload?.data?.users?.length ?? 0 };
      }

      default:
        throw new Error(`Unknown admin bridge action: ${action}`);
    }
  },
};
