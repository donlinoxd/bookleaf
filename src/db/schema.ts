export const SCHEMA_VERSION = 1;

export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS institutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT DEFAULT '',
    logo_uri TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institution_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    id_number TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('admin','librarian','member')),
    pin_hash TEXT NOT NULL,
    photo_uri TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
  );

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institution_id INTEGER NOT NULL,
    isbn TEXT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    publisher TEXT,
    year INTEGER,
    genre TEXT,
    description TEXT,
    cover_uri TEXT,
    total_copies INTEGER DEFAULT 1,
    available_copies INTEGER DEFAULT 1,
    added_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
  );

  CREATE TABLE IF NOT EXISTS book_copies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    copy_number INTEGER NOT NULL,
    condition TEXT DEFAULT 'good' CHECK(condition IN ('good','damaged','lost')),
    status TEXT DEFAULT 'available' CHECK(status IN ('available','borrowed','reserved')),
    FOREIGN KEY (book_id) REFERENCES books(id)
  );

  CREATE TABLE IF NOT EXISTS borrowing_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    copy_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    borrowed_at TEXT DEFAULT (datetime('now')),
    due_date TEXT NOT NULL,
    returned_at TEXT,
    fine_amount REAL DEFAULT 0,
    FOREIGN KEY (copy_id) REFERENCES book_copies(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reserved_at TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active','fulfilled','cancelled')),
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS fines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    borrowing_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    paid INTEGER DEFAULT 0,
    paid_at TEXT,
    FOREIGN KEY (borrowing_id) REFERENCES borrowing_records(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export const DEFAULT_SETTINGS = [
  ['fine_per_day', '5'],
  ['max_borrow_days', '7'],
  ['max_books_per_member', '3'],
  ['institution_name', 'My Library'],
];
