import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { query } from "../db.js";

const listQuerySchema = z.object({
  entity: z.enum(["all", "invoice", "customer", "item", "payment"]).default("all"),
  action: z.string().trim().max(40).default(""),
  actor: z.string().trim().max(200).default(""),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const activityRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // The Activity Log page — filterable, server-paged audit trail.
  app.get("/activity", { preHandler: app.requireAuth }, async (req) => {
    const qs = listQuerySchema.parse(req.query ?? {});

    const conds: string[] = ["TRUE"];
    const params: unknown[] = [];
    const add = (cond: string, value: unknown) => {
      params.push(value);
      conds.push(cond.replace("?", `$${params.length}`));
    };

    if (qs.entity !== "all") add("entity = ?", qs.entity);
    if (qs.action) add("action = ?", qs.action);
    if (qs.actor) add("actor = ?", qs.actor);
    if (qs.from) add("created_at >= ?::date", qs.from);
    if (qs.to) add("created_at < ?::date + 1", qs.to);
    if (qs.q) {
      params.push(qs.q);
      const n = params.length;
      conds.push(
        `(COALESCE(entity_label,'') ILIKE '%' || $${n} || '%'
          OR COALESCE(details,'') ILIKE '%' || $${n} || '%'
          OR COALESCE(actor,'') ILIKE '%' || $${n} || '%')`,
      );
    }

    const where = conds.join(" AND ");
    const total = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM activity_log WHERE ${where}`,
      params,
    );
    const { rows } = await query(
      `SELECT id, actor, action, entity, entity_id, entity_label, details, via_ai, created_at
         FROM activity_log
        WHERE ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, qs.pageSize, (qs.page - 1) * qs.pageSize],
    );

    // The "User" filter lists every workspace member — plus any historical
    // actor whose account is gone (their log rows outlive the user).
    const actors = await query<{ actor: string }>(
      `SELECT DISTINCT actor FROM (
         SELECT actor FROM activity_log WHERE actor IS NOT NULL
         UNION
         SELECT COALESCE(NULLIF(TRIM(name), ''), email) FROM users
       ) t ORDER BY actor ASC`,
    );

    return {
      entries: rows,
      total: total.rows[0].n,
      actors: actors.rows.map((r) => r.actor),
    };
  });
};

export default activityRoutes;
