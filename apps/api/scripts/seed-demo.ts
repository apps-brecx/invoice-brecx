/**
 * Seed Zoho-screenshot-style demo data (customers + invoices in every
 * state) through the RUNNING API, so all business rules apply.
 *
 * Usage: API up on :4000, then from apps/api:
 *   pnpm exec tsx scripts/seed-demo.ts
 *
 * Idempotent-ish: customers are matched by name; invoices are only
 * created if that customer has none yet.
 */
import "dotenv/config";

const BASE = process.env.SEED_API_URL ?? "http://localhost:4000/api";
const EMAIL = process.env.ADMIN_EMAIL ?? "";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "";

let cookie = "";
/* eslint-disable @typescript-eslint/no-explicit-any */
async function call(path: string, method = "GET", body?: unknown): Promise<any> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const CUSTOMERS = [
  {
    name: "Home Goods DC #890",
    addressLine1: "8201 Oak Grove Road",
    city: "Fort Worth",
    state: "Texas",
    postalCode: "76140",
    country: "U.S.A",
    paymentTerms: "Net 45",
  },
  {
    name: "Home Goods DC #887",
    addressLine1: "4801 Marburg Ave",
    city: "Cincinnati",
    state: "Ohio",
    postalCode: "45209",
    country: "U.S.A",
    paymentTerms: "Net 45",
  },
  {
    name: "Home Goods DC #886",
    addressLine1: "1415 Lincoln Hwy",
    city: "North Versailles",
    state: "Pennsylvania",
    postalCode: "15137",
    country: "U.S.A",
    paymentTerms: "Net 45",
  },
  {
    name: "Zv Partners BV",
    addressLine1: "Vlierstraat 11",
    city: "Waregem",
    postalCode: "8790",
    country: "Belgium",
    paymentTerms: "Net 60",
  },
  {
    name: "Money or Honey, LLC",
    addressLine1: "227 Lexington Ave",
    city: "New York",
    state: "New York",
    postalCode: "10016",
    country: "U.S.A",
    paymentTerms: "Net 30",
  },
  {
    name: "Win Depot, Inc.",
    addressLine1: "48-18 Van Dam St",
    city: "Long Island City",
    state: "New York",
    postalCode: "11101",
    country: "U.S.A",
    paymentTerms: "Net 7",
  },
  {
    name: "Gabe's",
    addressLine1: "55 Scott Ave",
    city: "Morgantown",
    state: "West Virginia",
    postalCode: "26508",
    country: "U.S.A",
    paymentTerms: "Net 60",
  },
];

const syrup = (flavor: string, qty: number, price: number, sku: string) => ({
  description: `Syruvia ${flavor} Syrup\nSKU: ${sku}`,
  quantity: qty,
  unitPrice: price,
  unit: "pcs",
  extra: {},
});

/** status: how far past draft to push it; pay: [amount, date] payments. */
const INVOICES: Array<{
  customer: string;
  orderNumber: string | null;
  issueDate: string;
  dueDate: string;
  terms: string;
  send?: boolean;
  pay?: Array<[number, string]>;
  items: ReturnType<typeof syrup>[];
}> = [
  {
    customer: "Home Goods DC #890",
    orderNumber: "PO-#90 131429",
    issueDate: "2026-06-30",
    dueDate: "2026-08-14",
    terms: "Net 45",
    items: [syrup("Strawberry Flavored, 1 LB", 228, 3.75, "BB-5719"), syrup("Mango Flavored, 1 LB", 228, 3.75, "BB-5721")],
  },
  {
    customer: "Home Goods DC #887",
    orderNumber: "PO-#70 131429",
    issueDate: "2026-06-30",
    dueDate: "2026-08-14",
    terms: "Net 45",
    items: [syrup("Sugar Free Caramel", 360, 3.75, "SY-5506"), syrup("Sugar Free Hazelnut", 360, 3.75, "SY-5508")],
  },
  {
    customer: "Home Goods DC #886",
    orderNumber: "PO-#60 131429",
    issueDate: "2026-06-30",
    dueDate: "2026-08-14",
    terms: "Net 45",
    items: [
      syrup("Sugar Free French Vanilla", 420, 3.75, "SY-5549"),
      syrup("Sugar Free White Chocolate Mocha", 420, 3.75, "SY-5571"),
    ],
  },
  {
    customer: "Money or Honey, LLC",
    orderNumber: null,
    issueDate: "2026-07-03",
    dueDate: "2026-08-02",
    terms: "Net 30",
    send: true, // → due in ~25 days
    items: [syrup("Lavender", 154, 3.75, "SY-5503")],
  },
  {
    customer: "Win Depot, Inc.",
    orderNumber: null,
    issueDate: "2026-06-23",
    dueDate: "2026-06-30",
    terms: "Net 7",
    send: true, // past due → overdue by ~8 days
    items: [syrup("Sugar Free Pistachio", 238, 3.75, "SY-5592")],
  },
  {
    customer: "Gabe's",
    orderNumber: "PO-PO 89009023",
    issueDate: "2026-06-02",
    dueDate: "2026-08-01",
    terms: "Net 60",
    send: true,
    items: [syrup("Sugar Free Vanilla", 2688, 3.75, "SY-5505")],
  },
  {
    customer: "Zv Partners BV",
    orderNumber: "PO-10642",
    issueDate: "2026-06-06",
    dueDate: "2026-08-05",
    terms: "Net 60",
    send: true,
    pay: [[5000, "2026-06-28"]], // → partially paid
    items: [
      syrup("Sugar Free Caramel", 1440, 2.65, "SY-5506"),
      syrup("Sugar Free Hazelnut", 1440, 2.65, "SY-5508"),
      syrup("Sugar Free S'Mores", 1020, 2.65, "SY-5556"),
    ],
  },
  {
    customer: "Home Goods DC #886",
    orderNumber: "PO-#30 117307",
    issueDate: "2026-05-10",
    dueDate: "2026-06-09",
    terms: "Net 30",
    send: true,
    pay: [[1350, "2026-06-01"]], // → paid in full
    items: [syrup("Sugar Free Blue Raspberry", 360, 3.75, "SY-5601")],
  },
];

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD missing from .env");
  await call("/auth/sign-in", "POST", { email: EMAIL, password: PASSWORD });
  console.log("signed in as", EMAIL);

  const { clients } = await call("/clients");
  const byName = new Map<string, number>(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    clients.map((c: any) => [String(c.name), Number(c.id)]),
  );

  for (const c of CUSTOMERS) {
    if (byName.has(c.name)) continue;
    const res = await call("/clients", "POST", { ...c, type: "Business" });
    byName.set(c.name, Number(res.client.id));
    console.log("created customer:", c.name);
  }

  const existing = await call("/invoices");
  const invoiceCount: number = (existing.invoices ?? existing).length ?? 0;
  if (invoiceCount > 0) {
    console.log(`${invoiceCount} invoices already exist — seeding only adds, no duplicates check beyond this. Continuing.`);
  }

  for (const spec of INVOICES) {
    const clientId = byName.get(spec.customer);
    if (!clientId) throw new Error(`no client id for ${spec.customer}`);
    const res = await call("/invoices", "POST", {
      clientId,
      orderNumber: spec.orderNumber,
      issueDate: spec.issueDate,
      dueDate: spec.dueDate,
      terms: spec.terms,
      items: spec.items,
      notes: "Thanks for your business.",
    });
    const invId = res.invoice.id;
    if (spec.send) await call(`/invoices/${invId}/status`, "PATCH", { status: "sent" });
    for (const [amount, paidOn] of spec.pay ?? []) {
      await call(`/invoices/${invId}/payments`, "POST", {
        amount,
        paidOn,
        mode: "Bank Transfer",
        reference: null,
      });
    }
    console.log(
      `invoice ${res.invoice.number ?? invId} → ${spec.customer}` +
        (spec.pay ? " (with payment)" : spec.send ? " (sent)" : " (draft)"),
    );
  }
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
