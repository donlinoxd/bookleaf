import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const institutions = sqliteTable('institutions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  address: text('address').notNull().default(''),
  logo_uri: text('logo_uri'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  institution_id: integer('institution_id').notNull().references(() => institutions.id),
  name: text('name').notNull(),
  id_number: text('id_number').notNull().unique(),
  role: text('role', { enum: ['admin', 'librarian', 'member'] }).notNull(),
  pin_hash: text('pin_hash').notNull(),
  photo_uri: text('photo_uri'),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
  department: text('department'),
  user_type: text('user_type', { enum: ['student', 'faculty', 'alumni', 'external'] }),
});

export const resources = sqliteTable('resources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  institution_id: integer('institution_id').notNull().references(() => institutions.id),
  material_type: text('material_type', {
    enum: ['BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER'],
  }).notNull().default('BOOK'),
  // Core bibliographic fields
  isbn: text('isbn'),
  title: text('title').notNull(),
  author: text('author').notNull(),
  publisher: text('publisher'),
  year: integer('year'),
  genre: text('genre'),
  description: text('description'),
  cover_uri: text('cover_uri'),
  // RDA extended fields
  subtitle: text('subtitle'),
  edition: text('edition'),
  volume: text('volume'),
  issue_number: text('issue_number'),
  series_title: text('series_title'),
  doi: text('doi'),
  url: text('url'),
  duration: text('duration'),
  language: text('language'),
  call_number: text('call_number'),
  call_number_type: text('call_number_type', { enum: ['DEWEY', 'LC', 'OTHER'] }),
  content_type: text('content_type'),
  media_type: text('media_type'),
  carrier_type: text('carrier_type'),
  // Lending rules
  is_loanable: integer('is_loanable', { mode: 'boolean' }).notNull().default(true),
  loan_period_days: integer('loan_period_days'),
  // Inventory
  total_copies: integer('total_copies').notNull().default(1),
  available_copies: integer('available_copies').notNull().default(1),
  added_at: text('added_at').notNull().default(sql`(datetime('now'))`),
});

export const resourceCopies = sqliteTable('resource_copies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  resource_id: integer('resource_id').notNull().references(() => resources.id),
  copy_number: integer('copy_number').notNull(),
  condition: text('condition', { enum: ['good', 'damaged', 'lost'] }).notNull().default('good'),
  status: text('status', { enum: ['available', 'borrowed', 'reserved'] }).notNull().default('available'),
});

export const borrowingRecords = sqliteTable('borrowing_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  copy_id: integer('copy_id').notNull().references(() => resourceCopies.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  borrowed_at: text('borrowed_at').notNull().default(sql`(datetime('now'))`),
  due_date: text('due_date').notNull(),
  returned_at: text('returned_at'),
  fine_amount: real('fine_amount').notNull().default(0),
});

export const reservations = sqliteTable('reservations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  resource_id: integer('resource_id').notNull().references(() => resources.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  reserved_at: text('reserved_at').notNull().default(sql`(datetime('now'))`),
  status: text('status', { enum: ['active', 'fulfilled', 'cancelled'] }).notNull().default('active'),
});

export const fines = sqliteTable('fines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  borrowing_id: integer('borrowing_id').notNull().references(() => borrowingRecords.id),
  amount: real('amount').notNull(),
  paid: integer('paid', { mode: 'boolean' }).notNull().default(false),
  paid_at: text('paid_at'),
});

export const scanSessions = sqliteTable('scan_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  institution_id: integer('institution_id').notNull().references(() => institutions.id),
  started_at: text('started_at').notNull().default(sql`(datetime('now'))`),
  ended_at: text('ended_at'),
  status: text('status', { enum: ['in_progress', 'completed'] }).notNull().default('in_progress'),
});

export const scanEntries = sqliteTable('scan_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  session_id: integer('session_id').notNull().references(() => scanSessions.id),
  isbn: text('isbn').notNull(),
  resource_id: integer('resource_id').references(() => resources.id),
  scanned_at: text('scanned_at').notNull().default(sql`(datetime('now'))`),
});

export const gateLogs = sqliteTable('gate_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  institution_id: integer('institution_id').notNull().references(() => institutions.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  direction: text('direction', { enum: ['in', 'out'] }).notNull(),
  method: text('method', { enum: ['app', 'browser', 'manual'] }).notNull(),
  logged_at: text('logged_at').notNull().default(sql`(datetime('now'))`),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const DEFAULT_SETTINGS = [
  { key: 'fine_per_day', value: '5' },
  { key: 'max_borrow_days', value: '7' },
  { key: 'max_books_per_member', value: '3' },
  { key: 'institution_name', value: 'My School Library' },
] as const;
