import pg from "pg";
import { templateSettingsSchema } from "@inv/shared";
import { env } from "./env.js";

// Keep DATE columns as plain YYYY-MM-DD strings — the default Date parsing
// shifts days across timezones once serialized to JSON.
pg.types.setTypeParser(1082, (v) => v);

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
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Business';`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_terms TEXT NOT NULL DEFAULT 'Due on Receipt';`);
  // Zoho-parity customer profile: primary contact, phones, language,
  // portal flag, split billing/shipping addresses.
  for (const col of [
    "salutation TEXT",
    "first_name TEXT",
    "last_name TEXT",
    "mobile TEXT",
    "language TEXT NOT NULL DEFAULT 'English'",
    "currency TEXT NOT NULL DEFAULT 'USD'",
    "portal_enabled BOOLEAN NOT NULL DEFAULT FALSE",
    "billing_attention TEXT",
    "billing_state TEXT",
    "billing_phone TEXT",
    "billing_fax TEXT",
    "shipping_attention TEXT",
    "shipping_street1 TEXT",
    "shipping_street2 TEXT",
    "shipping_city TEXT",
    "shipping_state TEXT",
    "shipping_zip TEXT",
    "shipping_country TEXT",
    "shipping_phone TEXT",
    "shipping_fax TEXT",
    "website TEXT",
    "department TEXT",
    "designation TEXT",
    "twitter TEXT",
    "skype TEXT",
    "facebook TEXT",
  ]) {
    await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ${col};`);
  }

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
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS order_number TEXT;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms TEXT NOT NULL DEFAULT 'Due on Receipt';`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subject TEXT;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shipping NUMERIC(14, 2) NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS adjustment NUMERIC(14, 2) NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms_conditions TEXT;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS send_later_at DATE;`);
  await query(`ALTER TABLE invoices ALTER COLUMN currency SET DEFAULT 'USD';`);

  // Money received against invoices. paid/partial states derive from the
  // SUM of these rows, never stored on the invoice.
  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id         BIGSERIAL PRIMARY KEY,
      invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      amount     NUMERIC(14, 2) NOT NULL,
      paid_on    DATE NOT NULL,
      mode       TEXT,
      reference  TEXT,
      note       TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments (invoice_id);`);
  await query(`CREATE INDEX IF NOT EXISTS payments_paid_on_idx ON payments (paid_on DESC);`);

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
  await query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit TEXT;`);
  await query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';`);

  // Items catalog — the picker in the invoice item table. Invoice lines
  // stay free text; picking an item just prefills description + rate.
  await query(`
    CREATE TABLE IF NOT EXISTS items (
      id            BIGSERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'Goods',
      unit          TEXT,
      selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
      description   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS items_name_idx ON items (LOWER(name));`);

  // Generic key/value app settings (runtime toggles, defaults).
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Invoice templates — each row is a full TemplateSettings blob; exactly
  // one is active (used on every invoice + print).
  await query(`
    CREATE TABLE IF NOT EXISTS invoice_templates (
      id         BIGSERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      settings   JSONB NOT NULL DEFAULT '{}',
      is_active  BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await seedTemplates();
}

/** First boot: turn the legacy single-template blob (or plain defaults)
 *  into the three starter templates, Standard active. */
async function seedTemplates(): Promise<void> {
  const { rows } = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM invoice_templates`,
  );
  if (rows[0].n > 0) return;

  let base: Record<string, unknown> = {};
  const legacy = await query<{ value: string | null }>(
    `SELECT value FROM app_settings WHERE key = 'invoice_template'`,
  );
  if (legacy.rows[0]?.value) {
    try {
      base = JSON.parse(legacy.rows[0].value);
    } catch {
      base = {};
    }
  }

  const seed: Array<[string, string, boolean]> = [
    ["Standard Template", "standard", true],
    ["Continental", "continental", false],
    ["Compact", "compact", false],
  ];
  for (const [name, layout, active] of seed) {
    const settings = templateSettingsSchema.parse({ ...base, layout });
    await query(
      `INSERT INTO invoice_templates (name, settings, is_active) VALUES ($1, $2, $3)`,
      [name, JSON.stringify(settings), active],
    );
  }
}
