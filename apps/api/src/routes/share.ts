import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { query } from "../db.js";
import { logActivity } from "../lib/activity.js";
import { ENRICHED } from "./invoices.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });
const tokenParam = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
const shareInputSchema = z.object({
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  visibility: z.enum(["public", "private"]).default("public"),
});
const verifyInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/** Zoho-style "Share Invoice Link": tokened public URLs with an expiry. */
const shareRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Active link count — the modal uses it to enable "Disable All".
  app.get("/invoices/:id/share", { preHandler: app.requireAuth }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM invoice_share_links
        WHERE invoice_id = $1 AND revoked_at IS NULL AND expires_at >= CURRENT_DATE`,
      [id],
    );
    return { active: rows[0].n };
  });

  app.post("/invoices/:id/share", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { expiresAt, visibility } = shareInputSchema.parse(req.body);
    if (new Date(`${expiresAt}T00:00:00`) < new Date(new Date().toDateString())) {
      return reply.code(400).send({ error: "Expiration date can't be in the past." });
    }
    const inv = await query<{ number: string }>(`SELECT number FROM invoices WHERE id = $1`, [id]);
    if (!inv.rows[0]) return reply.code(404).send({ error: "Invoice not found." });

    const token = randomBytes(32).toString("hex");
    await query(
      `INSERT INTO invoice_share_links (invoice_id, token, expires_at, visibility, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, token, expiresAt, visibility, req.user?.name || req.user?.email || null],
    );
    logActivity(req, {
      action: "link_shared",
      entity: "invoice",
      entityId: id,
      entityLabel: inv.rows[0].number,
      details: `${visibility === "private" ? "Private & secure" : "Public"} link generated · expires ${expiresAt}`,
    });
    return reply.code(201).send({ token, expiresAt, visibility });
  });

  app.post("/invoices/:id/share/disable", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const inv = await query<{ number: string }>(`SELECT number FROM invoices WHERE id = $1`, [id]);
    if (!inv.rows[0]) return reply.code(404).send({ error: "Invoice not found." });
    const { rowCount } = await query(
      `UPDATE invoice_share_links SET revoked_at = NOW()
        WHERE invoice_id = $1 AND revoked_at IS NULL`,
      [id],
    );
    if (rowCount) {
      logActivity(req, {
        action: "links_disabled",
        entity: "invoice",
        entityId: id,
        entityLabel: inv.rows[0].number,
        details: `${rowCount} share link${rowCount === 1 ? "" : "s"} disabled`,
      });
    }
    return { disabled: rowCount ?? 0 };
  });

  /** The invoice + items + active template — everything the public paper
   *  needs. Returns null when the invoice vanished. */
  async function sharedPayload(id: number) {
    const { rows } = await query(
      `SELECT t.*, c.email AS client_email,
              c.address_line1, c.address_line2, c.city, c.postal_code, c.country,
              c.shipping_attention, c.shipping_street1, c.shipping_street2,
              c.shipping_city, c.shipping_state, c.shipping_zip, c.shipping_country
         FROM (${ENRICHED}) t JOIN clients c ON c.id = t.client_id
        WHERE t.id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    const items = await query(
      `SELECT description, quantity, unit_price, amount, position, unit, extra
         FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC`,
      [id],
    );
    const tpl = await query<{ settings: unknown }>(
      `SELECT settings FROM invoice_templates WHERE is_active LIMIT 1`,
    );
    return { invoice: rows[0], items: items.rows, template: tpl.rows[0]?.settings ?? {} };
  }

  const liveLink = async (token: string) => {
    const { rows } = await query<{ invoice_id: number; visibility: string }>(
      `SELECT invoice_id, visibility FROM invoice_share_links
        WHERE token = $1 AND revoked_at IS NULL AND expires_at >= CURRENT_DATE`,
      [token],
    );
    return rows[0] ?? null;
  };

  // PUBLIC — no auth. Public links return the invoice straight away; private
  // ones only reveal that an email check is needed.
  app.get("/share/:token", async (req, reply) => {
    const { token } = tokenParam.parse(req.params);
    const link = await liveLink(token);
    if (!link) return reply.code(404).send({ error: "This link has expired or been disabled." });
    if (link.visibility === "private") return { private: true };
    const payload = await sharedPayload(link.invoice_id);
    if (!payload) return reply.code(404).send({ error: "Invoice not found." });
    return payload;
  });

  // PUBLIC — the "Private & Secure" gate: the viewer proves they're the
  // customer by entering the email the invoice was issued to.
  app.post("/share/:token/verify", async (req, reply) => {
    const { token } = tokenParam.parse(req.params);
    const { email } = verifyInputSchema.parse(req.body);
    const link = await liveLink(token);
    if (!link) return reply.code(404).send({ error: "This link has expired or been disabled." });

    const client = await query<{ email: string | null; contact_persons: Array<{ email?: string }> }>(
      `SELECT c.email, c.contact_persons FROM clients c
         JOIN invoices i ON i.client_id = c.id WHERE i.id = $1`,
      [link.invoice_id],
    );
    const c = client.rows[0];
    const known = [c?.email, ...(c?.contact_persons ?? []).map((p) => p?.email)]
      .filter((e): e is string => Boolean(e))
      .map((e) => e.trim().toLowerCase());
    if (!known.includes(email)) {
      return reply
        .code(403)
        .send({ error: "That email doesn't match our records for this invoice." });
    }
    const payload = await sharedPayload(link.invoice_id);
    if (!payload) return reply.code(404).send({ error: "Invoice not found." });
    return payload;
  });
};

export default shareRoutes;
