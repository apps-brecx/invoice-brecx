import crypto from "node:crypto";
import { env } from "../env.js";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = env.APP_ENCRYPTION_KEY;
  if (raw.length !== 64) {
    throw new Error("APP_ENCRYPTION_KEY must be a 32-byte value encoded as 64 hex characters.");
  }
  return Buffer.from(raw, "hex");
}

export function encrypt(plaintext: string | null | undefined): string {
  if (plaintext == null || plaintext === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(payload: string | null | undefined): string {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Encrypted payload is malformed.");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function mask(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value);
  if (s.length <= 6) return "•".repeat(s.length);
  return `${s.slice(0, 4)}${"•".repeat(Math.max(4, s.length - 8))}${s.slice(-4)}`;
}
