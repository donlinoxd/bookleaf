import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { db } from '../db';
import {
  institutions, users, resources, resourceCopies,
  borrowingRecords, reservations, fines, settings,
} from '../db/schema';

const BACKUP_VERSION = 2;

type BackupPayload = {
  version: number;
  exported_at: string;
  data: {
    institutions: Record<string, unknown>[];
    users: Record<string, unknown>[];
    resources: Record<string, unknown>[];
    resource_copies: Record<string, unknown>[];
    borrowing_records: Record<string, unknown>[];
    reservations: Record<string, unknown>[];
    fines: Record<string, unknown>[];
    settings: Record<string, unknown>[];
  };
};

export const BackupService = {
  async exportJson(): Promise<void> {
    const [inst, usr, res, copies, borrows, resv, fns, stgs] = await Promise.all([
      db.select().from(institutions),
      db.select().from(users),
      db.select().from(resources),
      db.select().from(resourceCopies),
      db.select().from(borrowingRecords),
      db.select().from(reservations),
      db.select().from(fines),
      db.select().from(settings),
    ]);

    const payload: BackupPayload = {
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      data: {
        institutions: inst,
        users: usr,
        resources: res,
        resource_copies: copies,
        borrowing_records: borrows,
        reservations: resv,
        fines: fns,
        settings: stgs,
      },
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const uri = `${FileSystem.documentDirectory}bookleaf-backup-${timestamp}.json`;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2));
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save Bookleaf Backup' });
  },

  async importJson(): Promise<void> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);
    let payload: BackupPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error('File is not valid JSON.');
    }

    if (payload.version !== BACKUP_VERSION || !payload.data) {
      throw new Error('Invalid or incompatible backup file (wrong version).');
    }

    const { data } = payload;

    // Delete in FK-safe order (children first)
    await db.delete(fines);
    await db.delete(reservations);
    await db.delete(borrowingRecords);
    await db.delete(resourceCopies);
    await db.delete(resources);
    await db.delete(users);
    await db.delete(institutions);
    await db.delete(settings);

    // Insert in reverse FK order (parents first)
    if (data.institutions.length) await db.insert(institutions).values(data.institutions as typeof institutions.$inferInsert[]);
    if (data.users.length) await db.insert(users).values(data.users as typeof users.$inferInsert[]);
    if (data.resources.length) await db.insert(resources).values(data.resources as typeof resources.$inferInsert[]);
    if (data.resource_copies.length) await db.insert(resourceCopies).values(data.resource_copies as typeof resourceCopies.$inferInsert[]);
    if (data.borrowing_records.length) await db.insert(borrowingRecords).values(data.borrowing_records as typeof borrowingRecords.$inferInsert[]);
    if (data.reservations.length) await db.insert(reservations).values(data.reservations as typeof reservations.$inferInsert[]);
    if (data.fines.length) await db.insert(fines).values(data.fines as typeof fines.$inferInsert[]);
    if (data.settings.length) await db.insert(settings).values(data.settings as typeof settings.$inferInsert[]);
  },
};
