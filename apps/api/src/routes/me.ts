import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getUserByEmail, updateUser, updatePassword } from "../lib/users.js";

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
    app.setSession(reply, session);
    return { ok: true, user: session };
  });
};

export default meRoutes;
