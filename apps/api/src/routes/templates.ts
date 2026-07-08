import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { templateSettingsSchema } from "@inv/shared";
import { pool, query } from "../db.js";

const idParam = z.object({ id: z.coerce.number().int().positive() });

const templateBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  settings: templateSettingsSchema,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function shape(row: any) {
  return {
    id: row.id,
    name: row.name,
    active: row.is_active,
    settings: templateSettingsSchema.parse(row.settings ?? {}),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const templatesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/templates", { preHandler: app.requireAuth }, async () => {
    const { rows } = await query(`SELECT * FROM invoice_templates ORDER BY id ASC`);
    return { templates: rows.map(shape) };
  });

  app.post("/templates", { preHandler: app.requireAuth }, async (req, reply) => {
    const body = templateBodySchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO invoice_templates (name, settings) VALUES ($1, $2) RETURNING *`,
      [body.name, JSON.stringify(body.settings)],
    );
    return reply.code(201).send({ template: shape(rows[0]) });
  });

  app.put("/templates/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = templateBodySchema.parse(req.body);
    const { rows } = await query(
      `UPDATE invoice_templates SET name = $1, settings = $2, updated_at = NOW()
        WHERE id = $3 RETURNING *`,
      [body.name, JSON.stringify(body.settings), id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Template not found." });
    return { template: shape(rows[0]) };
  });

  // Exactly one active template at a time.
  app.post("/templates/:id/activate", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const { rows } = await db.query(`SELECT id FROM invoice_templates WHERE id = $1`, [id]);
      if (!rows[0]) {
        await db.query("ROLLBACK");
        return reply.code(404).send({ error: "Template not found." });
      }
      await db.query(`UPDATE invoice_templates SET is_active = FALSE WHERE is_active`);
      await db.query(
        `UPDATE invoice_templates SET is_active = TRUE, updated_at = NOW() WHERE id = $1`,
        [id],
      );
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    } finally {
      db.release();
    }
    const { rows } = await query(`SELECT * FROM invoice_templates WHERE id = $1`, [id]);
    return { template: shape(rows[0]) };
  });

  app.delete("/templates/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await query<{ is_active: boolean; n: string }>(
      `SELECT is_active, (SELECT COUNT(*) FROM invoice_templates)::text AS n
         FROM invoice_templates WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Template not found." });
    if (rows[0].is_active) {
      return reply.code(409).send({ error: "The active template can't be deleted — activate another first." });
    }
    if (Number(rows[0].n) <= 1) {
      return reply.code(409).send({ error: "At least one template must exist." });
    }
    await query(`DELETE FROM invoice_templates WHERE id = $1`, [id]);
    return { ok: true };
  });
};

export default templatesRoutes;
