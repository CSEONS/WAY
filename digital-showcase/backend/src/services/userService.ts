import bcrypt from "bcryptjs";
import { getDb } from "../database/db.js";
import type { User } from "../types/models.js";

const publicUserFields = "id, name, email, phone, role, createdAt, updatedAt";

/** One form for a Russian phone number: "8 928 …", "+7 (928) …" and "928…" all become "7928…". */
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

/** Login is an email (any letter case) or a phone number in any common format. */
export async function findUserByLogin(login: string) {
  const db = await getDb();
  const value = login.trim();
  const byEmail = await db.get<User>("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", value);
  if (byEmail) return byEmail;

  const phone = normalizePhone(value);
  if (phone.length < 10) return undefined;
  const usersWithPhone = await db.all<User>("SELECT * FROM users WHERE phone IS NOT NULL AND phone != ''");
  return usersWithPhone.find((user) => normalizePhone(user.phone ?? "") === phone);
}

export async function setUserPassword(id: string, password: string) {
  const db = await getDb();
  await db.run("UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?", await bcrypt.hash(password, 10), new Date().toISOString(), id);
}

export async function findUserById(id: string) {
  const db = await getDb();
  return db.get<User>(`SELECT * FROM users WHERE id = ?`, id);
}

export async function listOwners() {
  const db = await getDb();
  return db.all<Omit<User, "passwordHash">>(`SELECT ${publicUserFields} FROM users WHERE role = 'OWNER' ORDER BY createdAt DESC`);
}

export async function getOwner(id: string) {
  const db = await getDb();
  return db.get<Omit<User, "passwordHash">>(`SELECT ${publicUserFields} FROM users WHERE id = ? AND role = 'OWNER'`, id);
}

export async function createOwner(input: { name: string; email?: string; phone?: string; password: string }) {
  if (input.password.length < 6) {
    throw new Error("Пароль должен содержать минимум 6 символов");
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const id = crypto.randomUUID();
  await db.run(
    "INSERT INTO users (id, name, email, phone, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'OWNER', ?, ?)",
    id,
    input.name,
    input.email || null,
    input.phone || null,
    passwordHash,
    now,
    now
  );
  return getOwner(id);
}

export async function updateOwner(id: string, input: { name?: string; email?: string | null; phone?: string | null; password?: string }) {
  if (input.password !== undefined && input.password.length < 6) {
    throw new Error("Пароль должен содержать минимум 6 символов");
  }

  const db = await getDb();
  const current = await getOwner(id);
  if (!current) return null;
  const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
  await db.run(
    `UPDATE users SET name = ?, email = ?, phone = ?, passwordHash = COALESCE(?, passwordHash), updatedAt = ? WHERE id = ? AND role = 'OWNER'`,
    input.name ?? current.name,
    Object.prototype.hasOwnProperty.call(input, "email") ? input.email : current.email,
    Object.prototype.hasOwnProperty.call(input, "phone") ? input.phone : current.phone,
    passwordHash ?? null,
    new Date().toISOString(),
    id
  );
  return getOwner(id);
}

export async function deleteOwner(id: string) {
  const db = await getDb();
  await db.run("DELETE FROM users WHERE id = ? AND role = 'OWNER'", id);
}
