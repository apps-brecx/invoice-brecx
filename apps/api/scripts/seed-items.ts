/**
 * Seed Zoho-screenshot-style demo ITEMS through the running API.
 * Usage: API up on :4000, then from apps/api:
 *   pnpm exec tsx scripts/seed-items.ts
 * Idempotent: items are matched by name and skipped if they exist.
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

const syrup = (flavor: string, sku: string, price: number, unit = "pcs") => ({
  name: `Syruvia ${flavor}`,
  type: "Goods",
  unit,
  sellingPrice: price,
  description: `Syrup 750 ml\nSKU: ${sku}`,
});

const ITEMS = [
  {
    name: "Fresh Finest Brown Sugar Flavored Boba Pearls for Boba Tea 10 oz",
    type: "Goods",
    unit: "pcs",
    sellingPrice: 2.0,
    description: "Tapioca Pearls\nSKU: FF-69464",
  },
  {
    name: "Homeify Cleaner Pen",
    type: "Goods",
    unit: "pcs",
    sellingPrice: 2.5,
    description: "Cleaner Pen\nSKU: BC-4641",
  },
  {
    name: "Homeify Neck pillow set",
    type: "Goods",
    unit: "pcs",
    sellingPrice: 1.0,
    description: "Neck pillow set\nSKU: HF-8309",
  },
  {
    name: "Popping Boba",
    type: "Goods",
    unit: "pcs",
    sellingPrice: 15.99,
    description: "7 LB Tubs",
  },
  syrup("Suger Free Vanilla", "SY-5505", 2.27),
  syrup("Almond", "SY-5640", 18.3, "box"),
  syrup("Banana Nut", "SY-5685", 3.0),
  syrup("Blackberry", "SY-5538", 4.0),
  syrup("Blue Curacao", "SY-5541", 18.3, "box"),
  syrup("Blue Raspberry", "SY-5525", 18.3, "box"),
  syrup("Blueberry", "SY-5539", 3.0),
  {
    name: "Syruvia Blueberry Flavored, 1 LB",
    type: "Goods",
    unit: "box",
    sellingPrice: 39.96,
    description: "Popping Boba\nSKU: BB-5717",
  },
  {
    name: "Syruvia Blueberry Flavored, 2 LB",
    type: "Goods",
    unit: "box",
    sellingPrice: 58.92,
    description: "Popping Boba\nSKU: BB-5713",
  },
  {
    name: "Syruvia Blueberry Popping Boba",
    type: "Goods",
    unit: "pcs",
    sellingPrice: 15.99,
    description: "7 lb tub\nSKU: BB-5733",
  },
  syrup("Brown Sugar Cinnamon", "SY-5514", 4.0),
  syrup("Butter Pecan", "SY-5593", 4.0),
  syrup("Butterscotch", "SY-5542", 18.3, "box"),
  syrup("Lavender", "SY-5503", 3.65),
  syrup("Strawberry Flavored, 1 LB", "BB-5719", 3.75),
  syrup("Mango Flavored, 1 LB", "BB-5721", 3.75),
];

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD missing from .env");
  await call("/auth/sign-in", "POST", { email: EMAIL, password: PASSWORD });
  console.log("signed in as", EMAIL);

  const { items } = await call("/items");
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const existing = new Set(items.map((i: any) => String(i.name).toLowerCase()));

  let created = 0;
  for (const it of ITEMS) {
    if (existing.has(it.name.toLowerCase())) {
      console.log("exists, skipping:", it.name);
      continue;
    }
    await call("/items", "POST", it);
    created++;
    console.log("created:", it.name);
  }
  console.log(`done — ${created} created, ${ITEMS.length - created} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
