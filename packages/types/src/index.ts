/** Name authorities (people/orgs/places). Kept for backward compatibility. */
export type AuthorityNameType = 'personal' | 'corporate' | 'geographic';
/** All authority record types in the unified authority table. */
export type AuthorityType = AuthorityNameType | 'subject' | 'publisher';
export type UserRole = 'admin' | 'librarian' | 'member';
export type UserType = 'student' | 'faculty' | 'alumni' | 'external';
export type GateDirection = 'in' | 'out';
export type GateMethod = 'app' | 'browser' | 'manual';
export type AppMode = 'server' | 'client' | null;
export type CopyCondition = 'good' | 'damaged' | 'lost';
export type CopyStatus = 'available' | 'borrowed' | 'reserved';
export type ReservationStatus = 'active' | 'fulfilled' | 'cancelled';
export type MaterialType = 'BOOK' | 'SERIAL' | 'ARTICLE' | 'AUDIOVISUAL' | 'MAP' | 'MANUSCRIPT' | 'DIGITAL' | 'THESIS' | 'OTHER';
export type CallNumberType = 'DEWEY' | 'LC' | 'OTHER';

/** @deprecated use CopyCondition */
export type BookCondition = CopyCondition;

export interface AuthorityName {
  id: number;
  institution_id: number;
  name: string;
  name_type: AuthorityType;
  variants: string | null;
  normalized_name: string | null;
  created_at: string;
}

/** An authority row plus how many resources reference it. */
export interface AuthorityWithUsage extends AuthorityName {
  usage_count: number;
}

export interface MergeAuthoritiesInput {
  survivorId: number;
  loserIds: number[];
}

export interface Institution {
  id: number;
  name: string;
  address: string;
  logo_uri: string | null;
  created_at: string;
}

export interface User {
  id: number;
  institution_id: number;
  name: string;
  id_number: string;
  role: UserRole;
  pin_hash: string;
  photo_uri: string | null;
  is_active: boolean;
  created_at: string;
  department: string | null;
  user_type: UserType | null;
}

export interface Resource {
  id: number;
  institution_id: number;
  material_type: MaterialType;
  // Core bibliographic
  isbn: string | null;
  issn: string | null;
  title: string;
  author: string;
  publisher: string | null;
  year: number | null;
  genre: string | null;
  description: string | null;
  cover_uri: string | null;
  // RDA extended
  subtitle: string | null;
  edition: string | null;
  volume: string | null;
  issue_number: string | null;
  series_title: string | null;
  doi: string | null;
  url: string | null;
  duration: string | null;
  language: string | null;
  call_number: string | null;
  call_number_type: CallNumberType | null;
  content_type: string | null;
  media_type: string | null;
  carrier_type: string | null;
  subject_headings: string[] | null;
  author_authority_id: number | null;
  // Optional so the mobile app (which doesn't set publisher authorities) keeps
  // constructing Resource objects without it; the desktop column always exists.
  publisher_authority_id?: number | null;
  // Lending
  is_loanable: boolean;
  loan_period_days: number | null;
  // Inventory
  total_copies: number;
  available_copies: number;
  added_at: string;
}

export interface ResourceCopy {
  id: number;
  resource_id: number;
  copy_number: number;
  condition: CopyCondition;
  status: CopyStatus;
  barcode: string | null;
  shelf_location: string | null;
  accession_number: string | null;
}

export interface BorrowingRecord {
  id: number;
  copy_id: number;
  user_id: number;
  borrowed_at: string;
  due_date: string;
  returned_at: string | null;
  fine_amount: number;
  renewal_count: number;
  // joined fields
  resource_id?: number;
  book_title?: string;
  book_author?: string;
  member_name?: string;
  member_id_number?: string;
}

export interface Reservation {
  id: number;
  resource_id: number;
  user_id: number;
  reserved_at: string;
  status: ReservationStatus;
  // joined fields
  book_title?: string;
  book_author?: string;
  member_name?: string;
  member_id_number?: string;
  available_copies?: number;
}

export interface Favorite {
  id: number;
  user_id: number;
  resource_id: number;
  created_at: string;
  book_title?: string;
  book_author?: string;
  available_copies?: number;
}

export interface Review {
  id: number;
  user_id: number;
  resource_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
  member_name?: string;
}

export interface Fine {
  id: number;
  borrowing_id: number;
  amount: number;
  paid: boolean;
  paid_at: string | null;
}

export interface Settings {
  fine_per_day: number;
  max_borrow_days: number;
  max_books_per_member: number;
  institution_name: string;
  grace_period_days: number;
  max_renewals: number;
}

export interface ServerInfo {
  ip: string;
  port: number;
  institutionName: string;
}

export interface ScanSession {
  id: number;
  institution_id: number;
  started_at: string;
  ended_at: string | null;
  status: 'in_progress' | 'completed';
}

export interface ScanEntry {
  id: number;
  session_id: number;
  isbn: string;
  resource_id: number | null;
  scanned_at: string;
}

export interface GhostCopy {
  resource_id: number;
  title: string;
  author: string;
  isbn: string;
  call_number: string | null;
  db_available: number;
  scan_count: number;
  missing_count: number;
}

export interface PhantomReturn {
  resource_id: number;
  title: string;
  author: string;
  isbn: string;
  call_number: string | null;
  db_available: number;
  scan_count: number;
  phantom_count: number;
}

export interface UnknownScan {
  isbn: string;
  scan_count: number;
}

export interface ExtraCopy {
  resource_id: number;
  title: string;
  author: string;
  isbn: string;
  call_number: string | null;
  total_copies: number;
  scan_count: number;
  extra_count: number;
}

export interface GateLog {
  id: number;
  institution_id: number;
  user_id: number;
  direction: GateDirection;
  method: GateMethod;
  logged_at: string;
  // joined
  user_name?: string;
  user_id_number?: string;
  user_role?: UserRole;
}

export interface DiscrepancyReport {
  session_id: number;
  started_at: string;
  ended_at: string;
  total_scanned: number;
  unique_isbns_scanned: number;
  ghost_copies: GhostCopy[];
  phantom_returns: PhantomReturn[];
  unknown_scans: UnknownScan[];
  extra_copies: ExtraCopy[];
}

export * from './import';
