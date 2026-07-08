import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { clientInputSchema, type ClientInput } from "@inv/shared";
import { query } from "../db.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });

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
    const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
    const { rows } = await query(
      `UPDATE clients SET ${sets}, updated_at = NOW() WHERE id = $${values.length + 1} RETURNING *`,
      [...values, id],
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
    await query(`DELETE FROM clients WHERE id = $1`, [id]);
    return { ok: true };
  });
};

export default clientsRoutes;
