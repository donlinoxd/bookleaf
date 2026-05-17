import { eq, asc, and, like, or } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { hashPin, verifyPin } from '../db/database';
import { User, UserRole, UserType } from '../types';

export const UserService = {
  async getAll(institutionId: number): Promise<User[]> {
    return db.select().from(users)
      .where(eq(users.institution_id, institutionId))
      .orderBy(asc(users.name)) as Promise<User[]>;
  },

  async getById(id: number): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return (rows[0] ?? null) as User | null;
  },

  async getByIdNumber(idNumber: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.id_number, idNumber)).limit(1);
    return (rows[0] ?? null) as User | null;
  },

  async search(institutionId: number, query: string): Promise<User[]> {
    const q = `%${query}%`;
    return db.select().from(users)
      .where(and(
        eq(users.institution_id, institutionId),
        or(like(users.name, q), like(users.id_number, q))
      ))
      .orderBy(asc(users.name)) as Promise<User[]>;
  },

  async create(user: {
    institution_id: number;
    name: string;
    id_number: string;
    role: UserRole;
    pin: string;
    photo_uri?: string;
    department?: string;
    user_type?: UserType;
  }): Promise<number> {
    const pin_hash = hashPin(user.pin);
    const result = await db.insert(users).values({
      institution_id: user.institution_id,
      name: user.name,
      id_number: user.id_number,
      role: user.role,
      pin_hash,
      photo_uri: user.photo_uri ?? null,
      department: user.department ?? null,
      user_type: user.user_type ?? null,
    }).returning({ id: users.id });
    return result[0].id;
  },

  async authenticate(idNumber: string, pin: string): Promise<User | null> {
    const user = await UserService.getByIdNumber(idNumber);
    if (!user || !user.is_active) return null;
    return verifyPin(pin, user.pin_hash) ? user : null;
  },

  async updateStatus(id: number, isActive: boolean): Promise<void> {
    await db.update(users).set({ is_active: isActive }).where(eq(users.id, id));
  },

  async update(id: number, data: { name: string; id_number: string; role: UserRole; department?: string; user_type?: UserType | null }): Promise<void> {
    await db.update(users).set({
      name: data.name,
      id_number: data.id_number,
      role: data.role,
      department: data.department ?? null,
      user_type: data.user_type ?? null,
    }).where(eq(users.id, id));
  },

  async changePin(id: number, newPin: string): Promise<void> {
    await db.update(users).set({ pin_hash: hashPin(newPin) }).where(eq(users.id, id));
  },
};
