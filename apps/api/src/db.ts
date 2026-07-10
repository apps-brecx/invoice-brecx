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
  // Zoho-style active/inactive — inactive customers stay on record but are
  // visually muted; used by the customers list's bulk actions.
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;`);
  // Who touched it — shown in the customer's Record Info (Zoho-style).
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by TEXT;`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_by TEXT;`);

  // Customer documents (Zoho "Documents" on the contact form) — files live on
  // disk (lib/storage.ts), rows only keep the pointer. Max 3 per customer,
  // enforced in the route.
  await query(`
    CREATE TABLE IF NOT EXISTS client_documents (
      id          BIGSERIAL PRIMARY KEY,
      client_id   BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      filename    TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      mime        TEXT NOT NULL,
      size_bytes  BIGINT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS client_documents_client_idx ON client_documents (client_id);`,
  );
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
    "contact_persons JSONB NOT NULL DEFAULT '[]'",
  ]) {
    await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ${col};`);
  }

  // Internal comments on a customer (Zoho "Comments" tab).
  await query(`
    CREATE TABLE IF NOT EXISTS client_comments (
      id         BIGSERIAL PRIMARY KEY,
      client_id  BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

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
  // Zoho-style active/inactive flag — inactive items stay on record but are
  // hidden from the invoice form's item picker.
  await query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;`);
  // Item image: the file lives on disk (lib/storage.ts); this is just its key.
  await query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS image_key TEXT;`);
  // Who touched it — shown on the item's History tab (Zoho-style "created by").
  await query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS created_by TEXT;`);
  await query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS updated_by TEXT;`);

  // Tracked sign-ins — one row per device/browser session. The session
  // cookie carries the sid; a row that's revoked or expired kills the
  // cookie on the next request (Settings → Security → Active sessions).
  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      sid          TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_agent   TEXT,
      ip           TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL,
      revoked_at   TIMESTAMPTZ
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id);`);

  // Team invitations (Settings → Users → Invite member). The invitee gets an
  // email with a tokened link; accepting it creates their user account.
  await query(`
    CREATE TABLE IF NOT EXISTS user_invitations (
      id          BIGSERIAL PRIMARY KEY,
      email       TEXT NOT NULL,
      name        TEXT,
      role        TEXT NOT NULL DEFAULT 'user',
      token       TEXT UNIQUE NOT NULL,
      invited_by  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS user_invitations_email_idx ON user_invitations (LOWER(email));`);

  // Generic key/value app settings (runtime toggles, defaults).
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Public share links (Zoho "Share Invoice Link") — a tokened, expiring URL
  // that renders one invoice read-only without a login. Multiple live links
  // per invoice are allowed; "Disable All Active Links" revokes them.
  await query(`
    CREATE TABLE IF NOT EXISTS invoice_share_links (
      id         BIGSERIAL PRIMARY KEY,
      invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      token      TEXT UNIQUE NOT NULL,
      expires_at DATE NOT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    );
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS invoice_share_links_invoice_idx ON invoice_share_links (invoice_id);`,
  );
  // public → anyone with the link; private → viewer must verify the
  // customer's email address before the invoice loads.
  await query(
    `ALTER TABLE invoice_share_links ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';`,
  );

  // Audit trail — one row per meaningful action (create/update/delete/status
  // change/payment) on invoices, customers, items and payments. Rows are
  // append-only; the actor is denormalized so history survives user deletion.
  await query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id           BIGSERIAL PRIMARY KEY,
      actor        TEXT,
      action       TEXT NOT NULL,
      entity       TEXT NOT NULL,
      entity_id    BIGINT,
      entity_label TEXT,
      details      TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log (created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON activity_log (entity, created_at DESC);`);

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
  if (rows[0].n === 0) {
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

  await ensurePresetTemplate("Dual Pricing", DUAL_PRICING_PRESET);
}

/** Wholesale two-tier pricing paper (Special vs Adjusted columns with
 *  spanning group headers). qty/rate/amount stay bound to the Special
 *  tier so invoice math and Balance Due keep working; the Adjusted tier
 *  is typed per line into custom columns. */
const DUAL_PRICING_PRESET: Record<string, unknown> = {
  layout: "standard",
  tableStyle: "zebra",
  headerStyle: "brand-left",
  accent: "#4A4A4C",
  labelColor: "#9A9A9A",
  documentTitle: "Invoice",
  showDiscountRow: false,
  showShippingRow: false,
  hidden: ["sum:subTotal", "sum:tax", "sum:total"],
  columns: [
    { key: "index", label: "#", show: false },
    { key: "description", label: "Product Description", show: true, width: 24 },
    { key: "custom:units_per_box", label: "Units Per Box", show: true, width: 8 },
    { key: "qty", label: "Total Unit", show: true, width: 8, total: "count", sumLabel: "Total Units" },
    { key: "custom:total_box", label: "Total Box", show: true, width: 8, total: "count", sumLabel: "Total Boxes" },
    { key: "unit", label: "Unit", show: false },
    {
      key: "rate", label: "Unit Price", show: true, width: 11,
      group: "Special Pricing — Payment Completed Within 60 Days", tint: "#FAF4EA",
    },
    {
      key: "amount", label: "Total", show: true, width: 13,
      group: "Special Pricing — Payment Completed Within 60 Days", tint: "#FAF4EA",
      total: "money", sumLabel: "Special Pricing — if paid within 60 days",
    },
    {
      key: "custom:adj_rate", label: "Unit Price", show: true, width: 11,
      group: "Adjusted Pricing — Payment After 60 Days",
    },
    {
      key: "custom:adj_total", label: "Total", show: true, width: 13,
      group: "Adjusted Pricing — Payment After 60 Days",
      total: "money", sumLabel: "Adjusted Pricing — if paid after 60 days",
    },
  ],
  defaultTerms:
    "Payment terms: The Special Pricing column applies when payment is completed within 60 days of the invoice date. " +
    "If payment is received after 60 days, the Adjusted Pricing column applies.",
  footerNote: "Thanks for your business",
};

/** Ship a new gallery preset to existing installs: insert by name if
 *  missing, inheriting the active template's branding (org + logo). */
async function ensurePresetTemplate(
  name: string,
  overrides: Record<string, unknown>,
): Promise<void> {
  const existing = await query(`SELECT 1 FROM invoice_templates WHERE name = $1`, [name]);
  if (existing.rows.length > 0) return;

  const active = await query<{ settings: Record<string, unknown> | null }>(
    `SELECT settings FROM invoice_templates WHERE is_active LIMIT 1`,
  );
  const brand = active.rows[0]?.settings ?? {};
  const branding: Record<string, unknown> = {};
  for (const key of ["orgName", "orgTagline", "orgAddress", "orgPhone", "orgEmail", "logoDataUrl", "showLogo"]) {
    if (brand[key] !== undefined) branding[key] = brand[key];
  }

  const settings = templateSettingsSchema.parse({ ...branding, ...overrides });
  await query(
    `INSERT INTO invoice_templates (name, settings, is_active) VALUES ($1, $2, FALSE)`,
    [name, JSON.stringify(settings)],
  );
}
