import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { templateSettingsSchema, paymentTermInputSchema, PAYMENT_TERMS } from "@inv/shared";
import { query } from "../db.js";
import {
  applyBranding,
  brandingSchema,
  extractBranding,
  readBranding,
  writeBranding,
} from "../lib/branding.js";
import {
  workspaceSettingsSchema,
  readWorkspaceSettings,
  writeWorkspaceSettings,
} from "../lib/workspace.js";

const TERMS_KEY = "custom_payment_terms";

interface StoredTerm {
  name: string;
  days: number;
}

async function readCustomTerms(): Promise<StoredTerm[]> {
  const { rows } = await query<{ value: string | null }>(
    `SELECT value FROM app_settings WHERE key = $1`,
    [TERMS_KEY],
  );
  if (!rows[0]?.value) return [];
  try {
    const parsed = JSON.parse(rows[0].value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Built-ins + user-defined terms, the shape both dropdowns consume. */
function mergedTerms(custom: StoredTerm[]) {
  return [
    ...PAYMENT_TERMS.map((name) => ({ name, days: null as number | null, builtin: true })),
    ...custom.map((t) => ({ name: t.name, days: t.days, builtin: false })),
  ];
}

const settingsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Workspace-wide preferences (Settings → General). Anyone can read;
  // only admins can change them.
  app.get("/settings/workspace", { preHandler: app.requireAuth }, async () => {
    return { workspace: await readWorkspaceSettings() };
  });

  app.put("/settings/workspace", { preHandler: app.requireAdmin }, async (req) => {
    const workspace = workspaceSettingsSchema.parse(req.body ?? {});
    await writeWorkspaceSettings(workspace);
    return { workspace };
  });

  // Global org branding (Settings → General → Organization profile) —
  // ONE logo/name/address, overlaid on every template at read time.
  app.get("/settings/branding", { preHandler: app.requireAuth }, async () => {
    return { branding: await readBranding() };
  });

  app.put("/settings/branding", { preHandler: app.requireAuth }, async (req) => {
    const branding = brandingSchema.parse(req.body ?? {});
    await writeBranding(branding);
    return { branding };
  });

  // The ACTIVE invoice template's settings — what invoices + print use.
  // (Templates themselves live in invoice_templates; see routes/templates.ts.)
  app.get("/settings/template", { preHandler: app.requireAuth }, async () => {
    const { rows } = await query<{ settings: unknown }>(
      `SELECT settings FROM invoice_templates WHERE is_active LIMIT 1`,
    );
    const branding = await readBranding();
    return { template: applyBranding(templateSettingsSchema.parse(rows[0]?.settings ?? {}), branding) };
  });

  // Payment terms: built-ins plus user-defined "due after N days" terms.
  app.get("/settings/payment-terms", { preHandler: app.requireAuth }, async () => {
    return { terms: mergedTerms(await readCustomTerms()) };
  });

  app.post("/settings/payment-terms", { preHandler: app.requireAuth }, async (req, reply) => {
    const body = paymentTermInputSchema.parse(req.body);
    const custom = await readCustomTerms();
    const exists =
      custom.some((t) => t.name.toLowerCase() === body.name.toLowerCase()) ||
      PAYMENT_TERMS.some((t) => t.toLowerCase() === body.name.toLowerCase());
    if (exists) return reply.code(409).send({ error: "A payment term with that name already exists." });
    custom.push({ name: body.name, days: body.days });
    await query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [TERMS_KEY, JSON.stringify(custom)],
    );
    return reply.code(201).send({ terms: mergedTerms(custom) });
  });

  app.put("/settings/template", { preHandler: app.requireAuth }, async (req) => {
    const template = templateSettingsSchema.parse(req.body ?? {});
    // Branding fields ride along with template edits — write them through
    // to the global copy so every other template follows.
    await extractBranding(template);
    const updated = await query(
      `UPDATE invoice_templates SET settings = $1, updated_at = NOW()
        WHERE is_active RETURNING id`,
      [JSON.stringify(template)],
    );
    if (!updated.rows[0]) {
      await query(
        `INSERT INTO invoice_templates (name, settings, is_active)
         VALUES ('Standard Template', $1, TRUE)`,
        [JSON.stringify(template)],
      );
    }
    return { template };
  });
};

export default settingsRoutes;
