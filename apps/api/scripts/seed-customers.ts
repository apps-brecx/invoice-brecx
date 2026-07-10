/** One-off: enrich the seeded demo customers with emails, phones and
 *  Zoho-style contact persons so the Customers page has real-looking data.
 *  Run from apps/api: pnpm exec tsx scripts/seed-customers.ts */
import { initSchema, query, pool } from "../src/db.js";

const cp = (salutation: string, firstName: string, lastName: string, email: string, mobile: string) => ({
  salutation,
  firstName,
  lastName,
  email,
  workPhone: "",
  mobile,
});

const DATA: Array<{ name: string; email: string; phone: string; persons: object[] }> = [
  {
    name: "Home Goods DC #890",
    email: "ap890@example.com",
    phone: "+1 817-551-0290",
    persons: [cp("Ms.", "Karen", "Whitfield", "karen.w@example.com", "+1 817-551-0291")],
  },
  {
    name: "Home Goods DC #887",
    email: "ap887@example.com",
    phone: "+1 513-651-0287",
    persons: [],
  },
  {
    name: "Home Goods DC #886",
    email: "ap886@example.com",
    phone: "+1 412-829-0286",
    persons: [],
  },
  {
    name: "Zv Partners BV",
    email: "kais@example.com",
    phone: "+32 493 84 04 57",
    persons: [cp("Mr.", "Kaïs", "Zahaf", "kais@example.com", "+32 493 84 04 57")],
  },
  {
    name: "Money or Honey, LLC",
    email: "orders@example.com",
    phone: "+1 212-683-1122",
    persons: [cp("Mrs.", "Dana", "Kessler", "dana@example.com", "+1 212-683-1123")],
  },
  {
    name: "Win Depot, Inc.",
    email: "purchasing@example.com",
    phone: "+1 718-472-5500",
    persons: [],
  },
  {
    name: "Gabe's",
    email: "GabrielAP@example.com",
    phone: "+1 304-292-6965",
    persons: [cp("Mr.", "Gabriel", "Stone", "GabrielAP@example.com", "+1 304-292-6966")],
  },
];

await initSchema();
for (const d of DATA) {
  const { rowCount } = await query(
    `UPDATE clients SET email = COALESCE(email, $2), phone = COALESCE(phone, $3),
            contact_persons = $4::jsonb, updated_at = NOW()
      WHERE name = $1`,
    [d.name, d.email, d.phone, JSON.stringify(d.persons)],
  );
  console.log(rowCount ? "updated" : "NOT FOUND", "—", d.name);
}
await pool.end();
console.log("done.");
