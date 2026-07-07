import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { clientInputSchema } from "@inv/shared";
import { query } from "../db.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });

const clientsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/clients", { preHandler: app.requireAuth }, async (req) => {
    const { q } = z.object({ q: z.string().trim().default("") }).parse(req.query ?? {});
    const { rows } = await query(
      `SELECT c.*,
              COUNT(i.id)::int                       AS invoices_count,
              COALESCE(SUM(i.total), 0)::numeric     AS invoiced_total
         FROM clients c
         LEFT JOIN invoices i ON i.client_id = c.id AND i.status <> 'void'
        WHERE $1 = '' OR c.name ILIKE '%' || $1 || '%'
              OR c.company ILIKE '%' || $1 || '%' OR c.email ILIKE '%' || $1 || '%'
        GROUP BY c.id
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
    const { rows } = await query(
      `INSERT INTO clients (name, company, email, phone, address_line1, address_line2,
                            city, postal_code, country, tax_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        body.name, body.company || null, body.email || null, body.phone || null,
        body.addressLine1 || null, body.addressLine2 || null, body.city || null,
        body.postalCode || null, body.country || null, body.taxId || null,
        body.notes || null,
      ],
    );
    return reply.code(201).send({ client: rows[0] });
  });

  app.put("/clients/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = clientInputSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE clients SET
          name = $1, company = $2, email = $3, phone = $4,
          address_line1 = $5, address_line2 = $6, city = $7,
          postal_code = $8, country = $9, tax_id = $10, notes = $11,
          updated_at = NOW()
        WHERE id = $12
        RETURNING *`,
      [
        body.name, body.company || null, body.email || null, body.phone || null,
        body.addressLine1 || null, body.addressLine2 || null, body.city || null,
        body.postalCode || null, body.country || null, body.taxId || null,
        body.notes || null, id,
      ],
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
