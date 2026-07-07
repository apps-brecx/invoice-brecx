import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { signInSchema } from "@inv/shared";
import { getUserByEmail, verifyPassword, recordLogin } from "../lib/users.js";

const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/auth/sign-in", async (req, reply) => {
    const body = signInSchema.parse(req.body);
    const user = await getUserByEmail(body.email);
    if (!user || !verifyPassword(body.password, user.password_hash, user.password_salt)) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }

    await recordLogin(user.id);
    const session = {
      userId: user.id,
      email: user.email,
      role: (user.role === "admin" ? "admin" : "user") as "admin" | "user",
      name: user.name,
    };
    app.setSession(reply, session);
    return { user: session };
  });

  app.post("/auth/sign-out", async (_req, reply) => {
    app.clearSession(reply);
    return { ok: true };
  });
};

export default authRoutes;
