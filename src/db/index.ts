import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';
import { DEFAULT_SETTINGS, settings } from './schema';

const expo = SQLite.openDatabaseSync('library.db');
export const db = drizzle(expo, { schema });

export async function seedDefaults(): Promise<void> {
  await db
    .insert(settings)
    .values(DEFAULT_SETTINGS.map(s => ({ key: s.key, value: s.value })))
    .onConflictDoNothing();
}
