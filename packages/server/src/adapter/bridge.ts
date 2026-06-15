import type { DbAdapter, SessionPrincipal } from './types';

type QueryFn = (action: string, params: Record<string, unknown>) => Promise<unknown>;

export function createBridgeAdapter(queryRN: QueryFn): DbAdapter {
  const q = queryRN;

  return {
    // ── Auth ────────────────────────────────────────────────────────────────
    authenticateMember: (idNumber, pin) =>
      q('authenticateMember', { idNumber, pin }) as Promise<
        { user: Record<string, unknown>; token: string; expires_at: string } | null
      >,

    validateSession: (token) =>
      q('validateSession', { token }) as Promise<SessionPrincipal | null>,

    logout: (token) =>
      q('logout', { token }) as Promise<{ ok: true }>,

    getInstitutionInfo: () =>
      q('getInstitutionInfo', {}) as Promise<{ institutionId: number; institutionName: string }>,

    // ── Catalog ─────────────────────────────────────────────────────────────
    searchBooks: (institutionId, query) =>
      q('searchBooks', { institutionId, q: query }) as Promise<unknown[]>,

    searchBooksFiltered: (institutionId, query, filters) =>
      q('searchBooksFiltered', {
        query,
        materialType: filters.materialType,
        yearFrom: filters.yearFrom,
        yearTo: filters.yearTo,
        language: filters.language,
      }) as Promise<unknown[]>,

    getRecentlyAdded: (institutionId, limit) =>
      q('getRecentlyAdded', { institutionId, limit }) as Promise<unknown[]>,

    getPopular: (institutionId, limit) =>
      q('getPopular', { institutionId, limit }) as Promise<unknown[]>,

    getBookDetail: (resourceId) =>
      q('getBookDetail', { id: resourceId }) as Promise<unknown | null>,

    getSimilarBooks: (resourceId) =>
      q('getSimilarBooks', { resourceId }) as Promise<unknown[]>,

    // ── Books ────────────────────────────────────────────────────────────────
    getBookReviews: (resourceId) =>
      q('getBookReviews', { resourceId }) as Promise<{
        reviews: unknown[];
        avg_rating: number | null;
      }>,

    submitReview: (resourceId, userId, rating, comment) =>
      q('submitReview', { resourceId, userId, rating, comment }) as Promise<{ ok: true }>,

    toggleFavorite: (resourceId, userId) =>
      q('toggleFavorite', { resourceId, userId }) as Promise<unknown>,

    getFavoriteStatus: (resourceId, userId) =>
      q('getFavoriteStatus', { resourceId, userId }) as Promise<{ favorited: boolean }>,

    getMemberFavorites: (userId) =>
      q('getMemberFavorites', { userId }) as Promise<unknown | null>,

    reserveBook: (resourceId, userId) =>
      q('reserveBook', { resourceId, userId }) as Promise<unknown>,

    // ── Me ───────────────────────────────────────────────────────────────────
    getMemberBorrows: (userId) =>
      q('getMemberBorrows', { userId }) as Promise<unknown | null>,

    getMemberReservations: (userId) =>
      q('getMemberReservations', { userId }) as Promise<unknown | null>,

    // ── Borrows ──────────────────────────────────────────────────────────────
    renewBorrow: (borrowingId, userId) =>
      q('renewBorrow', { borrowingId, userId }) as Promise<unknown>,

    // ── Gate ─────────────────────────────────────────────────────────────────
    gateLogByUserId: (userId, institutionId, method) =>
      q('gateLogByUserId', { userId, institutionId, method }) as Promise<unknown | null>,

    gateVerifyAndLog: (idNumber, pin, institutionId) =>
      q('gateVerifyAndLog', { idNumber, pin, institutionId }) as Promise<unknown | null>,

    // ── Admin: Books ─────────────────────────────────────────────────────────
    adminListBooks: (institutionId, q2) =>
      q('adminListBooks', { institutionId, q: q2 }) as Promise<unknown[]>,

    adminGetBook: (id) =>
      q('adminGetBook', { id }) as Promise<unknown | null>,

    adminGetBookWithCopies: (id) =>
      q('adminGetBookWithCopies', { id }) as Promise<unknown | null>,

    adminCreateBook: (institutionId, data, copies) =>
      q('adminCreateBook', { institutionId, data, copies }) as Promise<{ id: number }>,

    adminUpdateBook: (id, data) =>
      q('adminUpdateBook', { id, data }).then(() => undefined),

    adminDeleteBook: (id) =>
      q('adminDeleteBook', { id }).then(() => undefined),

    adminAddCopy: (resourceId) =>
      q('adminAddCopy', { resourceId }).then(() => undefined),

    // ── Admin: Authorities ───────────────────────────────────────────────────
    adminListAuthorities: (institutionId, filter) =>
      q('adminListAuthorities', { institutionId, ...filter }) as Promise<Array<Record<string, unknown> & { usage_count: number }>>,

    adminGetAuthority: (id) =>
      q('adminGetAuthority', { id }) as Promise<(Record<string, unknown> & { usage_count: number }) | null>,

    adminCreateAuthority: (input) =>
      q('adminCreateAuthority', input) as Promise<{ id: number }>,

    adminUpdateAuthority: (id, data) =>
      q('adminUpdateAuthority', { id, data }).then(() => undefined),

    adminDeleteAuthority: (id) =>
      q('adminDeleteAuthority', { id }).then(() => undefined),

    adminMergeAuthorities: (survivorId, loserIds) =>
      q('adminMergeAuthorities', { survivorId, loserIds }).then(() => undefined),

    // ── Admin: Members ───────────────────────────────────────────────────────
    adminListMembers: (institutionId, q2) =>
      q('adminListMembers', { institutionId, q: q2 }) as Promise<unknown[]>,

    adminGetMember: (id) =>
      q('adminGetMember', { id }) as Promise<unknown | null>,

    adminCreateMember: (data) =>
      q('adminCreateMember', { data }) as Promise<{ id: number }>,

    adminUpdateMember: (id, data) =>
      q('adminUpdateMember', { id, data }).then(() => undefined),

    adminSetMemberActive: (id, isActive) =>
      q('adminSetMemberActive', { id, isActive }).then(() => undefined),

    adminResetMemberPin: (id, newPin) =>
      q('adminResetMemberPin', { id, newPin }).then(() => undefined),

    // ── Admin: Circulation ───────────────────────────────────────────────────
    adminActiveBorrows: (institutionId) =>
      q('adminActiveBorrows', { institutionId }) as Promise<unknown[]>,

    adminOverdueBorrows: (institutionId) =>
      q('adminOverdueBorrows', { institutionId }) as Promise<unknown[]>,

    adminCheckout: (copyId, userId) =>
      q('adminCheckout', { copyId, userId }) as Promise<{ borrowingId: number }>,

    adminReturn: (borrowingId, condition) =>
      q('adminReturn', { borrowingId, condition }) as Promise<unknown | null>,

    adminPendingReservations: (institutionId) =>
      q('adminPendingReservations', { institutionId }) as Promise<unknown[]>,

    adminCancelReservation: (reservationId) =>
      q('adminCancelReservation', { reservationId }).then(() => undefined),

    adminPayFine: (borrowingId) =>
      q('adminPayFine', { borrowingId }).then(() => undefined),

    // ── Admin: Reports ───────────────────────────────────────────────────────
    adminCirculationReport: (institutionId) =>
      q('adminCirculationReport', { institutionId }) as Promise<unknown>,

    adminCollectionReport: (institutionId) =>
      q('adminCollectionReport', { institutionId }) as Promise<unknown>,

    adminFinesReport: (institutionId) =>
      q('adminFinesReport', { institutionId }) as Promise<unknown>,

    adminPatronReport: (institutionId) =>
      q('adminPatronReport', { institutionId }) as Promise<unknown>,

    // ── Admin: Inventory ─────────────────────────────────────────────────────
    adminActiveInventorySession: (institutionId) =>
      q('adminActiveInventorySession', { institutionId }) as Promise<unknown | null>,

    adminStartInventorySession: (institutionId) =>
      q('adminStartInventorySession', { institutionId }) as Promise<unknown>,

    adminInventoryScan: (sessionId, isbn, institutionId) =>
      q('adminInventoryScan', { sessionId, isbn, institutionId }) as Promise<unknown>,

    adminFinishInventorySession: (sessionId) =>
      q('adminFinishInventorySession', { sessionId }) as Promise<unknown>,

    // ── Admin: Settings ──────────────────────────────────────────────────────
    adminGetSettings: (institutionId) =>
      q('adminGetSettings', { institutionId }) as Promise<unknown>,

    adminUpdateSettings: (institutionId, data) =>
      q('adminUpdateSettings', { institutionId, data }).then(() => undefined),

    // ── Admin: Backup ────────────────────────────────────────────────────────
    adminExportBackup: (institutionId, passphrase) =>
      q('adminExportBackup', { institutionId, passphrase }) as Promise<{
        encryptedData: string;
      }>,

    adminImportBackup: (institutionId, encryptedData, passphrase) =>
      q('adminImportBackup', { institutionId, encryptedData, passphrase }) as Promise<{
        ok: true;
        imported: number;
      }>,

    adminGateRecentLogs: (institutionId, limit) =>
      q('adminGateRecentLogs', { institutionId, limit }) as Promise<{
        id: number; user_name: string; user_id_number: string;
        direction: string; method: string; logged_at: string;
      }[]>,

    adminImportSQLite: (filePath) =>
      q('adminImportSQLite', { filePath }) as Promise<{
        ok: true; tablesImported: number; rowsImported: number;
      }>,

    adminLoadImportContext: () => {
      throw new Error('Bulk import is not supported on mobile');
    },
    adminBulkImport: () => {
      throw new Error('Bulk import is not supported on mobile');
    },
  };
}
