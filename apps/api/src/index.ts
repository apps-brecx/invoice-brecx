import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { ZodError } from "zod";

import { env } from "./env.js";
import { logger } from "./logger.js";
import { pingDatabase, initSchema } from "./db.js";
import { bootstrapAdmin } from "./lib/users.js";
import authPlugin from "./auth/plugin.js";

import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import clientsRoutes from "./routes/clients.js";
import invoicesRoutes from "./routes/invoices.js";
import paymentsRoutes from "./routes/payments.js";
import settingsRoutes from "./routes/settings.js";
import itemsRoutes from "./routes/items.js";
import templatesRoutes from "./routes/templates.js";

const app = Fastify({ logger, trustProxy: true });

await app.register(cors, {
  origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
  credentials: true,
});
await app.register(cookie, { secret: env.SESSION_SECRET });

await app.register(authPlugin);

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: "Validation failed", issues: err.issues });
  }
  logger.error({ err }, "request error");
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  return reply.code(status).send({
    error: status >= 500 ? "Internal Server Error" : err.message,
  });
});

app.get("/health", async () => ({
  ok: true,
  db: await pingDatabase(),
  ts: new Date().toISOString(),
}));
app.get("/", async () => ({ service: "invoice-brecx-api", status: "running" }));

const api: FastifyPluginAsync = async (instance: FastifyInstance) => {
  await instance.register(authRoutes);
  await instance.register(meRoutes);
  await instance.register(clientsRoutes);
  await instance.register(invoicesRoutes);
  await instance.register(paymentsRoutes);
  await instance.register(settingsRoutes);
  await instance.register(itemsRoutes);
  await instance.register(templatesRoutes);
};
await app.register(api, { prefix: "/api" });

async function main(): Promise<void> {
  await initSchema();
  await bootstrapAdmin().catch((err) => {
    logger.error({ err }, "bootstrapAdmin failed");
  });
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(`API listening on ${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    logger.info(`${sig} received, shutting down`);
    await app.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
