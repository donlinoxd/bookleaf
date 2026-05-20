import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { db } from '../db';
import {
  institutions, users, resources, resourceCopies,
  borrowingRecords, reservations, fines, settings,
} from '../db/schema';
import { encryptBackup, decryptBackup, BACKUP_FORMAT, EncryptedBackup } from './backupCrypto';

const BACKUP_VERSION = 3;
const VALID_ROLES = new Set(['admin', 'librarian', 'member']);
const VALID_USER_TYPES = new Set([null, undefined, 'student', 'faculty', 'alumni', 'external']);

interface BackupPayload {
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
}

export const BackupService = {
  async exportJson(passphrase: string): Promise<void> {
    if (!passphrase || passphrase.length < 6) {
      throw new Error('Passphrase must be at least 6 characters.');
    }

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

    const encrypted = encryptBackup(JSON.stringify(payload), passphrase);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const uri = `${FileSystem.documentDirectory}bookleaf-backup-${timestamp}.bookleaf`;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(encrypted, null, 2));
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save Bookleaf Backup' });
  },

  async importJson(passphrase: string): Promise<void> {
    if (!passphrase) throw new Error('Passphrase is required to restore a backup.');

    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);
    let encrypted: EncryptedBackup;
    try {
      encrypted = JSON.parse(raw);
    } catch {
      throw new Error('File is not a valid Bookleaf backup.');
    }
    if (!encrypted || encrypted.format !== BACKUP_FORMAT) {
      throw new Error('Unsupported backup file format. Expected an encrypted Bookleaf backup.');
    }

    const plaintext = decryptBackup(encrypted, passphrase);
    if (plaintext === null) {
      throw new Error('Wrong passphrase or the backup file is corrupted.');
    }

    let payload: BackupPayload;
    try {
      payload = JSON.parse(plaintext);
    } catch {
      throw new Error('Decrypted contents are not a valid backup payload.');
    }
    if (payload.version !== BACKUP_VERSION || !payload.data) {
      throw new Error('Incompatible backup version. Expected version ' + BACKUP_VERSION + '.');
    }

    const { data } = payload;

    // Reject anything obviously malformed before we touch the DB.
    for (const row of data.users) {
      const role = (row as { role?: string }).role;
      if (!role || !VALID_ROLES.has(role)) {
        throw new Error(`Backup contains a user with invalid role: ${role ?? '(missing)'}`);
      }
      const userType = (row as { user_type?: string | null }).user_type;
      if (!VALID_USER_TYPES.has(userType ?? null)) {
        throw new Error(`Backup contains a user with invalid user_type: ${userType}`);
      }
    }

    await db.transaction(async (tx) => {
      // Delete in FK-safe order (children first)
      await tx.delete(fines);
      await tx.delete(reservations);
      await tx.delete(borrowingRecords);
      await tx.delete(resourceCopies);
      await tx.delete(resources);
      await tx.delete(users);
      await tx.delete(institutions);
      await tx.delete(settings);

      // Insert in reverse FK order (parents first)
      if (data.institutions.length) await tx.insert(institutions).values(data.institutions as typeof institutions.$inferInsert[]);
      if (data.users.length) await tx.insert(users).values(data.users as typeof users.$inferInsert[]);
      if (data.resources.length) await tx.insert(resources).values(data.resources as typeof resources.$inferInsert[]);
      if (data.resource_copies.length) await tx.insert(resourceCopies).values(data.resource_copies as typeof resourceCopies.$inferInsert[]);
      if (data.borrowing_records.length) await tx.insert(borrowingRecords).values(data.borrowing_records as typeof borrowingRecords.$inferInsert[]);
      if (data.reservations.length) await tx.insert(reservations).values(data.reservations as typeof reservations.$inferInsert[]);
      if (data.fines.length) await tx.insert(fines).values(data.fines as typeof fines.$inferInsert[]);
      if (data.settings.length) await tx.insert(settings).values(data.settings as typeof settings.$inferInsert[]);
    });
  },
};
