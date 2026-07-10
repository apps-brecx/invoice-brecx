import type { FastifyRequest } from "fastify";
import { query } from "../db.js";
import { logger } from "../logger.js";

export type ActivityEntity = "invoice" | "customer" | "item" | "payment";

export interface ActivityEvent {
  action: string;
  entity: ActivityEntity;
  entityId?: number | null;
  entityLabel?: string | null;
  details?: string | null;
}

/** Append one audit row. Fire-and-forget — a logging hiccup must never fail
 *  the request that triggered it. Requests initiated by the Claude AI
 *  assistant carry the x-brecx-source header — those rows are flagged so the
 *  Activity page shows the spark badge next to the actor's name. */
export function logActivity(req: FastifyRequest, e: ActivityEvent): void {
  const actor = req.user?.name || req.user?.email || null;
  const viaAi = req.headers["x-brecx-source"] === "claude-ai";
  void query(
    `INSERT INTO activity_log (actor, action, entity, entity_id, entity_label, details, via_ai)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actor, e.action, e.entity, e.entityId ?? null, e.entityLabel ?? null, e.details ?? null, viaAi],
  ).catch((err) => logger.error({ err }, "activity_log insert failed"));
}
