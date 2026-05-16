import * as SQLite from 'expo-sqlite';
import SHA256 from 'crypto-js/sha256';
import { CREATE_TABLES, DEFAULT_SETTINGS, SCHEMA_VERSION } from './schema';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('library.db');
  await initDatabase(db);
  return db;
}

async function initDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA journal_mode = WAL;');
  await database.execAsync('PRAGMA foreign_keys = ON;');

  const statements = CREATE_TABLES.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await database.execAsync(stmt + ';');
  }

  const versionRow = await database.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version LIMIT 1'
  );

  if (!versionRow) {
    await database.runAsync('INSERT INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION]);
    await seedDefaultSettings(database);
  }
}

async function seedDefaultSettings(database: SQLite.SQLiteDatabase): Promise<void> {
  for (const [key, value] of DEFAULT_SETTINGS) {
    await database.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  }
}

export async function hashPin(pin: string): Promise<string> {
  return SHA256(pin).toString();
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const pinHash = await hashPin(pin);
  return pinHash === hash;
}
