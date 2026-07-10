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
 *  the request that triggered it. */
export function logActivity(req: FastifyRequest, e: ActivityEvent): void {
  const actor = req.user?.name || req.user?.email || null;
  void query(
    `INSERT INTO activity_log (actor, action, entity, entity_id, entity_label, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actor, e.action, e.entity, e.entityId ?? null, e.entityLabel ?? null, e.details ?? null],
  ).catch((err) => logger.error({ err }, "activity_log insert failed"));
}
