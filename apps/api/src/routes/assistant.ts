import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { query } from "../db.js";
import { env } from "../env.js";
import { logger } from "../logger.js";

/* ------------------------------------------------------------------
 * "Claude AI" invoice assistant — a server-side proxy so the API key
 * never reaches the browser. Claude reads attached PDFs/Excel/images,
 * chats, and PROPOSES invoices & templates via tools; the human always
 * confirms before anything is created (through the normal REST routes).
 * Every call is metered into ai_usage for the Settings → AI dashboard.
 * ------------------------------------------------------------------ */

const MODELS = {
  haiku: { id: "claude-haiku-4-5", label: "Haiku 4.5", in: 1, out: 5 },
  sonnet: { id: "claude-sonnet-4-6", label: "Sonnet 4.6", in: 3, out: 15 },
  opus: { id: "claude-opus-4-8", label: "Opus 4.8", in: 5, out: 25 },
} as const;
type ModelKey = keyof typeof MODELS;

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mime: z.string().trim().max(100),
  /** base64, ≤ ~10 MB decoded */
  data: z.string().min(1).max(15_000_000),
});

const chatSchema = z.object({
  model: z.enum(["haiku", "sonnet", "opus"]).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(20_000),
        attachments: z.array(attachmentSchema).max(4).optional(),
      }),
    )
    .min(1)
    .max(40),
});

/* ---------------------------- tools ---------------------------- */

const LINE_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string", description: "Item description exactly as it should print" },
    quantity: { type: "number" },
    unitPrice: { type: "number", description: "Rate per unit in dollars" },
    unit: { type: "string", description: "e.g. pcs, box — omit if unknown" },
  },
  required: ["description", "quantity", "unitPrice"],
} as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "propose_invoices",
    description:
      "Present one or more DRAFT invoice proposals to the user as confirmable cards. " +
      "Call this whenever you have extracted or composed enough data for an invoice. " +
      "The user reviews and clicks Create — nothing is saved until they confirm. " +
      "Match customerName to the customer catalog when possible (set customerId); " +
      "set newCustomer=true when no catalog entry matches.",
    input_schema: {
      type: "object",
      properties: {
        invoices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              customerName: { type: "string" },
              customerId: { type: "integer", description: "id from the customer catalog when matched" },
              newCustomer: { type: "boolean" },
              issueDate: { type: "string", description: "YYYY-MM-DD" },
              dueDate: { type: "string", description: "YYYY-MM-DD" },
              terms: { type: "string", description: "e.g. Net 30, Due on Receipt" },
              orderNumber: { type: "string" },
              subject: { type: "string" },
              notes: { type: "string" },
              discountPct: { type: "number" },
              taxPct: { type: "number" },
              shipping: { type: "number" },
              adjustment: { type: "number" },
              templateName: {
                type: "string",
                description:
                  "Template this invoice should print with — an existing template's name " +
                  "from the catalog, or the name of a design you propose via propose_template " +
                  "in this same reply. Omit to use the account's active template.",
              },
              lines: { type: "array", items: LINE_SCHEMA, minItems: 1 },
            },
            required: ["customerName", "issueDate", "dueDate", "terms", "lines"],
          },
          minItems: 1,
        },
      },
      required: ["invoices"],
    },
  },
  {
    name: "propose_template",
    description:
      "Present a NEW invoice-template design as a confirmable card, for documents whose " +
      "look or structure none of the existing templates covers — extra columns, grouped " +
      "pricing tiers, different labels, OR a distinct visual identity (brand color, layout). " +
      "Be creative: mirror the source document's design — take the accent from its colors, " +
      "pick the layout/tableStyle/headerStyle that echo it, reuse its column wording. " +
      "The org's logo/name/address are applied to every template automatically — do not " +
      "design around them. The user reviews and clicks Save Template. Custom columns use " +
      "key 'custom:<snake_id>'; built-in keys are index, description, qty, unit, rate, amount. " +
      "Columns sharing a `group` string get a spanning header band.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Template name, e.g. 'Carton Pricing'" },
        documentTitle: { type: "string", description: "Big title on the paper, default 'Invoice'" },
        accent: { type: "string", description: "Hex accent color, e.g. #1E6B4E" },
        layout: { type: "string", enum: ["standard", "continental", "compact"] },
        tableStyle: { type: "string", enum: ["band", "zebra", "boxed", "minimal"] },
        headerStyle: { type: "string", enum: ["logo-left", "logo-right", "centered", "brand-left"] },
        defaultTerms: { type: "string", description: "Terms & conditions text printed on the paper" },
        footerNote: { type: "string" },
        columns: {
          type: "array",
          minItems: 2,
          maxItems: 14,
          items: {
            type: "object",
            properties: {
              key: {
                type: "string",
                pattern: "^(index|description|qty|unit|rate|amount|custom:[A-Za-z0-9_-]{1,40})$",
                description: "index|description|qty|unit|rate|amount, or custom:<id> for any new column",
              },
              label: { type: "string" },
              show: { type: "boolean" },
              group: { type: "string" },
              width: { type: "number" },
              tint: { type: "string", description: "hex fill for the column cells" },
              total: { type: "string", enum: ["count", "money"] },
              sumLabel: { type: "string" },
            },
            required: ["key", "label", "show"],
          },
        },
      },
      required: ["name", "columns"],
    },
  },
];

/* ------------------------- system prompt ------------------------- */

async function buildSystem(): Promise<Anthropic.TextBlockParam[]> {
  const customers = await query<{ id: number; name: string; payment_terms: string }>(
    `SELECT id, name, payment_terms FROM clients WHERE active ORDER BY name LIMIT 300`,
  );
  const items = await query<{ name: string; selling_price: string; unit: string | null }>(
    `SELECT name, selling_price::text, unit FROM items WHERE active ORDER BY name LIMIT 500`,
  );
  const tpl = await query<{ name: string }>(
    `SELECT name FROM invoice_templates ORDER BY is_active DESC, name`,
  );

  const catalog = [
    "## Customer catalog (id · name · default terms)",
    ...customers.rows.map((c) => `${c.id} · ${c.name} · ${c.payment_terms}`),
    "",
    "## Item catalog (name · rate · unit)",
    ...items.rows.map((i) => `${i.name} · $${Number(i.selling_price).toFixed(2)} · ${i.unit ?? "—"}`),
    "",
    "## Existing invoice templates",
    tpl.rows.map((t) => t.name).join(", ") || "(none)",
  ].join("\n");

  const today = new Date().toISOString().slice(0, 10);
  return [
    {
      type: "text",
      text:
        "You are the invoice assistant inside Brecx Billing, a wholesale invoicing app. " +
        "Users attach PDFs, Excel/CSV files or photos of invoices/orders and chat with you; " +
        "your job is to turn them into invoice drafts.\n\n" +
        "Rules:\n" +
        "- When you have enough data, call propose_invoices — do not paste invoice data as text.\n" +
        "- Match customers/items against the catalog below (case-insensitive, fuzzy). The catalog is " +
        "for MATCHING only — when a document prints a rate, quantity or amount, copy it verbatim, " +
        "even when it differs from the catalog rate. Use catalog rates only when the document has " +
        "none. Unmatched customer → newCustomer: true.\n" +
        "- Dates: if the document lacks an issue date use today; derive dueDate from terms.\n" +
        "- Templates: the user may give specific instructions, or just attach a file and say " +
        "'make the invoice'. Follow their instructions when given; everything they don't specify " +
        "is YOUR call — never ask which template to use. Set each proposed invoice's " +
        "templateName yourself: the existing template that best fits the document, or — when none " +
        "match its look or structure (extra columns like dual pricing tiers or units-per-box, a " +
        "distinct brand color, a different layout) — ALSO call propose_template with a creative " +
        "design that mirrors the document (accent from its colors, matching layout, tableStyle, " +
        "headerStyle, column wording) and set templateName to that new design's name. Never " +
        "silently fall back to the default look when the document clearly has its own.\n" +
        "- The org's logo, name and address are managed globally and applied to every template " +
        "automatically — never ask about them or try to reproduce them in a design.\n" +
        "- If data is ambiguous or amounts don't add up, ask a short clarifying question instead of guessing.\n" +
        "- Keep chat replies brief and plain — one or two sentences around the proposal cards.\n" +
        "- Never invent amounts. Quantities × rates must reproduce the document's totals.\n\n" +
        `Today's date: ${today}\n\n${catalog}`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

/* ----------------------- attachment handling ----------------------- */

function xlsxToCsv(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((n) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n]);
    return `--- sheet: ${n} ---\n${csv}`;
  }).join("\n\n");
}

function attachmentBlocks(
  a: z.infer<typeof attachmentSchema>,
): Anthropic.ContentBlockParam[] {
  const lower = a.name.toLowerCase();
  if (a.mime === "application/pdf" || lower.endsWith(".pdf")) {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: a.data },
        title: a.name,
      },
    ];
  }
  if (/^image\/(png|jpeg|jpg|webp|gif)$/.test(a.mime)) {
    return [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: a.mime as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
          data: a.data,
        },
      },
    ];
  }
  if (/\.(xlsx|xls)$/.test(lower) || a.mime.includes("spreadsheet") || a.mime.includes("ms-excel")) {
    const csv = xlsxToCsv(Buffer.from(a.data, "base64")).slice(0, 200_000);
    return [{ type: "text", text: `Contents of "${a.name}" (converted to CSV):\n\n${csv}` }];
  }
  // csv / txt / anything text-ish
  const text = Buffer.from(a.data, "base64").toString("utf8").slice(0, 200_000);
  return [{ type: "text", text: `Contents of "${a.name}":\n\n${text}` }];
}

/* --------------------------- usage meter --------------------------- */

function costOf(key: ModelKey, u: Anthropic.Usage): number {
  const p = MODELS[key];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return (
    (u.input_tokens * p.in +
      u.output_tokens * p.out +
      cacheRead * p.in * 0.1 +
      cacheWrite * p.in * 1.25) /
    1_000_000
  );
}

const assistantRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const configured = Boolean(env.ANTHROPIC_API_KEY);
  const client = configured ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

  async function defaultModel(): Promise<ModelKey> {
    const { rows } = await query<{ value: string | null }>(
      `SELECT value FROM app_settings WHERE key = 'ai_default_model'`,
    );
    const v = rows[0]?.value;
    return v === "sonnet" || v === "opus" ? v : "haiku";
  }

  app.get("/assistant/config", { preHandler: app.requireAuth }, async () => ({
    configured,
    defaultModel: await defaultModel(),
    models: (Object.keys(MODELS) as ModelKey[]).map((k) => ({
      key: k,
      label: MODELS[k].label,
      pricing: `$${MODELS[k].in}/$${MODELS[k].out} per M tokens`,
    })),
  }));

  app.post("/assistant/settings", { preHandler: app.requireAuth }, async (req) => {
    const { defaultModel: dm } = z
      .object({ defaultModel: z.enum(["haiku", "sonnet", "opus"]) })
      .parse(req.body);
    await query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('ai_default_model', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [dm],
    );
    return { ok: true, defaultModel: dm };
  });

  app.post(
    "/assistant/chat",
    { preHandler: app.requireAuth, bodyLimit: 64 * 1024 * 1024 },
    async (req, reply) => {
      if (!client) {
        return reply
          .code(400)
          .send({ error: "Claude isn't configured — set ANTHROPIC_API_KEY in the API env." });
      }
      const body = chatSchema.parse(req.body);
      const modelKey: ModelKey = body.model ?? (await defaultModel());

      const system = await buildSystem();
      const messages: Anthropic.MessageParam[] = body.messages.map((m) => {
        if (m.role === "assistant") return { role: "assistant", content: m.text || "…" };
        const blocks: Anthropic.ContentBlockParam[] = [];
        for (const a of m.attachments ?? []) blocks.push(...attachmentBlocks(a));
        blocks.push({ type: "text", text: m.text || "(see attachment)" });
        return { role: "user", content: blocks };
      });

      const response = await client.messages.create({
        model: MODELS[modelKey].id,
        max_tokens: 4096,
        system,
        tools: TOOLS,
        messages,
      });

      // Meter the call — the Settings → AI dashboard reads this table.
      const cost = costOf(modelKey, response.usage);
      void query(
        `INSERT INTO ai_usage (feature, model, input_tokens, output_tokens,
                               cache_read_tokens, cache_write_tokens, cost, created_by)
         VALUES ('assistant', $1, $2, $3, $4, $5, $6, $7)`,
        [
          MODELS[modelKey].label,
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.usage.cache_read_input_tokens ?? 0,
          response.usage.cache_creation_input_tokens ?? 0,
          cost,
          req.user?.name || req.user?.email || null,
        ],
      ).catch((err) => logger.error({ err }, "ai_usage insert failed"));

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const invoices: any[] = [];
      const templates: any[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use" && block.name === "propose_invoices") {
          invoices.push(...((block.input as any).invoices ?? []));
        }
        if (block.type === "tool_use" && block.name === "propose_template") {
          templates.push(block.input as any);
        }
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */

      return {
        text,
        invoices,
        templates,
        usage: { model: MODELS[modelKey].label, cost: Number(cost.toFixed(6)) },
      };
    },
  );

  /* ---- chat history (claude.ai-style Recents, scoped per user) ---- */

  const storedMsgSchema = z
    .object({ role: z.enum(["user", "assistant"]), text: z.string().max(20_000) })
    .passthrough();
  const chatBodySchema = z.object({
    title: z.string().trim().min(1).max(120).optional(),
    messages: z.array(storedMsgSchema).max(80),
  });
  const chatIdParam = z.object({ id: z.coerce.number().int().positive() });
  const whoIs = (req: { user?: { email: string } | null }) => req.user?.email ?? "";

  app.get("/assistant/chats", { preHandler: app.requireAuth }, async (req) => {
    const qs = z
      .object({
        q: z.string().trim().max(200).optional(),
        pinned: z.enum(["true", "false"]).optional(),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(100),
      })
      .parse(req.query ?? {});
    const where = `created_by = $1
        AND ($2::text = '' OR title ILIKE '%' || $2 || '%')
        AND ($3::bool = FALSE OR pinned)`;
    const params = [whoIs(req), qs.q ?? "", qs.pinned === "true"];
    const { rows } = await query(
      `SELECT id, title, pinned, updated_at FROM ai_chats
        WHERE ${where}
        ORDER BY pinned DESC, updated_at DESC LIMIT $4 OFFSET $5`,
      [...params, qs.limit, qs.offset],
    );
    const total = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ai_chats WHERE ${where}`,
      params,
    );
    return { chats: rows, total: total.rows[0].n };
  });

  // Pin / rename without touching messages (updated_at stays put so the
  // recency order isn't disturbed by a pin toggle).
  app.patch("/assistant/chats/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = chatIdParam.parse(req.params);
    const body = z
      .object({
        pinned: z.boolean().optional(),
        title: z.string().trim().min(1).max(120).optional(),
      })
      .parse(req.body);
    const { rows } = await query(
      `UPDATE ai_chats SET pinned = COALESCE($1, pinned), title = COALESCE($2, title)
        WHERE id = $3 AND created_by = $4 RETURNING id, title, pinned, updated_at`,
      [body.pinned ?? null, body.title ?? null, id, whoIs(req)],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Chat not found." });
    return { chat: rows[0] };
  });

  app.get("/assistant/chats/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = chatIdParam.parse(req.params);
    const { rows } = await query(
      `SELECT id, title, messages, updated_at FROM ai_chats WHERE id = $1 AND created_by = $2`,
      [id, whoIs(req)],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Chat not found." });
    return { chat: rows[0] };
  });

  app.post(
    "/assistant/chats",
    { preHandler: app.requireAuth, bodyLimit: 8 * 1024 * 1024 },
    async (req, reply) => {
      const body = chatBodySchema.parse(req.body);
      const { rows } = await query(
        `INSERT INTO ai_chats (title, messages, created_by)
         VALUES ($1, $2, $3) RETURNING id, title, updated_at`,
        [body.title ?? "New chat", JSON.stringify(body.messages), whoIs(req)],
      );
      return reply.code(201).send({ chat: rows[0] });
    },
  );

  app.put(
    "/assistant/chats/:id",
    { preHandler: app.requireAuth, bodyLimit: 8 * 1024 * 1024 },
    async (req, reply) => {
      const { id } = chatIdParam.parse(req.params);
      const body = chatBodySchema.parse(req.body);
      const { rows } = await query(
        `UPDATE ai_chats SET messages = $1, title = COALESCE($2, title), updated_at = NOW()
          WHERE id = $3 AND created_by = $4 RETURNING id, title, updated_at`,
        [JSON.stringify(body.messages), body.title ?? null, id, whoIs(req)],
      );
      if (!rows[0]) return reply.code(404).send({ error: "Chat not found." });
      return { chat: rows[0] };
    },
  );

  app.delete("/assistant/chats/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = chatIdParam.parse(req.params);
    const { rowCount } = await query(`DELETE FROM ai_chats WHERE id = $1 AND created_by = $2`, [
      id,
      whoIs(req),
    ]);
    if (!rowCount) return reply.code(404).send({ error: "Chat not found." });
    return { ok: true };
  });

  // Spend dashboard: daily bars + by-model table + totals for a date range.
  app.get("/assistant/usage", { preHandler: app.requireAuth }, async (req) => {
    const qs = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(req.query ?? {});
    const from = qs.from ?? "1970-01-01";
    const to = qs.to ?? "2100-12-31";

    const daily = await query(
      `SELECT created_at::date AS day, SUM(cost)::numeric(10,4) AS cost, COUNT(*)::int AS calls
         FROM ai_usage WHERE created_at::date BETWEEN $1 AND $2
        GROUP BY 1 ORDER BY 1`,
      [from, to],
    );
    const byModel = await query(
      `SELECT model, COUNT(*)::int AS calls,
              SUM(input_tokens)::bigint AS input, SUM(output_tokens)::bigint AS output,
              SUM(cache_read_tokens)::bigint AS cache_read,
              SUM(cost)::numeric(10,4) AS cost
         FROM ai_usage WHERE created_at::date BETWEEN $1 AND $2
        GROUP BY model ORDER BY SUM(cost) DESC`,
      [from, to],
    );
    const totals = await query(
      `SELECT COALESCE(SUM(cost),0)::numeric(10,4) AS cost, COUNT(*)::int AS calls,
              COALESCE(SUM(input_tokens),0)::bigint AS input,
              COALESCE(SUM(output_tokens),0)::bigint AS output
         FROM ai_usage WHERE created_at::date BETWEEN $1 AND $2`,
      [from, to],
    );
    return { daily: daily.rows, byModel: byModel.rows, totals: totals.rows[0] };
  });
};

export default assistantRoutes;
