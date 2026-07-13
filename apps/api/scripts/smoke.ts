/* End-to-end smoke test against a RUNNING api (pnpm --filter @inv/api dev).
 * Creates a temp user + temp data over the real HTTP API, verifies the whole
 * invoice lifecycle, then deletes everything it created.
 *
 * Run from apps/api:  pnpm exec tsx scripts/smoke.ts
 */
import { query, pool } from "../src/db.js";
import { createUser } from "../src/lib/users.js";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:4000";
const EMAIL = `smoke-${Date.now()}@test.local`;
const PASSWORD = "smoke-test-password-1";

let cookie = "";
let failures = 0;

function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}`, extra ?? "");
  }
}

async function http(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function main() {
  console.log("smoke: health");
  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  check("api up, db reachable", health.ok === true && health.db === true, health);

  console.log("smoke: auth");
  await createUser({ email: EMAIL, password: PASSWORD, name: "Smoke", role: "user" });
  const denied = await http("GET", "/invoices");
  check("unauthenticated request rejected", denied.status === 401);
  const login = await http("POST", "/auth/sign-in", { email: EMAIL, password: PASSWORD });
  check("sign-in", login.status === 200 && Boolean(cookie), login.data);

  console.log("smoke: clients");
  const created = await http("POST", "/clients", {
    name: "Smoke Test Co",
    type: "Business",
    salutation: "Mr.",
    firstName: "Smoke",
    lastName: "Tester",
    company: "Smoke Test Co",
    paymentTerms: "Due end of the month",
    email: "ap@smoke.test",
    phone: "+880 555-0200",
    mobile: "+1 555-0100",
    website: "www.smoke.test",
    department: "Purchasing",
    designation: "Buyer",
    twitter: "smoketest",
    skype: "smoke.test",
    facebook: "smoketestco",
    language: "English",
    portalEnabled: true,
    billingAttention: "Accounts",
    addressLine1: "1 Test St",
    city: "Testville",
    state: "TS",
    postalCode: "00000",
    country: "U.S.A",
    shippingAttention: "Warehouse",
    shippingStreet1: "2 Dock Rd",
    shippingCity: "Testville",
    notes: "internal remark",
  });
  check("create client", created.status === 201, created.data);
  const clientId = created.data.client.id as number;
  const clients = await http("GET", "/clients?q=Smoke Test Co");
  check("client listed with stats fields", clients.data.clients.some(
    (c: { id: number; lifetime_paid: unknown }) => c.id === clientId && c.lifetime_paid !== undefined,
  ));
  const full = clients.data.clients.find((c: { id: number }) => c.id === clientId);
  check(
    "zoho-parity fields persisted",
    full.first_name === "Smoke" && full.mobile === "+1 555-0100" &&
      full.phone === "+880 555-0200" && full.portal_enabled === true &&
      full.shipping_city === "Testville" && full.billing_state === "TS" &&
      full.language === "English" && full.payment_terms === "Due end of the month" &&
      full.website === "www.smoke.test" && full.designation === "Buyer" &&
      full.skype === "smoke.test",
    full,
  );

  console.log("smoke: invoice lifecycle");
  const inv = await http("POST", "/invoices", {
    clientId,
    orderNumber: "PO-SMOKE-1",
    issueDate: "2026-07-01",
    dueDate: "2026-07-31",
    terms: "Net 30",
    subject: "Smoke test order",
    currency: "USD",
    taxRate: 10,
    discountPct: 5,
    shipping: 20,
    adjustment: -5,
    notes: "note",
    termsConditions: "t&c",
    items: [
      { description: "Widget A", quantity: 2, unitPrice: 100, unit: "box", extra: { "custom:sku": "SY-5505" } },
      { description: "Widget B", quantity: 1, unitPrice: 50 },
    ],
  });
  check("create invoice", inv.status === 201, inv.data);
  const invoiceId = inv.data.invoice.id as number;
  const withItems = await http("GET", `/invoices/${invoiceId}`);
  check(
    "line unit round-trips",
    withItems.data.items[0].unit === "box" && withItems.data.items[1].unit === null,
    withItems.data.items,
  );
  check(
    "custom column value round-trips",
    withItems.data.items[0].extra?.["custom:sku"] === "SY-5505",
    withItems.data.items[0].extra,
  );
  // sub=250, disc=12.5, tax=23.75, total=250-12.5+23.75+20-5=276.25
  check("totals computed (276.25)", Number(inv.data.invoice.total) === 276.25, inv.data.invoice.total);
  check("draft display status", inv.data.invoice.display_status === "draft");
  check("number assigned", /^INV-\d{5}$/.test(inv.data.invoice.number), inv.data.invoice.number);

  const payTooEarly = await http("POST", `/invoices/${invoiceId}/payments`, {
    amount: 10,
    paidOn: "2026-07-05",
    mode: "Cash",
  });
  check("payment on draft rejected", payTooEarly.status === 409);

  const scheduled = await http("PUT", `/invoices/${invoiceId}`, {
    ...JSON.parse(JSON.stringify({
      clientId, orderNumber: "PO-SMOKE-1", issueDate: "2026-07-01", dueDate: "2026-07-31",
      terms: "Net 30", subject: "Smoke test order", currency: "USD", taxRate: 10,
      discountPct: 5, shipping: 20, adjustment: -5, notes: "note", termsConditions: "t&c",
      sendLaterAt: "2026-07-15",
      items: [
        { description: "Widget A", quantity: 2, unitPrice: 100 },
        { description: "Widget B", quantity: 1, unitPrice: 50 },
      ],
    })),
  });
  check(
    "send-later date stored",
    String(scheduled.data.invoice.send_later_at).slice(0, 10) === "2026-07-15",
    scheduled.data.invoice.send_later_at,
  );

  const sent = await http("PATCH", `/invoices/${invoiceId}/status`, { status: "sent" });
  check("mark sent → display due", sent.data.invoice.display_status === "due", sent.data.invoice);
  check("send-later cleared on send", sent.data.invoice.send_later_at === null);

  const pay1 = await http("POST", `/invoices/${invoiceId}/payments`, {
    amount: 100,
    paidOn: "2026-07-05",
    mode: "Bank Transfer",
    reference: "wire-1",
  });
  check("partial payment recorded", pay1.status === 201, pay1.data);
  const afterPartial = await http("GET", `/invoices/${invoiceId}`);
  check(
    "partial status + balance 176.25",
    afterPartial.data.invoice.display_status === "partial" &&
      Number(afterPartial.data.invoice.balance) === 176.25,
    afterPartial.data.invoice,
  );

  const overpay = await http("POST", `/invoices/${invoiceId}/payments`, {
    amount: 999,
    paidOn: "2026-07-06",
    mode: "Cash",
  });
  check("overpayment rejected", overpay.status === 409);

  const pay2 = await http("POST", `/invoices/${invoiceId}/payments`, {
    amount: 176.25,
    paidOn: "2026-07-06",
    mode: "Card",
  });
  check("final payment recorded", pay2.status === 201);
  const afterPaid = await http("GET", `/invoices/${invoiceId}`);
  check("paid status, zero balance",
    afterPaid.data.invoice.display_status === "paid" && Number(afterPaid.data.invoice.balance) === 0,
    afterPaid.data.invoice,
  );

  const editPaid = await http("PUT", `/invoices/${invoiceId}`, {
    clientId, issueDate: "2026-07-01", dueDate: "2026-07-31",
    items: [{ description: "X", quantity: 1, unitPrice: 1 }],
  });
  check("editing a sent/paid invoice rejected", editPaid.status === 409);

  const list = await http("GET", "/invoices?q=PO-SMOKE-1");
  check("list finds by order number", list.data.invoices.length === 1);
  check("summary present", list.data.summary && list.data.summary.outstanding !== undefined);

  console.log("smoke: payments list + undo");
  const payments = await http("GET", "/payments");
  const ours = payments.data.payments.filter(
    (p: { invoice_id: number }) => p.invoice_id === invoiceId,
  );
  check("payments listed", ours.length === 2, ours.length);
  const undo = await http("DELETE", `/payments/${ours[0].id}`);
  check("payment undo", undo.status === 200);
  const afterUndo = await http("GET", `/invoices/${invoiceId}`);
  check("invoice re-opened after undo", afterUndo.data.invoice.display_status === "partial",
    afterUndo.data.invoice.display_status);

  console.log("smoke: items catalog");
  const item = await http("POST", "/items", {
    name: "Smoke Widget",
    type: "Goods",
    unit: "box",
    sellingPrice: 18.3,
    description: "SKU: SMK-1",
  });
  check("create item", item.status === 201 && Number(item.data.item.selling_price) === 18.3, item.data);
  const itemId = item.data.item.id as number;
  const itemList = await http("GET", "/items?q=Smoke Widget");
  check("item searchable", itemList.data.items.some((i: { id: number }) => i.id === itemId));
  const itemUpd = await http("PUT", `/items/${itemId}`, {
    name: "Smoke Widget XL",
    type: "Goods",
    unit: "box",
    sellingPrice: 20,
  });
  check("item update", Number(itemUpd.data.item.selling_price) === 20);
  const itemDel = await http("DELETE", `/items/${itemId}`);
  check("item delete", itemDel.status === 200);

  console.log("smoke: payment terms");
  const termsList = await http("GET", "/settings/payment-terms");
  check(
    "built-in terms listed",
    termsList.data.terms.some((t: { name: string }) => t.name === "Due end of the month"),
  );
  const termName = `Net 7 smoke ${Date.now() % 100000}`;
  const termNew = await http("POST", "/settings/payment-terms", { name: termName, days: 7 });
  check(
    "custom term created",
    termNew.status === 201 &&
      termNew.data.terms.some((t: { name: string; days: number }) => t.name === termName && t.days === 7),
    termNew.data,
  );
  const termDup = await http("POST", "/settings/payment-terms", { name: termName, days: 9 });
  check("duplicate term rejected", termDup.status === 409);

  console.log("smoke: template gallery");
  const gal = await http("GET", "/templates");
  check(
    "seeded templates present (3+, one active)",
    gal.data.templates.length >= 3 &&
      gal.data.templates.filter((t: { active: boolean }) => t.active).length === 1,
    gal.data.templates.length,
  );
  const activeBefore = gal.data.templates.find((t: { active: boolean }) => t.active);
  check(
    "template has labels + columns config",
    activeBefore.settings.labels?.billTo === "Bill To" &&
      Array.isArray(activeBefore.settings.columns) &&
      activeBefore.settings.columns.some((c: { key: string }) => c.key === "unit"),
    activeBefore.settings.labels,
  );
  check(
    "template has layout blocks (required present)",
    Array.isArray(activeBefore.settings.blocks) &&
      ["titleMeta", "itemTable", "totals"].every((k: string) =>
        activeBefore.settings.blocks.some((b: { key: string }) => b.key === k),
      ),
    activeBefore.settings.blocks?.length,
  );
  const styledBlocks = activeBefore.settings.blocks.map((b: { key: string }) =>
    b.key === "header" ? { ...b, pad: 20, bg: "#f4f4f4", align: "center" } : b,
  );
  const customCol = { key: "custom:smk1", label: "SKU", show: true };
  const blockTpl = await http("POST", "/templates", {
    name: "Smoke Blocks Tpl",
    settings: { ...activeBefore.settings, blocks: styledBlocks, columns: [...activeBefore.settings.columns, customCol] },
  });
  check(
    "block styles + custom column persist",
    blockTpl.status === 201 &&
      blockTpl.data.template.settings.blocks.find((b: { key: string }) => b.key === "header").pad === 20 &&
      blockTpl.data.template.settings.columns.some((c: { key: string }) => c.key === "custom:smk1"),
    blockTpl.data,
  );
  await http("DELETE", `/templates/${blockTpl.data.template.id}`);
  const tplCreated = await http("POST", "/templates", {
    name: "Smoke Custom Tpl",
    settings: {
      ...activeBefore.settings,
      accent: "#ff0000",
      tableStyle: "boxed",
      labels: { ...activeBefore.settings.labels, billTo: "Sold To" },
      columns: activeBefore.settings.columns.map((c: { key: string }) =>
        c.key === "unit" ? { ...c, show: true, label: "U of M" } : c,
      ),
    },
  });
  check("template created (inactive)", tplCreated.status === 201 && tplCreated.data.template.active === false);
  const newId = tplCreated.data.template.id as number;
  const renamed = await http("PUT", `/templates/${newId}`, {
    name: "Smoke Custom Tpl v2",
    settings: tplCreated.data.template.settings,
  });
  check("template renamed", renamed.data.template.name === "Smoke Custom Tpl v2");
  const activated = await http("POST", `/templates/${newId}/activate`);
  check("template activated", activated.data.template.active === true);
  const activeTpl = await http("GET", "/settings/template");
  check("active settings served", activeTpl.data.template.accent === "#ff0000");
  check(
    "custom labels + columns persisted",
    activeTpl.data.template.labels.billTo === "Sold To" &&
      activeTpl.data.template.tableStyle === "boxed" &&
      activeTpl.data.template.columns.find((c: { key: string }) => c.key === "unit").label === "U of M",
    activeTpl.data.template.labels,
  );
  const delActive = await http("DELETE", `/templates/${newId}`);
  check("active template delete rejected", delActive.status === 409);
  await http("POST", `/templates/${activeBefore.id}/activate`); // restore
  const delOk = await http("DELETE", `/templates/${newId}`);
  check("inactive template deleted", delOk.status === 200);

  console.log("smoke: per-invoice template");
  const pinTpl = await http("POST", "/templates", {
    name: "Smoke Pin Tpl",
    settings: { ...activeBefore.settings, accent: "#0000ff" },
  });
  check("pin template created", pinTpl.status === 201, pinTpl.data);
  const pinId = pinTpl.data.template.id as number;
  const draftBody = (description: string, templateId?: number) => ({
    clientId,
    templateId,
    issueDate: "2026-07-01",
    dueDate: "2026-07-31",
    terms: "Net 30",
    items: [{ description, quantity: 1, unitPrice: 10 }],
  });
  const pinnedInv = await http("POST", "/invoices", draftBody("Pinned line", pinId));
  check(
    "invoice pinned to template",
    pinnedInv.status === 201 && Number(pinnedInv.data.invoice.template_id) === Number(pinId),
    pinnedInv.data.invoice?.template_id,
  );
  const pinnedDetail = await http("GET", `/invoices/${pinnedInv.data.invoice.id}`);
  check(
    "detail serves the pinned template",
    pinnedDetail.data.template?.accent === "#0000ff",
    pinnedDetail.data.template?.accent,
  );
  const unpinnedInv = await http("POST", "/invoices", draftBody("Unpinned line"));
  const unpinnedDetail = await http("GET", `/invoices/${unpinnedInv.data.invoice.id}`);
  check(
    "no pin → active template served",
    unpinnedInv.data.invoice.template_id === null &&
      unpinnedDetail.data.template?.accent === activeBefore.settings.accent,
    unpinnedDetail.data.template?.accent,
  );
  const staleInv = await http("POST", "/invoices", draftBody("Stale line", 99_999_999));
  check(
    "stale templateId stored as null",
    staleInv.status === 201 && staleInv.data.invoice.template_id === null,
    staleInv.data.invoice?.template_id,
  );
  const delPin = await http("DELETE", `/templates/${pinId}`);
  check("pinned template deletable", delPin.status === 200);
  const afterDelPin = await http("GET", `/invoices/${pinnedInv.data.invoice.id}`);
  check(
    "invoice unpins when its template is deleted",
    afterDelPin.data.invoice.template_id === null,
    afterDelPin.data.invoice.template_id,
  );
  for (const d of [pinnedInv, unpinnedInv, staleInv]) {
    await http("DELETE", `/invoices/${d.data.invoice.id}`);
  }

  console.log("smoke: template settings");
  const tplDefault = await http("GET", "/settings/template");
  check("template defaults", tplDefault.data.template.documentTitle === "INVOICE");
  const tplSaved = await http("PUT", "/settings/template", {
    ...tplDefault.data.template,
    orgName: "Smoke Org",
    accent: "#123456",
    layout: "compact",
  });
  check("template saved", tplSaved.data.template.orgName === "Smoke Org");
  const tplBack = await http("GET", "/settings/template");
  check("template persisted", tplBack.data.template.accent === "#123456" && tplBack.data.template.layout === "compact");
  // restore defaults so a real user's settings aren't affected (only if none existed before — smoke assumes fresh key or acceptable reset)
  await http("PUT", "/settings/template", tplDefault.data.template);

  console.log("smoke: global branding");
  const brand0 = await http("GET", "/settings/template");
  const bareTpl = await http("POST", "/templates", { name: "Smoke Bare Tpl", settings: {} });
  check(
    "template created without branding inherits global logo/name",
    bareTpl.status === 201 &&
      bareTpl.data.template.settings.orgName === brand0.data.template.orgName &&
      bareTpl.data.template.settings.logoDataUrl === brand0.data.template.logoDataUrl,
    bareTpl.data.template?.settings?.orgName,
  );
  await http("PUT", "/settings/template", { ...brand0.data.template, orgName: "Smoke Global Org" });
  const galAfterBrand = await http("GET", "/templates");
  check(
    "branding edit propagates to every template",
    galAfterBrand.data.templates.every(
      (t: { settings: { orgName: string } }) => t.settings.orgName === "Smoke Global Org",
    ),
    galAfterBrand.data.templates.map((t: { settings: { orgName: string } }) => t.settings.orgName),
  );
  await http("PUT", "/settings/template", brand0.data.template); // restore branding
  await http("DELETE", `/templates/${bareTpl.data.template.id}`);
  // The dedicated branding endpoints (Settings → General → Organization profile).
  const bGet = await http("GET", "/settings/branding");
  check(
    "branding endpoint serves the profile",
    bGet.status === 200 && typeof bGet.data.branding.logoDataUrl === "string",
    bGet.data,
  );
  const bPut = await http("PUT", "/settings/branding", {
    ...bGet.data.branding,
    orgName: "Smoke Branding Org",
  });
  check("branding endpoint saves", bPut.data.branding.orgName === "Smoke Branding Org", bPut.data);
  const tplAfterBrand = await http("GET", "/settings/template");
  check(
    "branding endpoint edit reaches templates",
    tplAfterBrand.data.template.orgName === "Smoke Branding Org",
    tplAfterBrand.data.template.orgName,
  );
  await http("PUT", "/settings/branding", bGet.data.branding); // restore

  console.log("smoke: cleanup");
  await query(`DELETE FROM invoices WHERE id = $1`, [invoiceId]); // cascades items+payments
  await query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await query(`DELETE FROM users WHERE email = $1`, [EMAIL]);
  // remove the smoke payment term from the stored custom list
  const stored = await query<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'custom_payment_terms'`,
  );
  if (stored.rows[0]?.value) {
    const kept = JSON.parse(stored.rows[0].value).filter(
      (t: { name: string }) => t.name !== termName,
    );
    await query(`UPDATE app_settings SET value = $1 WHERE key = 'custom_payment_terms'`, [
      JSON.stringify(kept),
    ]);
  }
  const gone = await http("GET", `/invoices/${invoiceId}`);
  check("cleanup verified", gone.status === 404);

  await pool.end();
  console.log(failures === 0 ? "\nSMOKE PASS — all checks green" : `\nSMOKE FAIL — ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("smoke crashed:", err);
  try {
    await query(`DELETE FROM users WHERE email = $1`, [EMAIL]);
    await pool.end();
  } catch { /* ignore */ }
  process.exit(1);
});
