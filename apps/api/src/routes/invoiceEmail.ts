import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { query } from "../db.js";
import { env } from "../env.js";
import { logActivity } from "../lib/activity.js";
import { renderInvoiceEmail } from "../lib/invoiceEmail.js";
import { smtpConfigured, sendMail } from "../lib/mailer.js";
import { ENRICHED, resolveTemplate } from "./invoices.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });

const contentSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  messageHtml: z.string().max(30000).optional().default(""),
  /** Web origin for the VIEW INVOICE link — must be an allowed CORS origin. */
  origin: z.string().trim().max(200).optional().default(""),
});

const emailSchema = contentSchema.extend({
  to: z.string().trim().min(3).max(500),
  cc: z.string().trim().max(500).optional().default(""),
  bcc: z.string().trim().max(500).optional().default(""),
  subject: z.string().trim().min(1).max(300),
  /** Invoice PDF, generated client-side (base64, ≤ ~10 MB). */
  attachment: z
    .object({
      filename: z.string().trim().min(1).max(200),
      data: z.string().min(1).max(15_000_000),
    })
    .optional(),
});

interface InvoiceRow {
  id: number;
  number: string;
  client_id: number;
  client_name: string;
  status: string;
  issue_date: string;
  due_date: string;
  total: string;
  template_id: number | null;
}

/** Zoho-style "Send Email" for a single invoice, over the configured SMTP. */
const invoiceEmailRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  async function loadInvoice(id: number): Promise<InvoiceRow | null> {
    const { rows } = await query<InvoiceRow>(
      `SELECT t.id, t.number, t.client_id, t.client_name, t.status,
              t.issue_date, t.due_date, t.total::text AS total, t.template_id
         FROM (${ENRICHED}) t WHERE t.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** The button link only ever points at one of our own origins. */
  function safeOrigin(requested: string): string {
    const allowed = env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
    return allowed.includes(requested) ? requested : allowed[0];
  }

  function render(
    inv: InvoiceRow,
    body: z.infer<typeof contentSchema>,
    viewUrl: string | null,
    orgName: string,
  ): string {
    return renderInvoiceEmail({
      invoiceNumber: inv.number,
      customerName: inv.client_name,
      amount: Number(inv.total),
      invoiceDate: inv.issue_date,
      dueDate: inv.due_date,
      viewUrl,
      message: body.message,
      messageHtml: body.messageHtml,
      orgName,
    });
  }

  /** Email branding follows the invoice's template (fallback: active). */
  async function orgName(inv: InvoiceRow): Promise<string> {
    const tpl = (await resolveTemplate(inv.template_id ?? null)) as { orgName?: string };
    return tpl.orgName || "Fresh Finest";
  }

  // Renders exactly what would be sent — the compose modal's preview.
  app.post(
    "/invoices/:id/email/preview",
    { preHandler: app.requireAuth, bodyLimit: 1024 * 1024 },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const body = contentSchema.parse(req.body);
      const inv = await loadInvoice(id);
      if (!inv) return reply.code(404).send({ error: "Invoice not found." });
      // The real link is only minted on send — the preview shows the button.
      const html = render(inv, body, "#", await orgName(inv));
      return { html };
    },
  );

  app.post(
    "/invoices/:id/email",
    { preHandler: app.requireAuth, bodyLimit: 16 * 1024 * 1024 },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const body = emailSchema.parse(req.body);
      const inv = await loadInvoice(id);
      if (!inv) return reply.code(404).send({ error: "Invoice not found." });
      if (!smtpConfigured()) {
        return reply
          .code(400)
          .send({ error: "Email isn't configured — set SMTP_* in the API env." });
      }

      // A public share link backs the email's VIEW INVOICE button —
      // expires 90 days after the due date (or 90 days out, if already past).
      const token = randomBytes(32).toString("hex");
      const dueMs = new Date(`${inv.due_date}T00:00:00`).getTime();
      const expires = new Date(Math.max(dueMs, Date.now()) + 90 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await query(
        `INSERT INTO invoice_share_links (invoice_id, token, expires_at, visibility, created_by)
         VALUES ($1, $2, $3, 'public', $4)`,
        [id, token, expires, req.user?.name || req.user?.email || null],
      );
      const viewUrl = `${safeOrigin(body.origin)}/share/${token}`;

      const html = render(inv, body, viewUrl, await orgName(inv));
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

      // Drafts flip to sent — same effect as "Mark As Sent".
      await query(
        `UPDATE invoices SET
            status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
            sent_at = COALESCE(sent_at, NOW()), send_later_at = NULL, updated_at = NOW()
          WHERE id = $1`,
        [id],
      );
      logActivity(req, {
        action: "emailed",
        entity: "invoice",
        entityId: id,
        entityLabel: inv.number,
        details: `Emailed to ${body.to}${body.attachment ? " · PDF attached" : ""}`,
      });
      return { ok: true };
    },
  );
};

export default invoiceEmailRoutes;
