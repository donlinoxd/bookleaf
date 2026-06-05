export interface SessionPrincipal {
  user_id: number;
  institution_id: number;
  role: string;
}

export interface DbAdapter {
  // ── Auth ──────────────────────────────────────────────────────────────────
  authenticateMember(
    idNumber: string,
    pin: string,
  ): Promise<{ user: Record<string, unknown>; token: string; expires_at: string } | null>;
  validateSession(token: string): Promise<SessionPrincipal | null>;
  logout(token: string): Promise<{ ok: true }>;
  getInstitutionInfo(): Promise<{ institutionId: number; institutionName: string }>;

  // ── Catalog (public) ──────────────────────────────────────────────────────
  searchBooks(institutionId: number, query: string): Promise<unknown[]>;
  searchBooksFiltered(
    institutionId: number,
    query: string,
    filters: { materialType?: string; yearFrom?: number; yearTo?: number; language?: string },
  ): Promise<unknown[]>;
  getRecentlyAdded(institutionId: number, limit: number): Promise<unknown[]>;
  getPopular(institutionId: number, limit: number): Promise<unknown[]>;
  getBookDetail(resourceId: number): Promise<unknown | null>;
  getSimilarBooks(resourceId: number): Promise<unknown[]>;

  // ── Books (patron, protected) ─────────────────────────────────────────────
  getBookReviews(
    resourceId: number,
  ): Promise<{ reviews: unknown[]; avg_rating: number | null }>;
  submitReview(
    resourceId: number,
    userId: number,
    rating: number,
    comment: string | null,
  ): Promise<{ ok: true }>;
  toggleFavorite(resourceId: number, userId: number): Promise<unknown>;
  getFavoriteStatus(resourceId: number, userId: number): Promise<{ favorited: boolean }>;
  getMemberFavorites(userId: number): Promise<unknown | null>;
  reserveBook(resourceId: number, userId: number): Promise<unknown>;

  // ── Me (protected) ────────────────────────────────────────────────────────
  getMemberBorrows(userId: number): Promise<unknown | null>;
  getMemberReservations(userId: number): Promise<unknown | null>;

  // ── Borrows (protected) ───────────────────────────────────────────────────
  renewBorrow(borrowingId: number, userId: number): Promise<unknown>;

  // ── Gate ──────────────────────────────────────────────────────────────────
  gateLogByUserId(
    userId: number,
    institutionId: number,
    method: 'app' | 'browser' | 'manual',
  ): Promise<unknown | null>;
  gateVerifyAndLog(
    idNumber: string,
    pin: string,
    institutionId: number,
  ): Promise<unknown | null>;

  // ── Admin: Books ──────────────────────────────────────────────────────────
  adminListBooks(institutionId: number, q?: string): Promise<unknown[]>;
  adminGetBook(id: number): Promise<unknown | null>;
  adminGetBookWithCopies(id: number): Promise<unknown | null>;
  adminCreateBook(
    institutionId: number,
    data: Record<string, unknown>,
    copies: Array<{ accession_number?: string; barcode?: string; shelf_location?: string }>,
  ): Promise<{ id: number }>;
  adminUpdateBook(id: number, data: Record<string, unknown>): Promise<void>;
  adminDeleteBook(id: number): Promise<void>;
  adminAddCopy(resourceId: number): Promise<void>;

  // ── Admin: Members ────────────────────────────────────────────────────────
  adminListMembers(institutionId: number, q?: string): Promise<unknown[]>;
  adminGetMember(id: number): Promise<unknown | null>;
  adminCreateMember(data: Record<string, unknown>): Promise<{ id: number }>;
  adminUpdateMember(id: number, data: Record<string, unknown>): Promise<void>;
  adminSetMemberActive(id: number, isActive: boolean): Promise<void>;
  adminResetMemberPin(id: number, newPin: string): Promise<void>;

  // ── Admin: Circulation ────────────────────────────────────────────────────
  adminActiveBorrows(institutionId: number): Promise<unknown[]>;
  adminOverdueBorrows(institutionId: number): Promise<unknown[]>;
  adminCheckout(copyId: number, userId: number): Promise<{ borrowingId: number }>;
  adminReturn(borrowingId: number, condition: string): Promise<unknown | null>;
  adminPendingReservations(institutionId: number): Promise<unknown[]>;
  adminCancelReservation(reservationId: number): Promise<void>;
  adminPayFine(borrowingId: number): Promise<void>;

  // ── Admin: Reports ────────────────────────────────────────────────────────
  adminCirculationReport(institutionId: number): Promise<unknown>;
  adminCollectionReport(institutionId: number): Promise<unknown>;
  adminFinesReport(institutionId: number): Promise<unknown>;
  adminPatronReport(institutionId: number): Promise<unknown>;

  // ── Admin: Inventory ──────────────────────────────────────────────────────
  adminActiveInventorySession(institutionId: number): Promise<unknown | null>;
  adminStartInventorySession(institutionId: number): Promise<unknown>;
  adminInventoryScan(
    sessionId: number,
    isbn: string,
    institutionId: number,
  ): Promise<unknown>;
  adminFinishInventorySession(sessionId: number): Promise<unknown>;

  // ── Admin: Settings ───────────────────────────────────────────────────────
  adminGetSettings(institutionId: number): Promise<unknown>;
  adminUpdateSettings(institutionId: number, data: Record<string, unknown>): Promise<void>;

  // ── Admin: Backup ─────────────────────────────────────────────────────────
  adminExportBackup(
    institutionId: number,
    passphrase: string,
  ): Promise<{ encryptedData: string }>;
  adminImportBackup(
    institutionId: number,
    encryptedData: string,
    passphrase: string,
  ): Promise<{ ok: true; imported: number }>;
  adminImportSQLite(filePath: string): Promise<{ ok: true; tablesImported: number; rowsImported: number }>;
}
