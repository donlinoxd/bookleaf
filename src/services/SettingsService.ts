import { getDatabase } from '../db/database';
import { Settings } from '../types';

export const SettingsService = {
  async getAll(): Promise<Settings> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
      fine_per_day: parseFloat(map.fine_per_day ?? '5'),
      max_borrow_days: parseInt(map.max_borrow_days ?? '7'),
      max_books_per_member: parseInt(map.max_books_per_member ?? '3'),
      institution_name: map.institution_name ?? 'My Library',
    };
  },

  async set(key: string, value: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  },

  async update(settings: Partial<Settings>): Promise<void> {
    const entries = Object.entries(settings) as [string, string | number][];
    for (const [key, value] of entries) {
      await SettingsService.set(key, String(value));
    }
  },
};
