import pino from "pino";
import { isProd } from "./env.js";

// Pretty logs whenever we're attached to a real terminal (local dev), even
// if NODE_ENV=production happens to be set in .env. Render / containerised
// runs (no TTY) keep the structured JSON output that log aggregators want.
const usePretty = process.stdout.isTTY === true;

export const logger = pino(
  usePretty
    ? {
        level: isProd ? "info" : "debug",
        transport: { target: "pino-pretty", options: { colorize: true } },
      }
    : { level: "info" },
);
