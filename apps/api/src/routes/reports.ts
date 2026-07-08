import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { query } from "../db.js";

/* ------------------------------------------------------------------
 * Reports Center — every report is one SQL aggregation, keyed by name.
 * All take ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive). "Sales" counts
 * everything that ever went out (draft/void excluded). Receivables
 * look at OPEN balances as of now, so the date range applies to the
 * invoice date.
 * ------------------------------------------------------------------ */

const paramsSchema = z.object({
  key: z.enum([
    "sales-by-customer",
    "sales-by-item",
    "ar-aging-summary",
    "ar-aging-details",
    "invoice-details",
    "customer-balance-summary",
    "bad-debts",
    "payments-received",
    "time-to-get-paid",
  ]),
});
const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Shared fragment: paid amount per invoice. */
const PAID = `COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = inv.id), 0)`;

const SQL: Record<z.infer<typeof paramsSchema>["key"], string> = {
  "sales-by-customer": `
    SELECT c.name, COUNT(*)::int AS invoice_count, SUM(inv.total) AS sales
      FROM invoices inv JOIN clients c ON c.id = inv.client_id
     WHERE inv.status NOT IN ('draft','void') AND inv.issue_date BETWEEN $1 AND $2
     GROUP BY c.name ORDER BY SUM(inv.total) DESC`,

  "sales-by-item": `
    SELECT split_part(ii.description, E'\\n', 1) AS item,
           SUM(ii.quantity) AS quantity, AVG(ii.unit_price) AS avg_rate, SUM(ii.amount) AS amount
      FROM invoice_items ii JOIN invoices inv ON inv.id = ii.invoice_id
     WHERE inv.status NOT IN ('draft','void') AND inv.issue_date BETWEEN $1 AND $2
     GROUP BY split_part(ii.description, E'\\n', 1) ORDER BY SUM(ii.amount) DESC`,

  "ar-aging-summary": `
    SELECT CASE
             WHEN inv.due_date >= CURRENT_DATE THEN 'Current'
             WHEN CURRENT_DATE - inv.due_date <= 15 THEN '1 – 15 days'
             WHEN CURRENT_DATE - inv.due_date <= 30 THEN '16 – 30 days'
             WHEN CURRENT_DATE - inv.due_date <= 45 THEN '31 – 45 days'
             ELSE 'Above 45 days'
           END AS bucket,
           COUNT(*)::int AS invoice_count, SUM(inv.total - ${PAID}) AS balance
      FROM invoices inv
     WHERE inv.status = 'sent' AND inv.total - ${PAID} > 0
       AND inv.issue_date BETWEEN $1 AND $2
     GROUP BY 1
     ORDER BY MIN(CASE
             WHEN inv.due_date >= CURRENT_DATE THEN 0
             WHEN CURRENT_DATE - inv.due_date <= 15 THEN 1
             WHEN CURRENT_DATE - inv.due_date <= 30 THEN 2
             WHEN CURRENT_DATE - inv.due_date <= 45 THEN 3 ELSE 4 END)`,

  "ar-aging-details": `
    SELECT inv.number, c.name AS customer, inv.issue_date, inv.due_date,
           GREATEST(0, CURRENT_DATE - inv.due_date)::int AS days_overdue,
           inv.total, inv.total - ${PAID} AS balance
      FROM invoices inv JOIN clients c ON c.id = inv.client_id
     WHERE inv.status = 'sent' AND inv.total - ${PAID} > 0
       AND inv.issue_date BETWEEN $1 AND $2
     ORDER BY inv.due_date ASC`,

  "invoice-details": `
    SELECT inv.number, c.name AS customer, inv.issue_date, inv.due_date, inv.status,
           inv.total, ${PAID} AS paid, inv.total - ${PAID} AS balance
      FROM invoices inv JOIN clients c ON c.id = inv.client_id
     WHERE inv.issue_date BETWEEN $1 AND $2
     ORDER BY inv.issue_date DESC, inv.id DESC`,

  "customer-balance-summary": `
    SELECT c.name, COUNT(*)::int AS open_invoices, SUM(inv.total) AS invoiced,
           SUM(${PAID}) AS received, SUM(inv.total - ${PAID}) AS balance
      FROM invoices inv JOIN clients c ON c.id = inv.client_id
     WHERE inv.status = 'sent' AND inv.total - ${PAID} > 0
       AND inv.issue_date BETWEEN $1 AND $2
     GROUP BY c.name ORDER BY SUM(inv.total - ${PAID}) DESC`,

  "bad-debts": `
    SELECT inv.number, c.name AS customer, inv.issue_date, inv.total
      FROM invoices inv JOIN clients c ON c.id = inv.client_id
     WHERE inv.status = 'void' AND inv.issue_date BETWEEN $1 AND $2
     ORDER BY inv.issue_date DESC`,

  "payments-received": `
    SELECT p.paid_on, inv.number, c.name AS customer, p.mode, p.reference, p.amount
      FROM payments p
      JOIN invoices inv ON inv.id = p.invoice_id
      JOIN clients c ON c.id = inv.client_id
     WHERE p.paid_on BETWEEN $1 AND $2
     ORDER BY p.paid_on DESC, p.id DESC`,

  "time-to-get-paid": `
    SELECT c.name, COUNT(p.id)::int AS payments,
           ROUND(AVG(p.paid_on - inv.issue_date), 1) AS avg_days, SUM(p.amount) AS received
      FROM payments p
      JOIN invoices inv ON inv.id = p.invoice_id
      JOIN clients c ON c.id = inv.client_id
     WHERE p.paid_on BETWEEN $1 AND $2
     GROUP BY c.name ORDER BY AVG(p.paid_on - inv.issue_date) DESC`,
};

const reportsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/reports/:key", { preHandler: app.requireAuth }, async (req) => {
    const { key } = paramsSchema.parse(req.params);
    const { from, to } = rangeSchema.parse(req.query ?? {});
    const { rows } = await query(SQL[key], [from, to]);
    return { rows };
  });
};

export default reportsRoutes;
