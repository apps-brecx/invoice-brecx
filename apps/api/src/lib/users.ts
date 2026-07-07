import crypto from "node:crypto";
import { query } from "../db.js";
import { env } from "../env.js";
import { logger } from "../logger.js";

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  password_salt: string;
  name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface UserPublic {
  id: number;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!password || !hash || !salt) return false;
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(test, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function listUsers(): Promise<UserPublic[]> {
  const { rows } = await query<UserPublic>(
    `SELECT id, email, name, role, created_at, last_login_at
       FROM users ORDER BY created_at ASC`,
  );
  return rows;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  if (!email) return null;
  const { rows } = await query<UserRow>(
    "SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [email.trim()],
  );
  return rows[0] ?? null;
}

export async function getUserById(id: number): Promise<UserRow | null> {
  const { rows } = await query<UserRow>("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
  return rows[0] ?? null;
}

export async function createUser({
  email,
  password,
  name,
  role,
}: {
  email: string;
  password: string;
  name?: string;
  role?: string;
}): Promise<UserPublic> {
  const { hash, salt } = hashPassword(password);
  const { rows } = await query<UserPublic>(
    `INSERT INTO users (email, password_hash, password_salt, name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, role, created_at, last_login_at`,
    [email.trim().toLowerCase(), hash, salt, name || null, role || "user"],
  );
  return rows[0];
}

export async function updatePassword(id: number, newPassword: string): Promise<void> {
  const { hash, salt } = hashPassword(newPassword);
  await query(
    `UPDATE users
        SET password_hash = $1, password_salt = $2, updated_at = NOW()
      WHERE id = $3`,
    [hash, salt, id],
  );
}

export async function updateUser(
  id: number,
  { name, role }: { name?: string | null; role?: string | null },
): Promise<void> {
  await query(
    `UPDATE users SET name = COALESCE($1, name), role = COALESCE($2, role), updated_at = NOW() WHERE id = $3`,
    [name || null, role || null, id],
  );
}

export async function deleteUser(id: number): Promise<void> {
  await query("DELETE FROM users WHERE id = $1", [id]);
}

export async function recordLogin(id: number): Promise<void> {
  await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [id]);
}

export async function countUsers(): Promise<number> {
  const { rows } = await query<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
  return rows[0].n;
}

export async function bootstrapAdmin(): Promise<UserRow | UserPublic | null> {
  const total = await countUsers();
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;

  if (!email && !password) {
    if (total === 0) {
      logger.warn("[users] No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD, then redeploy.");
    } else {
      logger.info(`[users] ${total} user(s) in database; no bootstrap env vars set.`);
    }
    return null;
  }
  if (!email || !password) {
    logger.warn("[users] Set BOTH ADMIN_EMAIL and ADMIN_PASSWORD to bootstrap or reset the admin.");
    return null;
  }
  if (password.length < 8) {
    logger.warn("[users] ADMIN_PASSWORD must be at least 8 characters. Skipping bootstrap.");
    return null;
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    await updatePassword(existing.id, password);
    await updateUser(existing.id, { role: "admin" });
    logger.info(`[users] Reset password and ensured admin role for ${email}.`);
    return existing;
  }

  const user = await createUser({ email, password, name: "Admin", role: "admin" });
  logger.info(`[users] Seeded admin user: ${user.email}`);
  return user;
}
