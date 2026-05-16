import { getDatabase, hashPin, verifyPin } from '../db/database';
import { User, UserRole } from '../types';

export const UserService = {
  async getAll(institutionId: number): Promise<User[]> {
    const db = await getDatabase();
    return db.getAllAsync<User>(
      'SELECT * FROM users WHERE institution_id = ? ORDER BY name ASC',
      [institutionId]
    );
  },

  async getById(id: number): Promise<User | null> {
    const db = await getDatabase();
    return db.getFirstAsync<User>('SELECT * FROM users WHERE id = ?', [id]);
  },

  async getByIdNumber(idNumber: string): Promise<User | null> {
    const db = await getDatabase();
    return db.getFirstAsync<User>(
      'SELECT * FROM users WHERE id_number = ?',
      [idNumber]
    );
  },

  async search(institutionId: number, query: string): Promise<User[]> {
    const db = await getDatabase();
    const q = `%${query}%`;
    return db.getAllAsync<User>(
      `SELECT * FROM users WHERE institution_id = ?
       AND (name LIKE ? OR id_number LIKE ?) ORDER BY name ASC`,
      [institutionId, q, q]
    );
  },

  async create(user: {
    institution_id: number;
    name: string;
    id_number: string;
    role: UserRole;
    pin: string;
    photo_uri?: string;
  }): Promise<number> {
    const db = await getDatabase();
    const pin_hash = await hashPin(user.pin);
    const result = await db.runAsync(
      `INSERT INTO users (institution_id, name, id_number, role, pin_hash, photo_uri)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.institution_id, user.name, user.id_number,
       user.role, pin_hash, user.photo_uri ?? null]
    );
    return result.lastInsertRowId;
  },

  async authenticate(idNumber: string, pin: string): Promise<User | null> {
    const user = await UserService.getByIdNumber(idNumber);
    if (!user || !user.is_active) return null;
    const valid = await verifyPin(pin, user.pin_hash);
    return valid ? user : null;
  },

  async updateStatus(id: number, isActive: boolean): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  },

  async changePin(id: number, newPin: string): Promise<void> {
    const db = await getDatabase();
    const pin_hash = await hashPin(newPin);
    await db.runAsync('UPDATE users SET pin_hash = ? WHERE id = ?', [pin_hash, id]);
  },
};
