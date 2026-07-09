import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getUserByEmail, updateUser, updatePassword, verifyPassword } from "../lib/users.js";
import { listSessions, revokeSession, revokeOtherSessions } from "../auth/sessionStore.js";

const meRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/me", { preHandler: app.requireAuth }, async (req) => {
    return { user: req.user };
  });

  // Update own profile (name and/or password). Email is the login identity
  // and stays fixed. Re-issues the session cookie so the new name shows
  // immediately.
  const profileSchema = z.object({
    name: z.string().trim().max(120).optional(),
    password: z.string().min(8).max(200).optional().or(z.literal("")),
  });
  app.patch("/me/profile", { preHandler: app.requireAuth }, async (req, reply) => {
    const body = profileSchema.parse(req.body ?? {});
    const me = await getUserByEmail(req.user!.email);
    if (!me) return reply.code(404).send({ error: "User not found." });

    const name = body.name !== undefined ? body.name : (me.name ?? "");
    if (body.name !== undefined) await updateUser(me.id, { name: body.name || null });
    if (body.password) await updatePassword(me.id, body.password);

    const session = {
      userId: me.id,
      email: me.email,
      role: (me.role === "admin" ? "admin" : "user") as "admin" | "user",
      name: name || null,
    };
    app.setSession(reply, session, req.sessionId);
    return { ok: true, user: session };
  });

  // Change password with current-password proof; every OTHER device is
  // signed out (Settings → Security).
  const passwordSchema = z.object({
    current: z.string().min(1).max(200),
    next: z.string().min(8).max(200),
  });
  app.post("/me/password", { preHandler: app.requireAuth }, async (req, reply) => {
    const body = passwordSchema.parse(req.body ?? {});
    const me = await getUserByEmail(req.user!.email);
    if (!me) return reply.code(404).send({ error: "User not found." });
    if (!verifyPassword(body.current, me.password_hash, me.password_salt)) {
      return reply.code(400).send({ error: "Current password is incorrect." });
    }
    await updatePassword(me.id, body.next);
    await revokeOtherSessions(me.id, req.sessionId);
    return { ok: true };
  });

  /* --------------------- active sessions (this account) --------------------- */

  app.get("/me/sessions", { preHandler: app.requireAuth }, async (req) => {
    const rows = await listSessions(req.user!.userId);
    return {
      sessions: rows.map((s) => ({
        sid: s.sid,
        userAgent: s.user_agent,
        ip: s.ip,
        createdAt: s.created_at,
        lastSeenAt: s.last_seen_at,
        expiresAt: s.expires_at,
        current: s.sid === req.sessionId,
      })),
    };
  });

  app.delete("/me/sessions/:sid", { preHandler: app.requireAuth }, async (req, reply) => {
    const { sid } = req.params as { sid: string };
    if (sid === req.sessionId) {
      return reply.code(400).send({ error: "You can't revoke this device — sign out instead." });
    }
    const ok = await revokeSession(sid, req.user!.userId);
    if (!ok) return reply.code(404).send({ error: "Session not found." });
    return { ok: true };
  });
};

export default meRoutes;
