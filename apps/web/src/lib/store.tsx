import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------
 * In-memory billing store, seeded with demo data. Every page reads
 * and mutates this through useBilling(), so the whole app is
 * functional today; swapping the internals for the real API later
 * doesn't change any page code.
 * ------------------------------------------------------------------ */

export type InvoiceStatus = "draft" | "due" | "partial" | "paid" | "overdue";

export interface Line {
  item: string;
  qty: number;
  price: number;
}

export interface Customer {
  id: string;
  name: string;
  type: "Wholesale" | "Retail";
  terms: string;
  city: string;
  lifetime: number;
  avgPayDays: number;
  dotBg: string;
  dotFg: string;
}

export interface Invoice {
  id: string; // "INV-2607"
  customerId: string;
  status: InvoiceStatus;
  issued: string | null; // ISO date; null while draft
  due: string | null;
  terms: string;
  lines: Line[];
  discountPct: number;
  taxPct: number;
  note: string;
  paidAmount: number;
}

export interface Activity {
  id: number;
  dot: string; // CSS color
  parts: Array<{ b?: boolean; t: string }>;
  time: string;
}

export const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const moneyK = (n: number) =>
  n >= 1000 ? "$" + (n / 1000).toFixed(1) + "k" : money(n);

export function invoiceTotals(inv: Pick<Invoice, "lines" | "discountPct" | "taxPct">) {
  const sub = inv.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const disc = (sub * inv.discountPct) / 100;
  const tax = ((sub - disc) * inv.taxPct) / 100;
  return { sub, disc, tax, grand: sub - disc + tax };
}

export function invoiceBalance(inv: Invoice): number {
  return Math.max(0, invoiceTotals(inv).grand - inv.paidAmount);
}

export const fmtShort = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};
export const fmtLong = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const DOT_PALETTE: Array<[string, string]> = [
  ["var(--green-soft)", "var(--green)"],
  ["var(--brass-soft)", "var(--brass)"],
  ["#E5E9F5", "#5B6FA8"],
  ["var(--red-soft)", "var(--red)"],
];

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* --------------------------- Seed data --------------------------- */

const seedCustomers: Customer[] = [
  { id: "sable", name: "Sable Roasters", type: "Wholesale", terms: "Net 45", city: "Portland, OR", lifetime: 142300, avgPayDays: 31, dotBg: "var(--green-soft)", dotFg: "var(--green)" },
  { id: "grove", name: "Grove Grocers", type: "Wholesale", terms: "Net 30", city: "Austin, TX", lifetime: 96400, avgPayDays: 22, dotBg: "var(--green-soft)", dotFg: "var(--green)" },
  { id: "northside", name: "Northside Markets", type: "Wholesale", terms: "Net 30", city: "Chicago, IL", lifetime: 61000, avgPayDays: 27, dotBg: "#E5E9F5", dotFg: "#5B6FA8" },
  { id: "harbor", name: "Harbor Deli Co.", type: "Wholesale", terms: "Net 30", city: "Seattle, WA", lifetime: 28700, avgPayDays: 41, dotBg: "var(--red-soft)", dotFg: "var(--red)" },
  { id: "pantry", name: "Pantry & Pour", type: "Retail", terms: "Net 15", city: "Denver, CO", lifetime: 14900, avgPayDays: 19, dotBg: "#E5E9F5", dotFg: "#5B6FA8" },
  { id: "botanica", name: "Café Botanica", type: "Retail", terms: "Net 15", city: "Miami, FL", lifetime: 22100, avgPayDays: 9, dotBg: "var(--brass-soft)", dotFg: "var(--brass)" },
];

const one = (item: string, total: number): Line[] => [{ item, qty: 1, price: total }];

const seedInvoices: Invoice[] = [
  {
    id: "INV-2608", customerId: "sable", status: "draft", issued: null, due: null, terms: "Net 45",
    lines: [
      { item: "Syruvia Vanilla Syrup 750ml — case of 12", qty: 8, price: 118.8 },
      { item: "Syruvia Hazelnut Syrup 750ml — case of 12", qty: 6, price: 118.8 },
      { item: "Syruvia Caramel Stick Pouch 15ml — box of 100", qty: 12, price: 64.0 },
    ],
    discountPct: 5, taxPct: 9,
    note: "Thank you for stocking Syruvia. Pallet ships from SG warehouse within 3 working days.",
    paidAmount: 0,
  },
  { id: "INV-2607", customerId: "grove", status: "due", issued: "2026-07-05", due: "2026-08-04", terms: "Net 30", lines: one("Monthly syrup order — mixed pallet", 4860), discountPct: 0, taxPct: 0, note: "", paidAmount: 0 },
  { id: "INV-2606", customerId: "botanica", status: "paid", issued: "2026-07-03", due: "2026-07-18", terms: "Net 15", lines: one("Café retail assortment — summer", 1215.5), discountPct: 0, taxPct: 0, note: "", paidAmount: 1215.5 },
  { id: "INV-2605", customerId: "northside", status: "partial", issued: "2026-06-28", due: "2026-07-28", terms: "Net 30", lines: one("Store rollout — endcap displays + stock", 7340), discountPct: 0, taxPct: 0, note: "", paidAmount: 3000 },
  { id: "INV-2601", customerId: "harbor", status: "overdue", issued: "2026-06-12", due: "2026-07-12", terms: "Net 30", lines: one("Deli syrup + pouch resupply", 3112), discountPct: 0, taxPct: 0, note: "", paidAmount: 0 },
  { id: "INV-2599", customerId: "sable", status: "due", issued: "2026-06-10", due: "2026-07-25", terms: "Net 45", lines: one("Quarterly roastery contract — Q3 pallet", 12480), discountPct: 0, taxPct: 0, note: "", paidAmount: 0 },
  { id: "INV-2594", customerId: "pantry", status: "overdue", issued: "2026-05-30", due: "2026-06-14", terms: "Net 15", lines: one("Retail starter bundle", 2204), discountPct: 0, taxPct: 0, note: "", paidAmount: 0 },
  { id: "INV-2590", customerId: "grove", status: "paid", issued: "2026-05-05", due: "2026-06-04", terms: "Net 30", lines: one("Monthly syrup order — mixed pallet", 4610), discountPct: 0, taxPct: 0, note: "", paidAmount: 4610 },
];

const seedActivity: Activity[] = [
  { id: 5, dot: "var(--green)", parts: [{ b: true, t: "Café Botanica" }, { t: " paid INV-2606 in full — $1,215.50 via card." }], time: "Today · 11:42" },
  { id: 4, dot: "var(--brass)", parts: [{ t: "Reminder sent to " }, { b: true, t: "Harbor Deli Co." }, { t: " for INV-2601 (25 days overdue)." }], time: "Today · 09:00" },
  { id: 3, dot: "#5B6FA8", parts: [{ b: true, t: "Northside Markets" }, { t: " made a partial payment of $3,000.00 on INV-2605." }], time: "Yesterday · 16:20" },
  { id: 2, dot: "var(--green)", parts: [{ t: "Recurring invoice " }, { b: true, t: "INV-2607" }, { t: " issued to Grove Grocers (monthly syrup order)." }], time: "Jul 05 · 08:00" },
  { id: 1, dot: "var(--mut-2)", parts: [{ t: "Draft " }, { b: true, t: "INV-2608" }, { t: " created for Sable Roasters — awaiting review." }], time: "Jul 04 · 14:05" },
];

/* Reports: invoiced (in $k) and share collected, Feb–Jul. */
export const MONTHLY = [
  { label: "Feb", invoiced: 29.4, collectedShare: 0.88 },
  { label: "Mar", invoiced: 32.6, collectedShare: 0.92 },
  { label: "Apr", invoiced: 26.1, collectedShare: 0.95 },
  { label: "May", invoiced: 36.0, collectedShare: 0.84 },
  { label: "Jun", invoiced: 33.5, collectedShare: 0.81 },
  { label: "Jul", invoiced: 39.7, collectedShare: 0.8 },
];

/* ----------------------------- Store ----------------------------- */

interface BillingState {
  customers: Customer[];
  invoices: Invoice[];
  activity: Activity[];
  nextInvoiceId: () => string;
  saveInvoice: (inv: Invoice, opts?: { announce?: string }) => void;
  addCustomer: (c: Omit<Customer, "id" | "dotBg" | "dotFg" | "lifetime" | "avgPayDays">) => void;
  logActivity: (dot: string, parts: Activity["parts"]) => void;
}

const Ctx = createContext<BillingState | undefined>(undefined);

function nowStamp(): string {
  return (
    "Today · " +
    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export function BillingProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState(seedCustomers);
  const [invoices, setInvoices] = useState(seedInvoices);
  const [activity, setActivity] = useState(seedActivity);

  const value = useMemo<BillingState>(() => {
    const nextInvoiceId = () => {
      const max = invoices.reduce((m, i) => Math.max(m, Number(i.id.split("-")[1]) || 0), 0);
      return `INV-${max + 1}`;
    };

    const logActivity = (dot: string, parts: Activity["parts"]) => {
      setActivity((cur) => [
        { id: (cur[0]?.id ?? 0) + 1, dot, parts, time: nowStamp() },
        ...cur,
      ]);
    };

    const saveInvoice: BillingState["saveInvoice"] = (inv) => {
      setInvoices((cur) => {
        const idx = cur.findIndex((i) => i.id === inv.id);
        if (idx >= 0) {
          const copy = [...cur];
          copy[idx] = inv;
          return copy;
        }
        return [inv, ...cur];
      });
    };

    const addCustomer: BillingState["addCustomer"] = (c) => {
      const [dotBg, dotFg] = DOT_PALETTE[customers.length % DOT_PALETTE.length];
      setCustomers((cur) => [
        ...cur,
        {
          ...c,
          id: c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + (cur.length + 1),
          dotBg,
          dotFg,
          lifetime: 0,
          avgPayDays: 0,
        },
      ]);
    };

    return { customers, invoices, activity, nextInvoiceId, saveInvoice, addCustomer, logActivity };
  }, [customers, invoices, activity]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBilling(): BillingState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBilling must be used within BillingProvider");
  return ctx;
}

export function customerOf(customers: Customer[], id: string): Customer {
  return (
    customers.find((c) => c.id === id) ?? {
      id,
      name: "Unknown",
      type: "Wholesale",
      terms: "Net 30",
      city: "",
      lifetime: 0,
      avgPayDays: 0,
      dotBg: "var(--line-soft)",
      dotFg: "var(--mut)",
    }
  );
}

/** Days between an ISO date and today (positive = past). */
export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86_400_000);
}
