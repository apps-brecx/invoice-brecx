import crypto from "node:crypto";
import { env } from "../env.js";
import type { SessionUser } from "@inv/shared";

export const MAX_AGE_DAYS = 30;

interface SessionPayload extends SessionUser {
  iat: number;
  exp?: number;
  /** Tracked-session id (user_sessions.sid). Absent on legacy cookies. */
  sid?: string;
}

function getSecret(): string {
  return env.SESSION_SECRET;
}

export function signSession(payload: Omit<SessionPayload, "iat"> & { iat?: number }): string {
  const full: SessionPayload = { ...payload, iat: payload.iat ?? Date.now() };
  const json = JSON.stringify(full);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifySession(value: string | undefined | null): SessionPayload | null {
  if (!value || typeof value !== "string") return null;
  const idx = value.lastIndexOf(".");
  if (idx < 0) return null;
  const b64 = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as SessionPayload;
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_SECONDS = MAX_AGE_DAYS * 24 * 60 * 60;
