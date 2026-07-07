import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  NODE_ENV: opt("NODE_ENV", "development"),
  PORT: Number(opt("PORT", "4000")),
  HOST: opt("HOST", "0.0.0.0"),
  DATABASE_URL: req("DATABASE_URL"),
  APP_ENCRYPTION_KEY: req("APP_ENCRYPTION_KEY"),
  SESSION_SECRET: opt("SESSION_SECRET") || process.env.APP_ENCRYPTION_KEY!,
  CORS_ORIGIN: opt("CORS_ORIGIN", "http://localhost:5173"),
  COOKIE_SECURE: opt("COOKIE_SECURE", "false") === "true",
  COOKIE_SAMESITE: (opt("COOKIE_SAMESITE", "lax") as "lax" | "strict" | "none"),
  ADMIN_EMAIL: opt("ADMIN_EMAIL"),
  ADMIN_PASSWORD: opt("ADMIN_PASSWORD"),

  // Public URL of the web app (used in links inside emails, once added).
  // Defaults to the first CORS origin, which is the web app in dev and prod.
  WEB_URL: opt("WEB_URL") || opt("CORS_ORIGIN", "http://localhost:5173").split(",")[0].trim(),
};

export const isProd = env.NODE_ENV === "production";
