import crypto from "node:crypto";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { query } from "../db.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import {
  listUsers,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  recordLogin,
} from "../lib/users.js";
import { revokeAllSessions, createSessionRecord } from "../auth/sessionStore.js";
import { smtpConfigured, sendMail } from "../lib/mailer.js";
import { renderInviteEmail } from "../lib/inviteEmail.js";
import { readWorkspaceSettings } from "../lib/workspace.js";

const INVITE_TTL_DAYS = 7;

interface InvitationRow {
  id: number;
  email: string;
  name: string | null;
  role: string;
  token: string;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

const inviteUrl = (token: string) => `${env.WEB_URL.replace(/\/$/, "")}/invite/${token}`;

function publicInvitation(row: InvitationRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    expired: new Date(row.expires_at).getTime() < Date.now(),
    inviteUrl: inviteUrl(row.token),
  };
}

async function sendInviteEmail(row: InvitationRow, inviterName: string): Promise<boolean> {
  if (!smtpConfigured()) return false;
  const ws = await readWorkspaceSettings();
  const { html, text } = renderInviteEmail({
    inviteeName: row.name,
    inviterName,
    role: row.role,
    orgName: ws.orgName,
    acceptUrl: inviteUrl(row.token),
    expiresAt: row.expires_at,
  });
  try {
    await sendMail({
      to: row.email,
      subject: `${inviterName} invited you to Brecx Billing`,
      html,
      text,
    });
    return true;
  } catch (err) {
    logger.error({ err }, "invite email failed");
    return false;
  }
}

const usersRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /* ------------------------- team members (admin) ------------------------- */

  app.get("/users", { preHandler: app.requireAdmin }, async () => {
    return { users: await listUsers() };
  });

  const memberSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(["admin", "user"]).optional(),
  });
  app.patch("/users/:id", { preHandler: app.requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = memberSchema.parse(req.body);
    const target = await getUserById(id);
    if (!target) return reply.code(404).send({ error: "User not found." });
    if (body.role && id === req.user!.userId && body.role !== "admin") {
      return reply.code(400).send({ error: "You can't remove your own admin access." });
    }
    await updateUser(id, { name: body.name ?? null, role: body.role ?? null });
    return { ok: true };
  });

  app.delete("/users/:id", { preHandler: app.requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (id === req.user!.userId) {
      return reply.code(400).send({ error: "You can't remove yourself from the workspace." });
    }
    const target = await getUserById(id);
    if (!target) return reply.code(404).send({ error: "User not found." });
    await revokeAllSessions(id); // kick their devices immediately
    await deleteUser(id);
    return { ok: true };
  });

  /* -------------------------- invitations (admin) -------------------------- */

  app.get("/users/invitations", { preHandler: app.requireAdmin }, async () => {
    const { rows } = await query<InvitationRow>(
      `SELECT * FROM user_invitations WHERE accepted_at IS NULL ORDER BY created_at DESC`,
    );
    return { invitations: rows.map(publicInvitation) };
  });

  const inviteSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    role: z.enum(["admin", "user"]).default("user"),
  });
  app.post("/users/invitations", { preHandler: app.requireAdmin }, async (req, reply) => {
    const body = inviteSchema.parse(req.body);
    const email = body.email.toLowerCase();

    if (await getUserByEmail(email)) {
      return reply.code(409).send({ error: "That email already belongs to a team member." });
    }
    const dup = await query(
      `SELECT 1 FROM user_invitations
        WHERE LOWER(email) = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
      [email],
    );
    if (dup.rows.length > 0) {
      return reply.code(409).send({
        error: "There's already a pending invite for that email — resend it from Pending invitations.",
      });
    }

    const token = crypto.randomBytes(24).toString("base64url");
    const { rows } = await query<InvitationRow>(
      `INSERT INTO user_invitations (email, name, role, token, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(days => ${INVITE_TTL_DAYS}))
       RETURNING *`,
      [email, body.name, body.role, token, req.user!.name || req.user!.email],
    );
    const emailed = await sendInviteEmail(rows[0], req.user!.name || req.user!.email);
    return reply.code(201).send({ invitation: publicInvitation(rows[0]), emailed });
  });

  app.post(
    "/users/invitations/:id/resend",
    { preHandler: app.requireAdmin },
    async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      const { rows } = await query<InvitationRow>(
        `UPDATE user_invitations
            SET expires_at = NOW() + make_interval(days => ${INVITE_TTL_DAYS})
          WHERE id = $1 AND accepted_at IS NULL
          RETURNING *`,
        [id],
      );
      if (!rows[0]) return reply.code(404).send({ error: "Invitation not found." });
      const emailed = await sendInviteEmail(rows[0], req.user!.name || req.user!.email);
      return { invitation: publicInvitation(rows[0]), emailed };
    },
  );

  app.delete("/users/invitations/:id", { preHandler: app.requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { rows } = await query(
      `DELETE FROM user_invitations WHERE id = $1 AND accepted_at IS NULL RETURNING id`,
      [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Invitation not found." });
    return { ok: true };
  });

  /* --------------------- accept invite (public, tokened) --------------------- */

  app.get("/invitations/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const { rows } = await query<InvitationRow>(
      `SELECT * FROM user_invitations WHERE token = $1 LIMIT 1`,
      [token],
    );
    const inv = rows[0];
    if (!inv || inv.accepted_at) {
      return reply.code(404).send({ error: "This invite link is no longer valid." });
    }
    const ws = await readWorkspaceSettings();
    return {
      invitation: {
        email: inv.email,
        name: inv.name,
        role: inv.role,
        invitedBy: inv.invited_by,
        orgName: ws.orgName,
        expiresAt: inv.expires_at,
        expired: new Date(inv.expires_at).getTime() < Date.now(),
      },
    };
  });

  const acceptSchema = z.object({
    name: z.string().trim().min(1).max(120),
    password: z.string().min(8).max(200),
  });
  app.post("/invitations/:token/accept", async (req, reply) => {
    const { token } = req.params as { token: string };
    const body = acceptSchema.parse(req.body);
    const { rows } = await query<InvitationRow>(
      `SELECT * FROM user_invitations WHERE token = $1 LIMIT 1`,
      [token],
    );
    const inv = rows[0];
    if (!inv || inv.accepted_at) {
      return reply.code(404).send({ error: "This invite link is no longer valid." });
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return reply.code(410).send({ error: "This invite has expired — ask your admin for a new one." });
    }
    if (await getUserByEmail(inv.email)) {
      return reply.code(409).send({ error: "An account with this email already exists — just sign in." });
    }

    const user = await createUser({
      email: inv.email,
      password: body.password,
      name: body.name,
      role: inv.role === "admin" ? "admin" : "user",
    });
    await query(`UPDATE user_invitations SET accepted_at = NOW() WHERE id = $1`, [inv.id]);

    // Sign them straight in — no second form.
    await recordLogin(user.id);
    const sid = await createSessionRecord(user.id, req.headers["user-agent"], req.ip);
    const session = {
      userId: user.id,
      email: user.email,
      role: (user.role === "admin" ? "admin" : "user") as "admin" | "user",
      name: user.name,
    };
    app.setSession(reply, session, sid);
    return reply.code(201).send({ user: session });
  });
};

export default usersRoutes;
