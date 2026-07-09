import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { clientInputSchema, clientCommentSchema, type ClientInput } from "@inv/shared";
import { query } from "../db.js";
import { env } from "../env.js";
import { DOC_MIMES, saveClientDoc, readClientDoc, deleteClientDoc } from "../lib/storage.js";
import { smtpConfigured, sendMail } from "../lib/mailer.js";
import { renderStatementEmail } from "../lib/statementEmail.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** Statement rows arrive pre-computed from the web app (it already builds
 *  them for the on-screen paper) — the server just renders + sends. */
const stmtContentSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  /** Rich-text body from the compose editor (plain `message` is the fallback). */
  messageHtml: z.string().max(30000).optional().default(""),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statement: z.object({
    opening: z.number(),
    invoiced: z.number(),
    received: z.number(),
    balance: z.number(),
    rows: z
      .array(
        z.object({
          date: z.string().max(20),
          label: z.string().max(160),
          details: z.string().max(240).optional().default(""),
          amount: z.number().nullable().optional(),
          payment: z.number().nullable().optional(),
        }),
      )
      .max(500),
  }),
});

const stmtEmailSchema = stmtContentSchema.extend({
  to: z.string().trim().min(3).max(500),
  cc: z.string().trim().max(500).optional().default(""),
  bcc: z.string().trim().max(500).optional().default(""),
  subject: z.string().trim().min(1).max(300),
  /** PDF of the statement, generated client-side (base64, ≤ ~10 MB). */
  attachment: z
    .object({
      filename: z.string().trim().min(1).max(200),
      data: z.string().min(1).max(15_000_000),
    })
    .optional(),
});

const MAX_DOCS_PER_CLIENT = 3;

/** Upload payload: base64 (no data-URL prefix) + original filename + mime.
 *  10 MB per file — the route's bodyLimit allows for base64's +33% overhead. */
const docUploadSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  mime: z.string().refine((m) => m in DOC_MIMES, "Unsupported file type"),
  data: z.string().min(1).max(15_000_000),
});

/** One source of truth for the input→column mapping so INSERT and UPDATE
 *  can never drift apart. */
function clientColumns(body: ClientInput): { cols: string[]; values: unknown[] } {
  const map: Record<string, unknown> = {
    name: body.name,
    type: body.type,
    salutation: body.salutation || null,
    first_name: body.firstName || null,
    last_name: body.lastName || null,
    company: body.company || null,
    currency: body.currency,
    email: body.email || null,
    phone: body.phone || null,
    mobile: body.mobile || null,
    language: body.language,
    payment_terms: body.paymentTerms,
    portal_enabled: body.portalEnabled,
    billing_attention: body.billingAttention || null,
    address_line1: body.addressLine1 || null,
    address_line2: body.addressLine2 || null,
    city: body.city || null,
    billing_state: body.state || null,
    postal_code: body.postalCode || null,
    country: body.country || null,
    billing_phone: body.billingPhone || null,
    billing_fax: body.billingFax || null,
    shipping_attention: body.shippingAttention || null,
    shipping_street1: body.shippingStreet1 || null,
    shipping_street2: body.shippingStreet2 || null,
    shipping_city: body.shippingCity || null,
    shipping_state: body.shippingState || null,
    shipping_zip: body.shippingZip || null,
    shipping_country: body.shippingCountry || null,
    shipping_phone: body.shippingPhone || null,
    shipping_fax: body.shippingFax || null,
    website: body.website || null,
    department: body.department || null,
    designation: body.designation || null,
    twitter: body.twitter || null,
    skype: body.skype || null,
    facebook: body.facebook || null,
    tax_id: body.taxId || null,
    notes: body.notes || null,
    contact_persons: JSON.stringify(body.contactPersons ?? []),
  };
  return { cols: Object.keys(map), values: Object.values(map) };
}

const clientsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/clients", { preHandler: app.requireAuth }, async (req) => {
    const { q } = z.object({ q: z.string().trim().default("") }).parse(req.query ?? {});
    const { rows } = await query(
      `SELECT c.*,
              COUNT(i.id)::int                       AS invoices_count,
              COALESCE(SUM(i.total), 0)::numeric     AS invoiced_total,
              COALESCE(pay.lifetime, 0)::numeric     AS lifetime_paid,
              pay.avg_pay_days
         FROM clients c
         LEFT JOIN invoices i ON i.client_id = c.id AND i.status <> 'void'
         LEFT JOIN LATERAL (
           SELECT SUM(p.amount) AS lifetime,
                  AVG(p.paid_on - i2.issue_date)::numeric(8,1) AS avg_pay_days
             FROM payments p JOIN invoices i2 ON i2.id = p.invoice_id
            WHERE i2.client_id = c.id
         ) pay ON TRUE
        WHERE $1 = '' OR c.name ILIKE '%' || $1 || '%'
              OR c.company ILIKE '%' || $1 || '%' OR c.email ILIKE '%' || $1 || '%'
        GROUP BY c.id, pay.lifetime, pay.avg_pay_days
        ORDER BY c.name ASC`,
      [q],
    );
    return { clients: rows };
  });

  app.get("/clients/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await query(`SELECT * FROM clients WHERE id = $1`, [id]);
    if (!rows[0]) return reply.code(404).send({ error: "Client not found." });
    return { client: rows[0] };
  });

  app.post("/clients", { preHandler: app.requireAuth }, async (req, reply) => {
    const body = clientInputSchema.parse(req.body);
    const { cols, values } = clientColumns(body);
    cols.push("created_by");
    values.push(req.user?.name || req.user?.email || null);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await query(
      `INSERT INTO clients (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return reply.code(201).send({ client: rows[0] });
  });

  app.put("/clients/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = clientInputSchema.parse(req.body);
    const { cols, values } = clientColumns(body);
    cols.push("updated_by");
    values.push(req.user?.name || req.user?.email || null);
    const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
    const { rows } = await query(
      `UPDATE clients SET ${sets}, updated_at = NOW() WHERE id = $${values.length + 1} RETURNING *`,
      [...values, id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Client not found." });
    return { client: rows[0] };
  });

  // Mark as Active / Inactive (Zoho-style) — inactive customers stay on
  // record but are visually muted in the list.
  app.patch("/clients/:id/active", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const by = req.user?.name || req.user?.email || null;
    const { rows } = await query(
      `UPDATE clients SET active = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3 RETURNING *`,
      [active, by, id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Client not found." });
    return { client: rows[0] };
  });

  app.delete("/clients/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const invoices = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM invoices WHERE client_id = $1`,
      [id],
    );
    if (invoices.rows[0].n > 0) {
      return reply.code(409).send({ error: "Client has invoices — void or delete them first." });
    }
    // Grab document keys first — the row cascade won't clean up disk files.
    const docs = await query<{ storage_key: string }>(
      `SELECT storage_key FROM client_documents WHERE client_id = $1`,
      [id],
    );
    await query(`DELETE FROM clients WHERE id = $1`, [id]);
    for (const d of docs.rows) deleteClientDoc(d.storage_key);
    return { ok: true };
  });

  // ---- Statement email ----

  // The compose modal shows who the email will go out as.
  app.get("/email/sender", { preHandler: app.requireAuth }, async () => ({
    configured: smtpConfigured(),
    from: smtpConfigured() ? env.SMTP_FROM : null,
  }));

  app.post(
    "/clients/:id/statement/email",
    { preHandler: app.requireAuth, bodyLimit: 16 * 1024 * 1024 },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const body = stmtEmailSchema.parse(req.body);
      const client = await query<{ name: string }>(`SELECT name FROM clients WHERE id = $1`, [id]);
      if (!client.rows[0]) return reply.code(404).send({ error: "Client not found." });
      if (!smtpConfigured()) {
        return reply
          .code(400)
          .send({ error: "Email isn't configured — set SMTP_* in the API env." });
      }
      const html = renderStatementEmail({
        customerName: client.rows[0].name,
        message: body.message,
        messageHtml: body.messageHtml,
        periodFrom: body.periodFrom,
        periodTo: body.periodTo,
        statement: body.statement,
        orgName: "Fresh Finest LLC",
      });
      await sendMail({
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        html,
        text: body.message,
        attachments: body.attachment
          ? [
              {
                filename: body.attachment.filename,
                content: Buffer.from(body.attachment.data, "base64"),
                contentType: "application/pdf",
              },
            ]
          : undefined,
      });
      return { ok: true };
    },
  );

  // Renders exactly what would be sent — the compose modal's preview.
  app.post(
    "/clients/:id/statement/email/preview",
    { preHandler: app.requireAuth, bodyLimit: 1024 * 1024 },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const body = stmtContentSchema.parse(req.body);
      const client = await query<{ name: string }>(`SELECT name FROM clients WHERE id = $1`, [id]);
      if (!client.rows[0]) return reply.code(404).send({ error: "Client not found." });
      const html = renderStatementEmail({
        customerName: client.rows[0].name,
        message: body.message,
        messageHtml: body.messageHtml,
        periodFrom: body.periodFrom,
        periodTo: body.periodTo,
        statement: body.statement,
        orgName: "Fresh Finest LLC",
      });
      return { html };
    },
  );

  // ---- Customer documents (files on disk, rows in client_documents) ----

  app.get("/clients/:id/documents", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const client = await query(`SELECT id FROM clients WHERE id = $1`, [id]);
    if (!client.rows[0]) return reply.code(404).send({ error: "Client not found." });
    const { rows } = await query(
      `SELECT id, filename, mime, size_bytes, created_at
         FROM client_documents WHERE client_id = $1 ORDER BY id ASC`,
      [id],
    );
    return { documents: rows };
  });

  app.post(
    "/clients/:id/documents",
    { preHandler: app.requireAuth, bodyLimit: 16 * 1024 * 1024 },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const body = docUploadSchema.parse(req.body);
      const client = await query(`SELECT id FROM clients WHERE id = $1`, [id]);
      if (!client.rows[0]) return reply.code(404).send({ error: "Client not found." });

      const count = await query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM client_documents WHERE client_id = $1`,
        [id],
      );
      if (count.rows[0].n >= MAX_DOCS_PER_CLIENT) {
        return reply
          .code(400)
          .send({ error: `A customer can have at most ${MAX_DOCS_PER_CLIENT} documents.` });
      }

      const buf = Buffer.from(body.data, "base64");
      if (buf.length === 0) return reply.code(400).send({ error: "Empty file." });
      if (buf.length > 10 * 1024 * 1024)
        return reply.code(400).send({ error: "File is larger than 10 MB." });

      const key = saveClientDoc(buf, body.mime);
      const { rows } = await query(
        `INSERT INTO client_documents (client_id, filename, storage_key, mime, size_bytes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, filename, mime, size_bytes, created_at`,
        [id, body.filename, key, body.mime, buf.length],
      );
      return reply.code(201).send({ document: rows[0] });
    },
  );

  // Serves the bytes inline (browser previews PDFs/images, downloads the rest).
  app.get("/clients/:id/documents/:docId", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { docId } = z.object({ docId: z.coerce.number().int().positive() }).parse(req.params);
    const { rows } = await query(
      `SELECT filename, storage_key, mime FROM client_documents WHERE id = $1 AND client_id = $2`,
      [docId, id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Document not found." });
    try {
      const { buf, mime } = readClientDoc(rows[0].storage_key);
      const safeName = String(rows[0].filename).replace(/["\r\n]/g, "_");
      return reply
        .header("Content-Type", mime)
        .header("Content-Disposition", `inline; filename="${safeName}"`)
        .header("Cache-Control", "private, max-age=3600")
        .send(buf);
    } catch {
      return reply.code(404).send({ error: "Document file is no longer available." });
    }
  });

  app.delete(
    "/clients/:id/documents/:docId",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const { docId } = z.object({ docId: z.coerce.number().int().positive() }).parse(req.params);
      const { rows } = await query(
        `DELETE FROM client_documents WHERE id = $1 AND client_id = $2 RETURNING storage_key`,
        [docId, id],
      );
      if (!rows[0]) return reply.code(404).send({ error: "Document not found." });
      deleteClientDoc(rows[0].storage_key);
      return { ok: true };
    },
  );

  // Internal comments (Zoho "Comments" tab on a customer).
  app.get("/clients/:id/comments", { preHandler: app.requireAuth }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await query(
      `SELECT * FROM client_comments WHERE client_id = $1 ORDER BY created_at DESC`,
      [id],
    );
    return { comments: rows };
  });

  app.post("/clients/:id/comments", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { body } = clientCommentSchema.parse(req.body);
    const exists = await query(`SELECT 1 FROM clients WHERE id = $1`, [id]);
    if (!exists.rows[0]) return reply.code(404).send({ error: "Client not found." });
    const { rows } = await query(
      `INSERT INTO client_comments (client_id, body) VALUES ($1, $2) RETURNING *`,
      [id, body],
    );
    return reply.code(201).send({ comment: rows[0] });
  });

  app.delete("/clients/:id/comments/:cid", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { cid } = z.object({ cid: z.coerce.number().int().positive() }).parse(req.params);
    const { rowCount } = await query(
      `DELETE FROM client_comments WHERE id = $1 AND client_id = $2`,
      [cid, id],
    );
    if (!rowCount) return reply.code(404).send({ error: "Comment not found." });
    return { ok: true };
  });
};

export default clientsRoutes;
