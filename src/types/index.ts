export type UserRole = 'admin' | 'librarian' | 'member';
export type AppMode = 'server' | 'client' | null;
export type BookCondition = 'good' | 'damaged' | 'lost';
export type CopyStatus = 'available' | 'borrowed' | 'reserved';
export type ReservationStatus = 'active' | 'fulfilled' | 'cancelled';

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

export interface Book {
  id: number;
  institution_id: number;
  isbn: string | null;
  title: string;
  author: string;
  publisher: string | null;
  year: number | null;
  genre: string | null;
  description: string | null;
  cover_uri: string | null;
  total_copies: number;
  available_copies: number;
  added_at: string;
}

export interface BookCopy {
  id: number;
  book_id: number;
  copy_number: number;
  condition: BookCondition;
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
  book_id: number;
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
