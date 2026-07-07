import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  invoiceInputSchema,
  invoiceListQuerySchema,
  invoiceStatusSchema,
} from "@inv/shared";
import { pool, query } from "../db.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });

function computeTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  taxRate: number,
): { subtotal: number; taxTotal: number; total: number } {
  const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const taxTotal = (subtotal * taxRate) / 100;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    total: Math.round((subtotal + taxTotal) * 100) / 100,
  };
}

const invoicesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/invoices", { preHandler: app.requireAuth }, async (req) => {
    const q = invoiceListQuerySchema.parse(req.query ?? {});
    const params: unknown[] = [q.q, q.limit, q.offset];
    let statusCond = "TRUE";
    if (q.filter !== "all") {
      params.push(q.filter);
      statusCond = `i.status = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT i.id, i.number, i.status, i.issue_date, i.due_date, i.currency,
              i.subtotal, i.tax_total, i.total, i.created_at,
              c.id AS client_id, c.name AS client_name, c.company AS client_company
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
        WHERE ${statusCond}
          AND ($1 = '' OR i.number ILIKE '%' || $1 || '%'
               OR c.name ILIKE '%' || $1 || '%' OR c.company ILIKE '%' || $1 || '%')
        ORDER BY i.issue_date DESC, i.id DESC
        LIMIT $2 OFFSET $3`,
      params,
    );
    const stats = await query<{ status: string; n: number; sum: string }>(
      `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(total), 0)::text AS sum
         FROM invoices GROUP BY status`,
    );
    return { invoices: rows, stats: stats.rows };
  });

  app.get("/invoices/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await query(
      `SELECT i.*, c.name AS client_name, c.company AS client_company,
              c.email AS client_email, c.address_line1, c.address_line2,
              c.city, c.postal_code, c.country, c.tax_id
         FROM invoices i JOIN clients c ON c.id = i.client_id
        WHERE i.id = $1`,
      [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Invoice not found." });
    const items = await query(
      `SELECT id, description, quantity, unit_price, amount, position
         FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC`,
      [id],
    );
    return { invoice: rows[0], items: items.rows };
  });

  // Create draft invoice + items in one transaction. The invoice number is
  // derived from the row id after insert (INV-00042) so it's always unique
  // without a separate counter table.
  app.post("/invoices", { preHandler: app.requireAuth }, async (req, reply) => {
    const body = invoiceInputSchema.parse(req.body);
    const totals = computeTotals(body.items, body.taxRate);

    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const inserted = await db.query(
        `INSERT INTO invoices (client_id, issue_date, due_date, currency, tax_rate,
                               subtotal, tax_total, total, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          body.clientId, body.issueDate, body.dueDate, body.currency, body.taxRate,
          totals.subtotal, totals.taxTotal, totals.total, body.notes || null,
          req.user!.email,
        ],
      );
      const invoiceId = inserted.rows[0].id as number;
      await db.query(
        `UPDATE invoices SET number = 'INV-' || LPAD(id::text, 5, '0') WHERE id = $1`,
        [invoiceId],
      );
      for (const [pos, item] of body.items.entries()) {
        await db.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, position)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            invoiceId, item.description, item.quantity, item.unitPrice,
            Math.round(item.quantity * item.unitPrice * 100) / 100, pos,
          ],
        );
      }
      await db.query("COMMIT");
      const { rows } = await query(`SELECT * FROM invoices WHERE id = $1`, [invoiceId]);
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
    const totals = computeTotals(body.items, body.taxRate);

    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        `UPDATE invoices SET
            client_id = $1, issue_date = $2, due_date = $3, currency = $4,
            tax_rate = $5, subtotal = $6, tax_total = $7, total = $8,
            notes = $9, updated_at = NOW()
          WHERE id = $10`,
        [
          body.clientId, body.issueDate, body.dueDate, body.currency, body.taxRate,
          totals.subtotal, totals.taxTotal, totals.total, body.notes || null, id,
        ],
      );
      await db.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id]);
      for (const [pos, item] of body.items.entries()) {
        await db.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, position)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id, item.description, item.quantity, item.unitPrice,
            Math.round(item.quantity * item.unitPrice * 100) / 100, pos,
          ],
        );
      }
      await db.query("COMMIT");
      const { rows } = await query(`SELECT * FROM invoices WHERE id = $1`, [id]);
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
          sent_at = CASE WHEN $1 = 'sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
          paid_at = CASE WHEN $1 = 'paid' THEN NOW()
                         WHEN $1 <> 'paid' THEN NULL ELSE paid_at END,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [status, id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Invoice not found." });
    return { invoice: rows[0] };
  });

  app.delete("/invoices/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await query<{ status: string }>(
      `SELECT status FROM invoices WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) return reply.code(404).send({ error: "Invoice not found." });
    if (existing.rows[0].status !== "draft") {
      return reply.code(409).send({ error: "Only draft invoices can be deleted — void it instead." });
    }
    await query(`DELETE FROM invoices WHERE id = $1`, [id]);
    return { ok: true };
  });
};

export default invoicesRoutes;
