import { z } from "zod";
import { query } from "../db.js";

const KEY = "workspace_settings";

export const workspaceSettingsSchema = z.object({
  orgName: z.string().trim().min(1).max(120).default("Fresh Finest LLC"),
  timezone: z.string().trim().max(80).default("America/New_York"),
  currency: z.string().trim().max(10).default("USD"),
  defaultTerms: z.string().trim().max(60).default("Due on Receipt"),
});
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

export async function readWorkspaceSettings(): Promise<WorkspaceSettings> {
  const { rows } = await query<{ value: string | null }>(
    `SELECT value FROM app_settings WHERE key = $1`,
    [KEY],
  );
  let stored: unknown = {};
  if (rows[0]?.value) {
    try {
      stored = JSON.parse(rows[0].value);
    } catch {
      stored = {};
    }
  }
  return workspaceSettingsSchema.parse(stored);
}

export async function writeWorkspaceSettings(settings: WorkspaceSettings): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, JSON.stringify(settings)],
  );
}
