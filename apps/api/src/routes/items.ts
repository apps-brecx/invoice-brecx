import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { itemInputSchema } from "@inv/shared";
import { query } from "../db.js";
import { IMAGE_MIMES, saveItemImage, readItemImage, deleteItemImage } from "../lib/storage.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** Upload payload: base64 (no data-URL prefix) + declared mime. ~5 MB image
 *  max — the route's bodyLimit below allows for base64's +33% overhead. */
const imageUploadSchema = z.object({
  mime: z.string().refine((m) => m in IMAGE_MIMES, "Unsupported image type"),
  data: z.string().min(1).max(7_500_000),
});

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
    const by = req.user?.name || req.user?.email || null;
    const { rows } = await query(
      `INSERT INTO items (name, type, unit, selling_price, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [body.name, body.type, body.unit || null, body.sellingPrice, body.description || null, by],
    );
    return reply.code(201).send({ item: rows[0] });
  });

  app.put("/items/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = itemInputSchema.parse(req.body);
    const by = req.user?.name || req.user?.email || null;
    const { rows } = await query(
      `UPDATE items SET name = $1, type = $2, unit = $3, selling_price = $4,
              description = $5, updated_at = NOW(), updated_by = $6
        WHERE id = $7 RETURNING *`,
      [body.name, body.type, body.unit || null, body.sellingPrice, body.description || null, by, id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Item not found." });
    return { item: rows[0] };
  });

  app.delete("/items/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await query(`DELETE FROM items WHERE id = $1 RETURNING image_key`, [id]);
    if (!rows[0]) return reply.code(404).send({ error: "Item not found." });
    deleteItemImage(rows[0].image_key);
    return { ok: true };
  });

  // ---- Item image (file on disk, key in DB — see lib/storage.ts) ----

  app.post(
    "/items/:id/image",
    { preHandler: app.requireAuth, bodyLimit: 8 * 1024 * 1024 },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const body = imageUploadSchema.parse(req.body);
      const buf = Buffer.from(body.data, "base64");
      if (buf.length === 0) return reply.code(400).send({ error: "Empty image." });
      if (buf.length > 5 * 1024 * 1024)
        return reply.code(400).send({ error: "Image is larger than 5 MB." });

      const existing = await query(`SELECT image_key FROM items WHERE id = $1`, [id]);
      if (!existing.rows[0]) return reply.code(404).send({ error: "Item not found." });

      const key = saveItemImage(buf, body.mime);
      const by = req.user?.name || req.user?.email || null;
      const { rows } = await query(
        `UPDATE items SET image_key = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3 RETURNING *`,
        [key, by, id],
      );
      deleteItemImage(existing.rows[0].image_key); // replaced — drop the old file
      return { item: rows[0] };
    },
  );

  app.delete("/items/:id/image", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await query(`SELECT image_key FROM items WHERE id = $1`, [id]);
    if (!existing.rows[0]) return reply.code(404).send({ error: "Item not found." });
    const by = req.user?.name || req.user?.email || null;
    const { rows } = await query(
      `UPDATE items SET image_key = NULL, updated_at = NOW(), updated_by = $1 WHERE id = $2 RETURNING *`,
      [by, id],
    );
    deleteItemImage(existing.rows[0].image_key);
    return { item: rows[0] };
  });

  // Serves the bytes. The web app busts caches by appending ?k=<image_key>,
  // so a long client cache is safe — a new upload gets a new key.
  app.get("/items/:id/image", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await query(`SELECT image_key FROM items WHERE id = $1`, [id]);
    if (!rows[0]?.image_key) return reply.code(404).send({ error: "No image." });
    try {
      const { buf, mime } = readItemImage(rows[0].image_key);
      return reply
        .header("Content-Type", mime)
        .header("Cache-Control", "private, max-age=31536000, immutable")
        .send(buf);
    } catch {
      return reply.code(404).send({ error: "Image file missing." });
    }
  });

  // Mark as Active / Inactive (Zoho-style) — inactive items are kept but
  // hidden from the invoice form's picker.
  app.patch("/items/:id/active", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const by = req.user?.name || req.user?.email || null;
    const { rows } = await query(
      `UPDATE items SET active = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3 RETURNING *`,
      [active, by, id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Item not found." });
    return { item: rows[0] };
  });

  // Invoices that used this item. Lines are stored as free text (picking an
  // item prefills the description), so match on the description's first line.
  app.get("/items/:id/transactions", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const item = await query(`SELECT name FROM items WHERE id = $1`, [id]);
    if (!item.rows[0]) return reply.code(404).send({ error: "Item not found." });
    const { rows } = await query(
      `SELECT DISTINCT inv.id, inv.number, inv.status, inv.issue_date, inv.due_date,
              inv.total, c.name AS customer_name,
              ii.quantity, ii.unit_price, ii.amount
         FROM invoices inv
         JOIN invoice_items ii ON ii.invoice_id = inv.id
         JOIN clients c ON c.id = inv.client_id
        WHERE ii.description ILIKE split_part($1, E'\\n', 1) || '%'
        ORDER BY inv.issue_date DESC, inv.id DESC`,
      [item.rows[0].name],
    );
    return { transactions: rows };
  });
};

export default itemsRoutes;
