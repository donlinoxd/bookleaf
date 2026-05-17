export type UserRole = 'admin' | 'librarian' | 'member';
export type AppMode = 'server' | 'client' | null;
export type CopyCondition = 'good' | 'damaged' | 'lost';
export type CopyStatus = 'available' | 'borrowed' | 'reserved';
export type ReservationStatus = 'active' | 'fulfilled' | 'cancelled';
export type MaterialType = 'BOOK' | 'SERIAL' | 'ARTICLE' | 'AUDIOVISUAL' | 'MAP' | 'MANUSCRIPT' | 'DIGITAL' | 'THESIS' | 'OTHER';
export type CallNumberType = 'DEWEY' | 'LC' | 'OTHER';

/** @deprecated use CopyCondition */
export type BookCondition = CopyCondition;

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
}

export interface Resource {
  id: number;
  institution_id: number;
  material_type: MaterialType;
  // Core bibliographic
  isbn: string | null;
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
}

export interface BorrowingRecord {
  id: number;
  copy_id: number;
  user_id: number;
  borrowed_at: string;
  due_date: string;
  returned_at: string | null;
  fine_amount: number;
  // joined fields
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
}

export interface ServerInfo {
  ip: string;
  port: number;
  institutionName: string;
}
