import pg from "pg";
import { env } from "./env.js";

const isLocal = env.DATABASE_URL.includes("localhost") || env.DATABASE_URL.includes("127.0.0.1");

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never);
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Idempotent schema bootstrap — every CREATE is IF NOT EXISTS and every
 * ALTER uses ADD COLUMN IF NOT EXISTS, so it's safe to run on every boot
 * and new columns ship as plain code changes (no migration tooling).
 */
export async function initSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      name          TEXT,
      role          TEXT NOT NULL DEFAULT 'user',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS clients (
      id            BIGSERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      company       TEXT,
      email         TEXT,
      phone         TEXT,
      address_line1 TEXT,
      address_line2 TEXT,
      city          TEXT,
      postal_code   TEXT,
      country       TEXT,
      tax_id        TEXT,
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS clients_name_idx ON clients (LOWER(name));`);

  // Amounts are stored per item (quantity × unit_price); subtotal/tax/total
  // are snapshotted on the invoice at write time so historic invoices never
  // change when items are edited later.
  await query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id         BIGSERIAL PRIMARY KEY,
      number     TEXT UNIQUE,
      client_id  BIGINT NOT NULL REFERENCES clients(id),
      status     TEXT NOT NULL DEFAULT 'draft',
      issue_date DATE NOT NULL,
      due_date   DATE NOT NULL,
      currency   TEXT NOT NULL DEFAULT 'EUR',
      tax_rate   NUMERIC(5, 2) NOT NULL DEFAULT 0,
      subtotal   NUMERIC(14, 2) NOT NULL DEFAULT 0,
      tax_total  NUMERIC(14, 2) NOT NULL DEFAULT 0,
      total      NUMERIC(14, 2) NOT NULL DEFAULT 0,
      notes      TEXT,
      sent_at    TIMESTAMPTZ,
      paid_at    TIMESTAMPTZ,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices (client_id);`);
  await query(`CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status, issue_date DESC);`);

  await query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id          BIGSERIAL PRIMARY KEY,
      invoice_id  BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity    NUMERIC(12, 2) NOT NULL DEFAULT 1,
      unit_price  NUMERIC(14, 2) NOT NULL DEFAULT 0,
      amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
      position    INTEGER NOT NULL DEFAULT 0
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items (invoice_id, position);`);

  // Generic key/value app settings (runtime toggles, defaults).
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
