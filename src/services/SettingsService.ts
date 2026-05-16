import { db } from '../db';
import { settings } from '../db/schema';
import { Settings } from '../types';

export const SettingsService = {
  async getAll(): Promise<Settings> {
    const rows = await db.select().from(settings);
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
      fine_per_day: parseFloat(map.fine_per_day ?? '5'),
      max_borrow_days: parseInt(map.max_borrow_days ?? '7'),
      max_books_per_member: parseInt(map.max_books_per_member ?? '3'),
      institution_name: map.institution_name ?? 'My School Library',
    };
  },

  async set(key: string, value: string): Promise<void> {
    await db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  },

  async update(data: Partial<Settings>): Promise<void> {
    for (const [key, value] of Object.entries(data) as [string, string | number][]) {
      await SettingsService.set(key, String(value));
    }
  },
};
