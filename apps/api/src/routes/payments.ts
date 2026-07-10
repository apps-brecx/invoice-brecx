import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { paymentInputSchema } from "@inv/shared";
import { pool, query } from "../db.js";
import { logActivity } from "../lib/activity.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });

const paymentsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Every payment on record, newest first — the Payments page.
  app.get("/payments", { preHandler: app.requireAuth }, async () => {
    const { rows } = await query(
      `SELECT p.id, p.amount, p.paid_on, p.mode, p.reference, p.note, p.created_at,
              i.id AS invoice_id, i.number AS invoice_number, i.total AS invoice_total,
              i.currency, c.id AS client_id, c.name AS client_name
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         JOIN clients c ON c.id = i.client_id
        ORDER BY p.paid_on DESC, p.id DESC`,
    );
    return { payments: rows };
  });

  // Record a payment against an invoice. Fully-paid invoices flip to 'paid'
  // inside the same transaction; partial state stays derived from the sum.
  app.post("/invoices/:id/payments", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = paymentInputSchema.parse(req.body);

    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const inv = await db.query<{ status: string; total: string; paid: string; number: string }>(
        `SELECT i.status, i.number, i.total::text,
                COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0)::text AS paid
           FROM invoices i WHERE i.id = $1 FOR UPDATE`,
        [id],
      );
      if (!inv.rows[0]) {
        await db.query("ROLLBACK");
        return reply.code(404).send({ error: "Invoice not found." });
      }
      const { status, total, paid } = inv.rows[0];
      if (status === "draft" || status === "void") {
        await db.query("ROLLBACK");
        return reply.code(409).send({ error: "Send the invoice before recording payments." });
      }
      const balance = Math.round((Number(total) - Number(paid)) * 100) / 100;
      if (balance <= 0) {
        await db.query("ROLLBACK");
        return reply.code(409).send({ error: "Invoice is already fully paid." });
      }
      if (body.amount > balance + 0.005) {
        await db.query("ROLLBACK");
        return reply.code(409).send({ error: `Amount exceeds balance due (${balance.toFixed(2)}).` });
      }

      const inserted = await db.query(
        `INSERT INTO payments (invoice_id, amount, paid_on, mode, reference, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          id, body.amount, body.paidOn, body.mode,
          body.reference || null, body.note || null, req.user!.email,
        ],
      );
      const nowPaid = Number(paid) + body.amount;
      if (nowPaid >= Number(total) - 0.005) {
        await db.query(
          `UPDATE invoices SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [id],
        );
      }
      await db.query("COMMIT");
      logActivity(req, {
        action: "payment_recorded",
        entity: "payment",
        entityId: inserted.rows[0].id,
        entityLabel: inv.rows[0].number,
        details: `$${body.amount.toFixed(2)} via ${body.mode}${
          nowPaid >= Number(total) - 0.005 ? " — invoice fully paid" : ""
        }`,
      });
      return reply.code(201).send({ payment: inserted.rows[0] });
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    } finally {
      db.release();
    }
  });

  // Undo a mistaken payment. Re-opens the invoice if it was fully paid.
  app.delete("/payments/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const { rows } = await db.query<{ invoice_id: number; amount: string }>(
        `DELETE FROM payments WHERE id = $1 RETURNING invoice_id, amount`,
        [id],
      );
      if (!rows[0]) {
        await db.query("ROLLBACK");
        return reply.code(404).send({ error: "Payment not found." });
      }
      await db.query(
        `UPDATE invoices i SET
            status = CASE WHEN i.status = 'paid' THEN 'sent' ELSE i.status END,
            paid_at = NULL, updated_at = NOW()
          WHERE i.id = $1
            AND COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) < i.total`,
        [rows[0].invoice_id],
      );
      await db.query("COMMIT");
      const inv = await query<{ number: string }>(
        `SELECT number FROM invoices WHERE id = $1`,
        [rows[0].invoice_id],
      );
      logActivity(req, {
        action: "payment_removed",
        entity: "payment",
        entityId: id,
        entityLabel: inv.rows[0]?.number ?? null,
        details: `$${Number(rows[0].amount).toFixed(2)} removed — invoice re-opened for the amount`,
      });
      return { ok: true };
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    } finally {
      db.release();
    }
  });
};

export default paymentsRoutes;
