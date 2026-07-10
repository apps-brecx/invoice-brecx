import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  invoiceInputSchema,
  invoiceListQuerySchema,
  invoiceStatusSchema,
  type InvoiceInput,
} from "@inv/shared";
import { pool, query } from "../db.js";
import { logActivity } from "../lib/activity.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeTotals(body: InvoiceInput): {
  subtotal: number;
  taxTotal: number;
  total: number;
} {
  const subtotal = body.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const discount = (subtotal * body.discountPct) / 100;
  const taxTotal = ((subtotal - discount) * body.taxRate) / 100;
  const total = subtotal - discount + taxTotal + body.shipping + body.adjustment;
  return { subtotal: round2(subtotal), taxTotal: round2(taxTotal), total: round2(total) };
}

/** Invoice rows enriched with payments + the status the UI shows.
 *  paid/partial derive from SUM(payments); overdue from due_date. */
const ENRICHED = `
  SELECT i.*, c.name AS client_name, c.company AS client_company,
         pt.paid_total,
         (i.total - pt.paid_total)::numeric(14,2) AS balance,
         CASE
           WHEN i.status = 'draft' THEN 'draft'
           WHEN i.status = 'void' THEN 'void'
           WHEN i.status = 'paid' OR pt.paid_total >= i.total THEN 'paid'
           WHEN i.due_date < CURRENT_DATE THEN 'overdue'
           WHEN pt.paid_total > 0 THEN 'partial'
           ELSE 'due'
         END AS display_status,
         (i.due_date - CURRENT_DATE)::int AS due_in_days
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(p.amount), 0)::numeric(14,2) AS paid_total
        FROM payments p WHERE p.invoice_id = i.id
    ) pt ON TRUE
`;

const invoicesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/invoices", { preHandler: app.requireAuth }, async (req) => {
    const q = invoiceListQuerySchema.parse(req.query ?? {});
    const params: unknown[] = [q.q, q.limit, q.offset];
    let statusCond = "TRUE";
    if (q.filter !== "all") {
      params.push(q.filter);
      statusCond = `t.display_status = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT t.id, t.number, t.status, t.display_status, t.issue_date, t.due_date,
              t.due_in_days, t.order_number, t.terms, t.subject, t.currency,
              t.discount_pct, t.tax_rate, t.shipping, t.adjustment,
              t.subtotal, t.tax_total, t.total, t.paid_total, t.balance,
              t.sent_at, t.created_at, t.client_id, t.client_name, t.client_company
         FROM (${ENRICHED}) t
        WHERE ${statusCond}
          AND ($1 = '' OR t.number ILIKE '%' || $1 || '%'
               OR t.client_name ILIKE '%' || $1 || '%'
               OR COALESCE(t.order_number, '') ILIKE '%' || $1 || '%')
        ORDER BY t.issue_date DESC, t.id DESC
        LIMIT $2 OFFSET $3`,
      params,
    );

    // Zoho-style payment summary strip — always over ALL invoices.
    const summary = await query(
      `SELECT
          COALESCE(SUM(balance) FILTER (WHERE display_status IN ('due','partial','overdue')), 0)::numeric(14,2) AS outstanding,
          COALESCE(SUM(balance) FILTER (WHERE display_status IN ('due','partial') AND due_date = CURRENT_DATE), 0)::numeric(14,2) AS due_today,
          COALESCE(SUM(balance) FILTER (WHERE display_status IN ('due','partial')
                   AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30), 0)::numeric(14,2) AS due_30,
          COALESCE(SUM(balance) FILTER (WHERE display_status = 'overdue'), 0)::numeric(14,2) AS overdue,
          COUNT(*) FILTER (WHERE display_status = 'overdue')::int AS overdue_count,
          COUNT(*) FILTER (WHERE display_status IN ('due','partial','overdue'))::int AS open_count
         FROM (${ENRICHED}) t`,
    );
    const avg = await query<{ avg_days: string | null }>(
      `SELECT AVG(last_paid - issue_date)::numeric(8,1)::text AS avg_days
         FROM (
           SELECT i.issue_date, MAX(p.paid_on) AS last_paid
             FROM invoices i JOIN payments p ON p.invoice_id = i.id
            GROUP BY i.id
           HAVING COALESCE(SUM(p.amount), 0) >= i.total
         ) s`,
    );

    return {
      invoices: rows,
      summary: { ...summary.rows[0], avg_days_to_pay: avg.rows[0]?.avg_days ?? null },
    };
  });

  app.get("/invoices/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await query(
      `SELECT t.*, c.email AS client_email, c.phone AS client_phone,
              c.address_line1, c.address_line2, c.city, c.postal_code, c.country, c.tax_id,
              c.shipping_attention, c.shipping_street1, c.shipping_street2,
              c.shipping_city, c.shipping_state, c.shipping_zip, c.shipping_country
         FROM (${ENRICHED}) t JOIN clients c ON c.id = t.client_id
        WHERE t.id = $1`,
      [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Invoice not found." });
    const items = await query(
      `SELECT id, description, quantity, unit_price, amount, position, unit, extra
         FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC`,
      [id],
    );
    const payments = await query(
      `SELECT id, amount, paid_on, mode, reference, note, created_at
         FROM payments WHERE invoice_id = $1 ORDER BY paid_on DESC, id DESC`,
      [id],
    );
    return { invoice: rows[0], items: items.rows, payments: payments.rows };
  });

  // Create draft invoice + items in one transaction. The invoice number is
  // derived from the row id after insert (INV-00042) so it's always unique
  // without a separate counter table.
  app.post("/invoices", { preHandler: app.requireAuth }, async (req, reply) => {
    const body = invoiceInputSchema.parse(req.body);
    const totals = computeTotals(body);

    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const inserted = await db.query(
        `INSERT INTO invoices (client_id, order_number, issue_date, due_date, terms,
                               subject, currency, tax_rate, discount_pct, shipping,
                               adjustment, subtotal, tax_total, total, notes,
                               terms_conditions, send_later_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id`,
        [
          body.clientId, body.orderNumber || null, body.issueDate, body.dueDate,
          body.terms, body.subject || null, body.currency, body.taxRate,
          body.discountPct, body.shipping, body.adjustment,
          totals.subtotal, totals.taxTotal, totals.total,
          body.notes || null, body.termsConditions || null,
          body.sendLaterAt || null, req.user!.email,
        ],
      );
      const invoiceId = inserted.rows[0].id as number;
      await db.query(
        `UPDATE invoices SET number = 'INV-' || LPAD(id::text, 5, '0') WHERE id = $1`,
        [invoiceId],
      );
      for (const [pos, item] of body.items.entries()) {
        await db.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, position, unit, extra)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            invoiceId, item.description, item.quantity, item.unitPrice,
            round2(item.quantity * item.unitPrice), pos, item.unit || null,
            JSON.stringify(item.extra ?? {}),
          ],
        );
      }
      await db.query("COMMIT");
      const { rows } = await query(`SELECT * FROM (${ENRICHED}) t WHERE t.id = $1`, [invoiceId]);
      logActivity(req, {
        action: "created",
        entity: "invoice",
        entityId: invoiceId,
        entityLabel: rows[0].number,
        details: `Draft for ${rows[0].client_name} · total $${Number(rows[0].total).toFixed(2)}`,
      });
      return reply.code(201).send({ invoice: rows[0] });
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    } finally {
      db.release();
    }
  });

  // Replace items / dates / notes of a draft. Sent+ invoices are immutable
  // apart from their status — void and re-issue instead.
  app.put("/invoices/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = invoiceInputSchema.parse(req.body);
    const existing = await query<{ status: string }>(
      `SELECT status FROM invoices WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) return reply.code(404).send({ error: "Invoice not found." });
    if (existing.rows[0].status !== "draft") {
      return reply.code(409).send({ error: "Only draft invoices can be edited." });
    }
    const totals = computeTotals(body);

    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        `UPDATE invoices SET
            client_id = $1, order_number = $2, issue_date = $3, due_date = $4,
            terms = $5, subject = $6, currency = $7, tax_rate = $8,
            discount_pct = $9, shipping = $10, adjustment = $11,
            subtotal = $12, tax_total = $13, total = $14, notes = $15,
            terms_conditions = $16, send_later_at = $17, updated_at = NOW()
          WHERE id = $18`,
        [
          body.clientId, body.orderNumber || null, body.issueDate, body.dueDate,
          body.terms, body.subject || null, body.currency, body.taxRate,
          body.discountPct, body.shipping, body.adjustment,
          totals.subtotal, totals.taxTotal, totals.total,
          body.notes || null, body.termsConditions || null,
          body.sendLaterAt || null, id,
        ],
      );
      await db.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id]);
      for (const [pos, item] of body.items.entries()) {
        await db.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, position, unit, extra)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id, item.description, item.quantity, item.unitPrice,
            round2(item.quantity * item.unitPrice), pos, item.unit || null,
            JSON.stringify(item.extra ?? {}),
          ],
        );
      }
      await db.query("COMMIT");
      const { rows } = await query(`SELECT * FROM (${ENRICHED}) t WHERE t.id = $1`, [id]);
      logActivity(req, {
        action: "updated",
        entity: "invoice",
        entityId: id,
        entityLabel: rows[0].number,
        details: `Draft edited for ${rows[0].client_name} · total $${Number(rows[0].total).toFixed(2)}`,
      });
      return { invoice: rows[0] };
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    } finally {
      db.release();
    }
  });

  app.patch("/invoices/:id/status", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { status } = invoiceStatusSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE invoices SET
          status = $1,
          send_later_at = CASE WHEN $1 = 'sent' THEN NULL ELSE send_later_at END,
          sent_at = CASE WHEN $1 = 'sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
          paid_at = CASE WHEN $1 = 'paid' THEN NOW()
                         WHEN $1 <> 'paid' THEN NULL ELSE paid_at END,
          updated_at = NOW()
        WHERE id = $2
        RETURNING id`,
      [status, id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Invoice not found." });
    const enriched = await query(`SELECT * FROM (${ENRICHED}) t WHERE t.id = $1`, [id]);
    logActivity(req, {
      action:
        status === "sent" ? "marked_sent" : status === "void" ? "voided" : "status_changed",
      entity: "invoice",
      entityId: id,
      entityLabel: enriched.rows[0].number,
      details:
        status === "sent"
          ? `Sent to ${enriched.rows[0].client_name}`
          : `Status changed to ${status}`,
    });
    return { invoice: enriched.rows[0] };
  });

  app.delete("/invoices/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await query<{ status: string; number: string }>(
      `SELECT status, number FROM invoices WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) return reply.code(404).send({ error: "Invoice not found." });
    if (existing.rows[0].status !== "draft") {
      return reply.code(409).send({ error: "Only draft invoices can be deleted — void it instead." });
    }
    await query(`DELETE FROM invoices WHERE id = $1`, [id]);
    logActivity(req, {
      action: "deleted",
      entity: "invoice",
      entityId: id,
      entityLabel: existing.rows[0].number,
      details: "Draft deleted",
    });
    return { ok: true };
  });
};

export default invoicesRoutes;
export { ENRICHED };
