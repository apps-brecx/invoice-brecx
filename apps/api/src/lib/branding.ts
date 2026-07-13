import { z } from "zod";
import { query } from "../db.js";

const KEY = "org_branding";

/** The org identity printed on every invoice paper — ONE logo/name/address
 *  for the whole workspace, stored in app_settings. Templates never own
 *  branding: it is overlaid on every read, so editing it once (anywhere)
 *  changes every template, invoice, share link and email at the same time. */
export const brandingSchema = z.object({
  orgName: z.string().trim().max(200).default("Fresh Finest"),
  orgTagline: z.string().trim().max(200).default(""),
  orgAddress: z.string().trim().max(500).default(""),
  orgPhone: z.string().trim().max(60).default(""),
  orgEmail: z.string().trim().max(200).default(""),
  /** Data-URL of the uploaded logo (kept small client-side). */
  logoDataUrl: z.string().max(400_000).default(""),
});
export type OrgBranding = z.infer<typeof brandingSchema>;

const BRANDING_KEYS = Object.keys(brandingSchema.shape) as Array<keyof OrgBranding>;

export async function readBranding(): Promise<OrgBranding> {
  const { rows } = await query<{ value: string | null }>(
    `SELECT value FROM app_settings WHERE key = $1`,
    [KEY],
  );
  if (rows[0]?.value) {
    try {
      return brandingSchema.parse(JSON.parse(rows[0].value));
    } catch {
      /* fall through and reseed */
    }
  }
  // First run: adopt the active template's branding so the existing logo
  // and org details carry over, then persist them as the global copy.
  const active = await query<{ settings: Record<string, unknown> | null }>(
    `SELECT settings FROM invoice_templates WHERE is_active LIMIT 1`,
  );
  const seeded = brandingSchema.parse(active.rows[0]?.settings ?? {});
  await writeBranding(seeded);
  return seeded;
}

export async function writeBranding(branding: OrgBranding): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, JSON.stringify(branding)],
  );
}

/** Global branding wins over whatever the template row happens to store. */
export function applyBranding<T extends Record<string, unknown>>(
  settings: T,
  branding: OrgBranding,
): T {
  return { ...settings, ...branding };
}

/** Template UPDATES double as branding edits: their payloads come from an
 *  overlaid read, so the branding fields they carry are the user's current
 *  (possibly edited) global values — write them through. Template CREATES
 *  must never call this: proposals without branding would blank the logo. */
export async function extractBranding(settings: Record<string, unknown>): Promise<void> {
  const picked: Record<string, unknown> = {};
  for (const key of BRANDING_KEYS) {
    if (settings[key] !== undefined) picked[key] = settings[key];
  }
  await writeBranding(brandingSchema.parse(picked));
}
