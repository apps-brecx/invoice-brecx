import crypto from "node:crypto";
import { query } from "../db.js";
import { SESSION_MAX_AGE_SECONDS } from "./sessions.js";

export interface SessionRecord {
  sid: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}

/* Every authed request checks its sid is still alive; the check doubles as
 * the last_seen touch. A 60s in-memory cache keeps that at ~1 query/min per
 * device instead of one per request. Revokes clear the cache immediately, so
 * a kicked device is out within a minute at worst — instantly in-process. */
const aliveCache = new Map<string, { ok: boolean; at: number }>();
const CACHE_TTL_MS = 60_000;

export async function createSessionRecord(
  userId: number,
  userAgent: string | null | undefined,
  ip: string | null | undefined,
): Promise<string> {
  const sid = crypto.randomUUID();
  await query(
    `INSERT INTO user_sessions (sid, user_id, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(secs => $5))`,
    [sid, userId, userAgent?.slice(0, 500) || null, ip || null, SESSION_MAX_AGE_SECONDS],
  );
  return sid;
}

export async function sessionAlive(sid: string): Promise<boolean> {
  const hit = aliveCache.get(sid);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ok;
  const { rows } = await query(
    `UPDATE user_sessions SET last_seen_at = NOW()
      WHERE sid = $1 AND revoked_at IS NULL AND expires_at > NOW()
      RETURNING sid`,
    [sid],
  );
  const ok = rows.length > 0;
  aliveCache.set(sid, { ok, at: Date.now() });
  if (aliveCache.size > 5000) aliveCache.clear(); // unbounded-growth backstop
  return ok;
}

export async function revokeSession(sid: string, userId?: number): Promise<boolean> {
  const { rows } = await query(
    `UPDATE user_sessions SET revoked_at = NOW()
      WHERE sid = $1 AND revoked_at IS NULL ${userId ? "AND user_id = $2" : ""}
      RETURNING sid`,
    userId ? [sid, userId] : [sid],
  );
  aliveCache.delete(sid);
  return rows.length > 0;
}

/** Password change / "sign out everywhere": kill every device but this one. */
export async function revokeOtherSessions(userId: number, keepSid: string | null): Promise<void> {
  const { rows } = await query<{ sid: string }>(
    `UPDATE user_sessions SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL AND sid IS DISTINCT FROM $2
      RETURNING sid`,
    [userId, keepSid],
  );
  for (const r of rows) aliveCache.delete(r.sid);
}

export async function revokeAllSessions(userId: number): Promise<void> {
  await revokeOtherSessions(userId, null);
}

export async function listSessions(userId: number): Promise<SessionRecord[]> {
  const { rows } = await query<SessionRecord>(
    `SELECT sid, user_agent, ip, created_at, last_seen_at, expires_at
       FROM user_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY last_seen_at DESC`,
    [userId],
  );
  return rows;
}
