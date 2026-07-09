import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SESSION_COOKIE } from "@inv/shared";
import type { SessionUser } from "@inv/shared";
import { verifySession, signSession, SESSION_MAX_AGE_SECONDS } from "./sessions.js";
import { sessionAlive } from "./sessionStore.js";
import { env } from "../env.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
    /** Tracked-session id from the cookie (null on legacy cookies). */
    sessionId: string | null;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    setSession: (reply: FastifyReply, payload: Omit<SessionUser, never>, sid?: string | null) => void;
    clearSession: (reply: FastifyReply) => void;
  }
}

async function plugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);

  app.addHook("preHandler", async (req) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const session = verifySession(token);
    if (!session) {
      req.user = null;
      req.sessionId = null;
      return;
    }
    // Tracked sessions can be revoked from Settings → Security; a dead sid
    // means the cookie no longer signs anyone in. Legacy cookies (no sid)
    // stay valid until they expire.
    if (session.sid && !(await sessionAlive(session.sid))) {
      req.user = null;
      req.sessionId = null;
      return;
    }
    const { userId, email, role, name } = session;
    req.user = { userId, email, role, name };
    req.sessionId = session.sid ?? null;
  });

  app.decorate(
    "requireAuth",
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!req.user) {
        reply.code(401).send({ error: "Login required" });
      }
    },
  );

  app.decorate(
    "requireAdmin",
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!req.user) {
        reply.code(401).send({ error: "Login required" });
        return;
      }
      if (req.user.role !== "admin") {
        reply.code(403).send({ error: "Admin access required" });
      }
    },
  );

  app.decorate("setSession", (reply: FastifyReply, payload: SessionUser, sid?: string | null): void => {
    const value = signSession(sid ? { ...payload, sid } : payload);
    reply.setCookie(SESSION_COOKIE, value, {
      path: "/",
      httpOnly: true,
      sameSite: env.COOKIE_SAMESITE,
      secure: env.COOKIE_SECURE,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  });

  app.decorate("clearSession", (reply: FastifyReply): void => {
    reply.setCookie(SESSION_COOKIE, "", {
      path: "/",
      httpOnly: true,
      sameSite: env.COOKIE_SAMESITE,
      secure: env.COOKIE_SECURE,
      maxAge: 0,
    });
  });
}

export default fp(plugin, { name: "auth" });
