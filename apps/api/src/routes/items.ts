import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { itemInputSchema } from "@inv/shared";
import { query } from "../db.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });

const itemsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/items", { preHandler: app.requireAuth }, async (req) => {
    const { q } = z.object({ q: z.string().trim().default("") }).parse(req.query ?? {});
    const { rows } = await query(
      `SELECT * FROM items
        WHERE $1 = '' OR name ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%'
        ORDER BY LOWER(name) ASC`,
      [q],
    );
    return { items: rows };
  });

  app.post("/items", { preHandler: app.requireAuth }, async (req, reply) => {
    const body = itemInputSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO items (name, type, unit, selling_price, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [body.name, body.type, body.unit || null, body.sellingPrice, body.description || null],
    );
    return reply.code(201).send({ item: rows[0] });
  });

  app.put("/items/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = itemInputSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE items SET name = $1, type = $2, unit = $3, selling_price = $4,
              description = $5, updated_at = NOW()
        WHERE id = $6 RETURNING *`,
      [body.name, body.type, body.unit || null, body.sellingPrice, body.description || null, id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Item not found." });
    return { item: rows[0] };
  });

  app.delete("/items/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { rowCount } = await query(`DELETE FROM items WHERE id = $1`, [id]);
    if (!rowCount) return reply.code(404).send({ error: "Item not found." });
    return { ok: true };
  });
};

export default itemsRoutes;
